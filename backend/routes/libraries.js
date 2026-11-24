// Arduino libraries on the compile server, shared by everyone who compiles here:
//   GET  /api/libs                 installed libraries
//   GET  /api/libs/search?q=servo  search the official Arduino library index
//   POST /api/libs/install         { name, version? }  install one (from the index only)
// Installs are remembered in Settings ("installed_libraries") and reinstalled when the server
// starts, because a Hugging Face Space loses its disk on every restart.
const { spawn } = require('child_process');

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.+-]{0,63}$/;
const VERSION_PATTERN = /^[0-9][0-9A-Za-z.+-]{0,31}$/;
const MAX_LIBRARIES = 250;
const INSTALLS_PER_HOUR = 20;

function cli(args, timeoutMs = 120000) {
    return new Promise((resolve) => {
        let out = '', err = '';
        let child;
        try { child = spawn('arduino-cli', args); } catch (e) { return resolve({ code: -1, out: '', err: e.message }); }
        const timer = setTimeout(() => { child.kill('SIGKILL'); err += '\ntimed out'; }, timeoutMs);
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { err += d; });
        child.on('error', e => { err += e.message; });
        child.on('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
    });
}

module.exports = function libraries(app, { Settings, mongoose }) {
    let indexFresh = 0;
    let installing = Promise.resolve();
    const recent = new Map(); // ip -> install timestamps

    async function updateIndex() {
        if (Date.now() - indexFresh < 6 * 60 * 60 * 1000) return;
        const r = await cli(['lib', 'update-index'], 180000);
        if (r.code === 0) indexFresh = Date.now();
    }
    const dbReady = () => mongoose.connection.readyState === 1;
    async function remembered() {
        if (!dbReady()) return [];
        const s = await Settings.findOne({ key: 'installed_libraries' }).lean();
        return Array.isArray(s && s.value) ? s.value : [];
    }
    async function remember(name, version) {
        if (!dbReady()) return;
        const list = (await remembered()).filter(l => l.name !== name);
        list.push({ name, version: version || null, at: new Date().toISOString() });
        await Settings.findOneAndUpdate({ key: 'installed_libraries' }, { value: list }, { upsert: true });
    }
    // One install at a time: arduino-cli locks its directories
    const queue = (fn) => { const run = installing.then(fn, fn); installing = run.catch(() => { }); return run; };

    app.get('/api/libs', async (req, res) => {
        const r = await cli(['lib', 'list', '--format', 'json'], 60000);
        if (r.code !== 0) return res.status(503).json({ error: 'The compile server can\'t list libraries right now.' });
        let data = [];
        try { const j = JSON.parse(r.out || '{}'); data = j.installed_libraries || j || []; } catch { }
        res.json((Array.isArray(data) ? data : []).map(x => {
            const lib = x.library || x;
            return { name: lib.name, version: lib.version, sentence: lib.sentence || '', includes: lib.provides_includes || [] };
        }).filter(x => x.name).sort((a, b) => a.name.localeCompare(b.name)));
    });

    app.get('/api/libs/search', async (req, res) => {
        const q = String(req.query.q || '').trim().slice(0, 60);
        if (q.length < 2) return res.json([]);
        await updateIndex();
        const r = await cli(['lib', 'search', ...q.split(/\s+/).slice(0, 4), '--format', 'json'], 60000);
        if (r.code !== 0) return res.status(503).json({ error: 'Library search isn\'t available right now.' });
        let libs = [];
        try { libs = (JSON.parse(r.out || '{}').libraries) || []; } catch { }
        const ql = q.toLowerCase();
        const score = (l) => (l.name.toLowerCase() === ql ? 0 : l.name.toLowerCase().startsWith(ql) ? 1 : l.name.toLowerCase().includes(ql) ? 2 : 3);
        res.json(libs.sort((a, b) => score(a) - score(b)).slice(0, 30).map(l => {
            const latest = l.latest || (l.releases && l.releases[l.latest_version]) || {};
            return {
                name: l.name,
                version: latest.version || l.latest_version || '',
                sentence: latest.sentence || '',
                author: latest.author || '',
                includes: latest.provides_includes || []
            };
        }));
    });

    app.post('/api/libs/install', async (req, res) => {
        const name = String((req.body && req.body.name) || '').trim();
        const version = req.body && req.body.version ? String(req.body.version).trim() : '';
        if (!NAME_PATTERN.test(name)) return res.status(400).json({ error: 'That isn\'t a library name.' });
        if (version && !VERSION_PATTERN.test(version)) return res.status(400).json({ error: 'That isn\'t a version number.' });
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
        const now = Date.now();
        const mine = (recent.get(ip) || []).filter(t => now - t < 3600000);
        if (mine.length >= INSTALLS_PER_HOUR) return res.status(429).json({ error: 'Too many installs from here — try again in an hour.' });
        const known = await remembered();
        if (known.length >= MAX_LIBRARIES && !known.some(l => l.name === name)) return res.status(507).json({ error: 'The server has as many libraries as it can hold. Ask an admin to tidy up.' });
        mine.push(now); recent.set(ip, mine);
        await updateIndex();
        const r = await queue(() => cli(['lib', 'install', version ? `${name}@${version}` : name], 240000));
        const log = (r.out + r.err).trim().split('\n').slice(-8).join('\n');
        if (r.code !== 0) return res.status(400).json({ error: /not found/i.test(log) ? `No library called "${name}" in the Arduino library index.` : 'Install failed.', log });
        await remember(name, version).catch(() => { });
        res.json({ ok: true, name, version: version || null, log });
    });

    // Put back the libraries people installed before the last restart
    return async function restoreLibraries() {
        const list = await remembered().catch(() => []);
        if (!list.length) return;
        await updateIndex();
        let ok = 0;
        for (const l of list) {
            if (!NAME_PATTERN.test(l.name)) continue;
            const r = await queue(() => cli(['lib', 'install', l.version ? `${l.name}@${l.version}` : l.name], 240000));
            if (r.code === 0) ok++;
        }
        console.log(`Libraries: reinstalled ${ok}/${list.length} from before the restart`);
    };
};
