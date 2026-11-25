// The simulator page: circuit editor, world view, serial monitor, remote and part inspector.
// Embedded (HyperClass, IoIoT editor) it talks to its parent with postMessage:
//   in:  { type: 'load', code, project, template, theme, autorun, showEditor, title, chrome }  { type: 'code', code }  { type: 'theme', theme }
//        { type: 'run' }  { type: 'stop' }  { type: 'example', id }  { type: 'serial-in', text }
//   out: { type: 'sim-ready', examples }  { type: 'sim-project', project }  { type: 'sim-code', code }  { type: 'sim-status', running }
//        { type: 'sim-serial', text, kind }  { type: 'sim-serial-clear' }
// chrome: 'studio' hides the run bar, serial and code (the parent shows its own) and keeps the circuit,
// components, settings and remote.
(function () {
    const { CATALOG, GROUPS, esc } = window.SimParts;
    const { Board, makeApi, BOARD_PINS, LED_BUILTIN, BOOT_PIN, Stop } = window.SimRuntime;
    const { World } = window.SimWorld;
    const { PROJECTS } = window.SimProjects;
    const { transpile } = window.ArduinoTranspiler;

    const $ = (id) => document.getElementById(id);
    const embedded = window.parent && window.parent !== window;
    const BOARD = { w: 150, h: 340 };
    const WIRE_COLORS = ['#f08c00', '#2b9348', '#1971c2', '#7048e8', '#c2255c', '#0c8599', '#e8590c', '#5c940d'];

    const state = {
        project: null, code: '', running: false, selected: null, wiring: null, drag: null,
        theme: 'dark', showEditor: !embedded, sim: null, prefs: {}, response: null, title: '',
        studio: false, view: null, pan: null, adding: null
    };
    const world = new World('none');

    // ---------------- project ----------------
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function blankProject() { return { board: { x: 450, y: 170 }, world: 'none', parts: [], wires: [] }; }
    function fromTemplate(t) {
        return { board: { x: 450, y: 170 }, world: t.world, parts: clone(t.parts).map(p => ({ ...p, props: { ...CATALOG[p.type].props, ...p.props } })), wires: t.wires.map((w, i) => ({ id: 'w' + i, ...w, color: autoColor(w, i) })) };
    }
    function normalize(p) {
        const out = { ...blankProject(), ...(p || {}) };
        out.parts = (out.parts || []).filter(x => CATALOG[x.type]).map(x => ({ ...x, props: { ...CATALOG[x.type].props, ...(x.props || {}) } }));
        out.wires = (out.wires || []).filter(w => w && w.a && w.b).map((w, i) => ({ id: w.id || 'w' + i + Date.now(), ...w, color: w.color || autoColor(w, i) }));
        return out;
    }
    function pinLabelOf(key) {
        const [owner, pin] = key.split(':');
        if (owner === 'board') return /^\d+$/.test(pin) ? `GPIO${pin}` : pin;
        const part = state.project.parts.find(p => p.id === owner);
        if (!part) return key;
        const def = CATALOG[part.type];
        const pd = def.pins.find(x => x.id === pin);
        return `${def.label} · ${pd ? pd.label : pin}`;
    }
    function autoColor(w, i) {
        const names = [w.a, w.b].map(k => k.split(':')[1]);
        if (names.some(n => /^GND$|^K$|^N$/.test(n)) && names.some(n => /GND/.test(n))) return '#3b4048';
        if (names.some(n => n === 'GND')) return '#3b4048';
        if (names.some(n => /^(5V|3V3|VCC)$/.test(n))) return '#e03131';
        return WIRE_COLORS[i % WIRE_COLORS.length];
    }
    let saveTimer = null;
    function save() {
        saveTimer = null;
        commit();
        if (embedded) window.parent.postMessage({ type: 'sim-project', project: exportProject() }, '*');
        else try { localStorage.setItem('esp32sim.project', JSON.stringify(exportProject())); localStorage.setItem('esp32sim.code', state.code); } catch { }
    }
    function changed() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 400);
    }
    function exportProject() {
        const p = state.project;
        return { board: p.board, world: p.world, parts: p.parts.map(({ id, type, x, y, rot, props }) => ({ id, type, x, y, ...(rot ? { rot } : {}), props })), wires: p.wires.map(({ id, a, b, color }) => ({ id, a, b, color })) };
    }
    function loadProject(p) {
        stop();
        state.project = normalize(p);
        world.setType(state.project.world || 'none');
        $('world').value = world.type;
        state.selected = null;
        state.view = null;
        state.sim = new Board(host);
        hist.stack = [JSON.stringify(exportProject())]; hist.at = 0;
        renderAll();
    }

    // ---------------- undo / redo ----------------
    // Snapshots of the circuit, taken when a change settles (the same moment it is saved)
    const hist = { stack: [], at: -1 };
    function commit() {
        const snap = JSON.stringify(exportProject());
        if (hist.stack[hist.at] === snap) return;
        hist.stack = hist.stack.slice(0, hist.at + 1);
        hist.stack.push(snap);
        if (hist.stack.length > 100) hist.stack.shift();
        hist.at = hist.stack.length - 1;
        renderTools();
    }
    function undoRedo(step) {
        if (saveTimer) { clearTimeout(saveTimer); save(); }
        const at = hist.at + step;
        if (at < 0 || at >= hist.stack.length) return;
        hist.at = at;
        const p = normalize(JSON.parse(hist.stack[at]));
        state.project = p;
        if (world.type !== (p.world || 'none')) { world.setType(p.world || 'none'); $('world').value = world.type; }
        state.selected = null; state.wiring = null;
        if (state.sim) state.sim.markDirty();
        renderAll();
        if (embedded) window.parent.postMessage({ type: 'sim-project', project: exportProject() }, '*');
        else try { localStorage.setItem('esp32sim.project', JSON.stringify(exportProject())); } catch { }
    }

    // ---------------- rotation ----------------
    // Parts turn in steps of 90° about their centre (clockwise, as SVG's rotate() does)
    function turn(rot, x, y) {
        return rot === 90 ? [-y, x] : rot === 180 ? [-x, -y] : rot === 270 ? [y, -x] : [x, y];
    }
    function partPin(part, pd) {
        const def = CATALOG[part.type];
        const rot = part.rot || 0;
        const cx = def.w / 2, cy = def.h / 2;
        const [rx, ry] = turn(rot, pd.x - cx, pd.y - cy);
        let dx = pd.x <= 6 ? -1 : pd.x >= def.w - 6 ? 1 : 0;
        let dy = dx ? 0 : (pd.y >= def.h - 10 ? 1 : pd.y <= 8 ? -1 : 1);
        [dx, dy] = turn(rot, dx, dy);
        return { x: part.x + cx + rx, y: part.y + cy + ry, dx, dy };
    }
    function rotateSelected() {
        const sel = state.selected;
        if (!sel || sel.kind !== 'part') return;
        const part = state.project.parts.find(p => p.id === sel.id);
        if (!part) return;
        part.rot = ((part.rot || 0) + 90) % 360;
        if (state.sim) state.sim.markDirty();
        changed(); renderCircuit();
    }

    // ---------------- host for the runtime ----------------
    const host = {
        get project() { return state.project; },
        catalog: CATALOG,
        world,
        prefs: state.prefs,
        log: (text, kind) => serialOut(text, kind),
        onRemote: () => { remoteDirty = true; },
        onResponse: (r) => { state.response = r; remoteDirty = true; },
        restart: () => { setTimeout(() => run(), 50); }
    };
    let remoteDirty = true;

    // ---------------- serial ----------------
    let outLen = 0;
    function serialOut(text, kind) {
        if (state.studio) post({ type: 'sim-serial', text, kind: kind || '' });
        const out = $('out');
        const atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 30;
        const last = out.lastChild;
        if (last && last.dataset.kind === (kind || '') && last.textContent.length < 4000) last.textContent += text;
        else {
            const span = document.createElement('span');
            span.dataset.kind = kind || '';
            if (kind) span.className = kind;
            span.textContent = text;
            out.appendChild(span);
        }
        outLen += text.length;
        while (outLen > 80000 && out.firstChild) { outLen -= out.firstChild.textContent.length; out.removeChild(out.firstChild); }
        if (atBottom) out.scrollTop = out.scrollHeight;
    }

    // ---------------- running ----------------
    let runToken = 0;
    let lineOffset = null;
    function measureLineOffset(names) {
        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
        try { new AsyncFunction(...names, '"use strict";\nthrow new Error("probe");')(...names.map(() => null)).catch(e => { lineOffset = lineOf(e) - 1; }); } catch { }
    }
    function lineOf(e) {
        const m = /<anonymous>:(\d+):\d+/.exec(String(e && e.stack || ''));
        return m ? +m[1] : null;
    }
    async function run() {
        stop();
        const token = ++runToken;
        $('out').textContent = ''; outLen = 0;
        post({ type: 'sim-serial-clear' });
        state.sim = new Board(host);
        world.trail = [];
        const sim = state.sim;
        const { api, stop: stopApi } = makeApi(sim, host);
        state.stopApi = stopApi;
        let result;
        try { result = transpile(state.code); } catch (e) { setStatus('Could not read the sketch', 'err'); serialOut(`⚠ ${e.message}\n`, 'err'); return; }
        for (const w of result.warnings) serialOut(`${w}\n`, 'muted');
        const names = Object.keys(api);
        if (lineOffset === null) measureLineOffset(names);
        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
        let sketch;
        try {
            const factory = new AsyncFunction(...names, `"use strict";\n${result.js}\n;return { setup: typeof setup === 'function' ? setup : null, loop: typeof loop === 'function' ? loop : null };`);
            sketch = await factory(...names.map(n => api[n]));
        } catch (e) {
            setStatus('Error', 'err');
            serialOut(`⚠ ${friendly(e)}\n`, 'err');
            serialOut('The simulator understands most Arduino sketches (pins, Serial, delays, Servo, WiFi/WebServer, DHT). Check the brackets and semicolons near the line above.\n', 'muted');
            return;
        }
        if (!sketch.setup && !sketch.loop) { setStatus('No setup() or loop()', 'err'); return; }
        state.running = true;
        updateButtons();
        setStatus('Running', 'run');
        post({ type: 'sim-status', running: true });
        state.t0 = performance.now();
        try {
            if (sketch.setup) await sketch.setup();
            while (sketch.loop && token === runToken) { await sketch.loop(); await api.__yield(); }
            if (token === runToken) setStatus('Finished');
        } catch (e) {
            if (token !== runToken) return;
            if (e instanceof Stop || e.message === 'stopped') setStatus('Stopped');
            else { setStatus('Error', 'err'); serialOut(`\n⚠ ${friendly(e)}\n`, 'err'); }
        } finally {
            if (token === runToken) {
                state.running = false;
                updateButtons();
                post({ type: 'sim-status', running: false });
            }
        }
    }
    function friendly(e) {
        const line = lineOf(e);
        const at = line !== null && lineOffset !== null ? ` (line ${line - lineOffset})` : '';
        let msg = e && e.message ? e.message : String(e);
        msg = msg.replace(/^(\w+) is not defined$/, '"$1" isn\'t defined — check the spelling, or declare it first')
            .replace(/Unexpected token/, 'Unexpected symbol');
        return msg + at;
    }
    function stop() {
        runToken++;
        if (state.stopApi) state.stopApi();
        state.stopApi = null;
        if (state.running) { state.running = false; setStatus('Stopped'); post({ type: 'sim-status', running: false }); }
        updateButtons();
        sound(0);
    }
    function setStatus(text, kind) { const s = $('status'); s.textContent = text; s.className = 'status' + (kind ? ' ' + kind : ''); }
    function updateButtons() { $('run').disabled = false; $('run').textContent = state.running ? '↻ Restart' : '▶ Run'; $('stop').disabled = !state.running; }
    function post(msg) { if (embedded) window.parent.postMessage(msg, '*'); }

    // ---------------- sound for buzzers ----------------
    let audio = null, osc = null, gain = null, muted = false;
    function sound(freq) {
        if (muted || !freq) { if (gain) gain.gain.value = 0; return; }
        try {
            if (!audio) { audio = new (window.AudioContext || window.webkitAudioContext)(); osc = audio.createOscillator(); gain = audio.createGain(); osc.type = 'square'; osc.connect(gain); gain.connect(audio.destination); gain.gain.value = 0; osc.start(); }
            osc.frequency.value = Math.min(6000, Math.max(40, freq));
            gain.gain.value = 0.03;
        } catch { }
    }

    // ---------------- circuit drawing ----------------
    function boardPins() {
        const { x, y } = state.project.board;
        const pins = [];
        BOARD_PINS.left.forEach((n, i) => pins.push({ key: `board:${n}`, name: n, x: x + 10, y: y + 82 + i * 30, side: 'left' }));
        BOARD_PINS.right.forEach((n, i) => pins.push({ key: `board:${n}`, name: n, x: x + BOARD.w - 10, y: y + 82 + i * 30, side: 'right' }));
        return pins;
    }
    function pinPos(key) {
        const [owner, pin] = key.split(':');
        if (owner === 'board') { const p = boardPins().find(b => b.key === key); return p ? { x: p.x, y: p.y, dx: p.side === 'left' ? -1 : 1, dy: 0, board: true } : null; }
        const part = state.project.parts.find(p => p.id === owner);
        if (!part) return null;
        const pd = CATALOG[part.type].pins.find(x => x.id === pin);
        return pd ? partPin(part, pd) : null;
    }
    function wirePath(a, b) {
        // A board pin on the far side leaves the board along its top or bottom edge instead of crossing it
        if (a.board && b.board === undefined && Math.sign(b.x - a.x) !== a.dx) return detour(a, b);
        if (b.board && a.board === undefined && Math.sign(a.x - b.x) !== b.dx) return detour(b, a);
        const d = Math.max(36, Math.hypot(b.x - a.x, b.y - a.y) * 0.35);
        return `M${a.x},${a.y} C${a.x + a.dx * d},${a.y + a.dy * d} ${b.x + b.dx * d},${b.y + b.dy * d} ${b.x},${b.y}`;
    }
    function detour(pin, other) {
        const bd = state.project.board;
        const lane = (pin.y - bd.y) / BOARD.h < 0.5 ? bd.y - 14 - ((pin.y - bd.y) % 30) / 3 : bd.y + BOARD.h + 14 + ((pin.y - bd.y) % 30) / 3;
        const out = pin.x + pin.dx * 16;
        const across = pin.dx < 0 ? bd.x + BOARD.w + 16 : bd.x - 16;
        const d = Math.max(30, Math.hypot(other.x - across, other.y - lane) * 0.35);
        return `M${pin.x},${pin.y} H${out} V${lane} H${across} C${across + (other.x > across ? d : -d)},${lane} ${other.x + other.dx * d},${other.y + other.dy * d} ${other.x},${other.y}`;
    }
    const connectedKeys = () => new Set(state.project.wires.flatMap(w => [w.a, w.b]));

    function drawBoard() {
        const { x, y } = state.project.board;
        const sim = state.sim;
        const led = sim ? sim.pins[LED_BUILTIN] : null;
        const ledOn = led && led.mode === 'OUTPUT' && (led.pwm !== null ? led.pwm < 0.95 : !led.out);
        const sel = state.selected && state.selected.kind === 'board';
        const pins = boardPins();
        return `<g data-board="1" transform="translate(${x},${y})" class="${sel ? 'sel' : ''}">
            <rect x="0" y="0" width="${BOARD.w}" height="${BOARD.h}" rx="10" fill="#1d1f24" stroke="${sel ? 'var(--accent)' : '#000'}" stroke-width="${sel ? 2.5 : 1}"/>
            <rect x="50" y="-10" width="50" height="26" rx="5" fill="#c0c6cc" stroke="#7c848c"/>
            <rect x="44" y="40" width="62" height="62" rx="4" fill="#2c2f36"/><text x="75" y="70" font-size="9" text-anchor="middle" fill="#9aa3ad">ESP32-C3</text><text x="75" y="82" font-size="7" text-anchor="middle" fill="#6c757d">FH4</text>
            <path d="M58,${BOARD.h - 40} h34 v-10 h-6 v6 h-6 v-6 h-6 v6 h-6 v-6 h-6 v6 h-4z" fill="#c9a227" opacity="0.8"/>
            <circle cx="118" cy="30" r="5" fill="${ledOn ? '#4dabf7' : '#13324d'}" ${ledOn ? 'filter="url(#glow)"' : ''}/><text x="118" y="46" font-size="7" text-anchor="middle" fill="#868e96">LED 8</text>
            <circle cx="32" cy="30" r="4" fill="#e03131" opacity="0.9"/><text x="32" y="46" font-size="7" text-anchor="middle" fill="#868e96">PWR</text>
            <g data-boot="1" class="btnhit"><rect x="24" y="${BOARD.h - 26}" width="34" height="16" rx="3" fill="${sim && sim.bootPressed ? '#888' : '#d0d4d9'}"/><text x="41" y="${BOARD.h - 14}" font-size="8" text-anchor="middle" fill="#222">BOOT</text></g>
            <g data-reset="1" class="btnhit"><rect x="92" y="${BOARD.h - 26}" width="34" height="16" rx="3" fill="#d0d4d9"/><text x="109" y="${BOARD.h - 14}" font-size="8" text-anchor="middle" fill="#222">RST</text></g>
            <text x="75" y="${BOARD.h - 48}" font-size="10" text-anchor="middle" fill="#ced4da" font-weight="600">SuperMini</text>
            ${pins.map(p => {
                const lx = p.side === 'left' ? 22 : BOARD.w - 22;
                const name = /^\d+$/.test(p.name) ? `GPIO${p.name}` : p.name;
                const adc = ['0', '1', '2', '3', '4'].includes(p.name) ? ' ·A' : '';
                const color = p.name === 'GND' ? '#adb5bd' : /V/.test(p.name) ? '#ff8787' : '#e9ecef';
                return `<text x="${lx}" y="${p.y - y + 3.5}" font-size="10" text-anchor="${p.side === 'left' ? 'start' : 'end'}" fill="${color}">${name}${adc}</text>`;
            }).join('')}
        </g>`;
    }
    function drawPins(keys) {
        const conn = connectedKeys();
        const all = [...boardPins().map(p => ({ key: p.key, x: p.x, y: p.y, label: pinLabelOf(p.key) }))];
        for (const part of state.project.parts) {
            const def = CATALOG[part.type];
            for (const pd of def.pins) { const at = partPin(part, pd); all.push({ key: `${part.id}:${pd.id}`, x: at.x, y: at.y, label: `${def.label} · ${pd.label}` }); }
        }
        const from = state.wiring && state.wiring.from;
        return all.map(p => `<g class="pin${conn.has(p.key) ? ' on' : ''}${from === p.key ? ' from' : ''}" data-pin="${p.key}">
            <circle cx="${p.x}" cy="${p.y}" r="10" class="pinhit"/><circle cx="${p.x}" cy="${p.y}" r="4.5" class="pindot"/><title>${esc(p.label)}</title></g>`).join('');
    }
    function drawParts() {
        return state.project.parts.map(part => {
            const def = CATALOG[part.type];
            const sel = state.selected && state.selected.kind === 'part' && state.selected.id === part.id;
            return `<g data-part="${part.id}" transform="translate(${part.x},${part.y})${part.rot ? ` rotate(${part.rot} ${def.w / 2} ${def.h / 2})` : ''}" class="part${sel ? ' sel' : ''}${def.clickable ? ' clickable' : ''}">
                ${sel ? `<rect x="-6" y="-12" width="${def.w + 12}" height="${def.h + 18}" rx="8" class="selbox"/>` : ''}
                ${def.svg(part)}
                ${pinLabels(def)}
                <text x="${def.w / 2}" y="${def.h + 16}" font-size="10" text-anchor="middle" class="plabel">${esc(def.label)}</text>
            </g>`;
        }).join('');
    }
    const SHORT = { A: '+', K: '−', P: '+', N: '−', '1': '1', '2': '2' };
    function pinLabels(def) {
        return def.pins.map(pd => {
            const t = SHORT[pd.id] || pd.id;
            if (pd.x <= 6) return `<text x="${pd.x + 7}" y="${pd.y + 3}" class="pinlabel" text-anchor="start">${esc(t)}</text>`;
            if (pd.x >= def.w - 6) return `<text x="${pd.x - 7}" y="${pd.y + 3}" class="pinlabel" text-anchor="end">${esc(t)}</text>`;
            if (pd.y <= 8) return `<text x="${pd.x}" y="${pd.y + 14}" class="pinlabel" text-anchor="middle">${esc(t)}</text>`;
            return `<text x="${pd.x}" y="${pd.y - 8}" class="pinlabel" text-anchor="middle"${t.length > 3 ? ` transform="rotate(-90 ${pd.x} ${pd.y - 8})" dy="3"` : ''}>${esc(t)}</text>`;
        }).join('');
    }
    function drawWires() {
        return state.project.wires.map(w => {
            const a = pinPos(w.a), b = pinPos(w.b);
            if (!a || !b) return '';
            const sel = state.selected && state.selected.kind === 'wire' && state.selected.id === w.id;
            const d = wirePath(a, b);
            return `<g data-wire="${w.id}" class="wire${sel ? ' sel' : ''}"><path d="${d}" class="wirehit"/><path d="${d}" class="wirehalo"/><path d="${d}" stroke="${w.color}" class="wireline"/></g>`;
        }).join('');
    }
    // Zoom to the circuit (frozen while dragging or wiring so things don't jump under the pointer)
    let viewBox = '0 0 1100 700';
    function fitView() {
        if (state.view) { const v = state.view; viewBox = `${Math.round(v.x)} ${Math.round(v.y)} ${Math.round(v.w)} ${Math.round(v.h)}`; return viewBox; }
        if (state.drag || state.wiring || state.adding) return viewBox;
        const b = state.project.board;
        let x0 = b.x - 30, y0 = b.y - (state.studio ? 110 : 70), x1 = b.x + BOARD.w + 30, y1 = b.y + BOARD.h + 30; // room above for the toolbar
        for (const p of state.project.parts) {
            const d = CATALOG[p.type];
            const half = p.rot === 90 || p.rot === 270 ? (d.h - d.w) / 2 : 0; // a turned part is h wide and w tall
            x0 = Math.min(x0, p.x - half - 30); y0 = Math.min(y0, p.y + half - 40); x1 = Math.max(x1, p.x + d.w + half + 30); y1 = Math.max(y1, p.y + d.h - half + 40);
        }
        let w = Math.max(560, x1 - x0), h = Math.max(380, y1 - y0);
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        viewBox = `${Math.round(cx - w / 2)} ${Math.round(cy - h / 2)} ${Math.round(w)} ${Math.round(h)}`;
        return viewBox;
    }
    function renderCircuit() {
        const svg = $('svg');
        const vb = fitView();
        if (svg.getAttribute('viewBox') !== vb) svg.setAttribute('viewBox', vb);
        let preview = '';
        if (state.wiring && state.wiring.to) {
            const a = pinPos(state.wiring.from);
            if (a) preview = `<path d="${wirePath(a, { ...state.wiring.to, dx: 0, dy: 0 })}" class="wirepreview"/>`;
        }
        svg.innerHTML = `<defs><filter id="glow"><feGaussianBlur stdDeviation="3"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <pattern id="mesh" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0,0 L4,4 M4,0 L0,4" stroke="#868e96" stroke-width="0.6"/></pattern>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" class="griddot"/></pattern></defs>
            <rect x="-2000" y="-2000" width="5000" height="5000" fill="url(#grid)" data-bg="1"/>
            ${drawBoard()}${drawParts()}${drawWires()}${preview}${drawPins()}`;
        $('hint').textContent = state.wiring ? `Wiring from ${pinLabelOf(state.wiring.from)} — click another pin (Esc cancels)`
            : state.project.parts.length ? 'Click a pin, then another pin, to add a wire. Drag parts to move them. R rotates, Delete removes, scroll zooms, drag the background to pan.'
                : `Drag components in from the ${state.studio ? 'Components panel' : '"+ Part" menu or the Components tab'}, then click pin to pin to wire them to the ESP32-C3.`;
        renderTools();
    }

    // ---------------- inspector ----------------
    function renderInspector() {
        const pane = $('partPane');
        const sel = state.selected;
        if (!sel) {
            pane.innerHTML = `<div class="empty">Select a part, a wire or the board to see its details.</div>`;
            return;
        }
        if (sel.kind === 'board') {
            pane.innerHTML = `<h3>ESP32-C3 SuperMini</h3>
                <ul class="facts">
                  <li><b>GPIO0–4</b> read analog values (analogRead gives 0–4095).</li>
                  <li><b>GPIO8</b> is the blue built-in LED — it lights when the pin is <b>LOW</b>.</li>
                  <li><b>GPIO9</b> is the BOOT button (reads LOW when pressed). Click BOOT on the board to press it.</li>
                  <li><b>GPIO2, 8, 9</b> decide how the chip starts — avoid pulling them LOW at power-up.</li>
                  <li>Any GPIO can do PWM (analogWrite / ledcWrite) and drive a servo.</li>
                  <li>Serial prints over USB: set <b>USB CDC On Boot</b> to Enabled when uploading from the Arduino IDE.</li>
                </ul>`;
            return;
        }
        if (sel.kind === 'wire') {
            const w = state.project.wires.find(x => x.id === sel.id);
            if (!w) { state.selected = null; return renderInspector(); }
            pane.innerHTML = `<h3>Wire</h3><p>${esc(pinLabelOf(w.a))}<br>↔ ${esc(pinLabelOf(w.b))}</p>
                <label class="row">Colour <input type="color" value="${w.color}" data-wirecolor="${w.id}"></label>
                <button type="button" class="danger" data-delwire="${w.id}">Delete wire</button>`;
            return;
        }
        const part = state.project.parts.find(p => p.id === sel.id);
        if (!part) { state.selected = null; return renderInspector(); }
        const def = CATALOG[part.type];
        const controls = (def.controls || []).map(c => {
            const v = part.props[c.prop];
            if (c.type === 'range') return `<label class="ctl">${esc(c.label)} <b data-val="${c.prop}">${v}${c.unit || ''}</b>
                <input type="range" min="${c.min}" max="${c.max}" value="${v}" data-prop="${c.prop}" data-unit="${c.unit || ''}"></label>`;
            if (c.type === 'toggle') return `<label class="ctl check"><input type="checkbox" ${v ? 'checked' : ''} data-prop="${c.prop}"> ${esc(c.label)}</label>`;
            if (c.type === 'select') return `<label class="ctl">${esc(c.label)} <select data-prop="${c.prop}">${c.options.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
            if (c.type === 'hold') return `<button type="button" class="hold" data-hold="${c.prop}">${esc(c.label)}</button>`;
            return '';
        }).join('');
        const conn = state.project.wires;
        const pinsList = def.pins.map(pd => {
            const key = `${part.id}:${pd.id}`;
            const to = conn.filter(w => w.a === key || w.b === key).map(w => pinLabelOf(w.a === key ? w.b : w.a));
            return `<li><b>${esc(pd.label)}</b> ${to.length ? '→ ' + esc(to.join(', ')) : '<span class="muted">not connected</span>'}</li>`;
        }).join('');
        pane.innerHTML = `<h3>${esc(def.label)}</h3>${def.notes ? `<p class="notes">${esc(def.notes)}</p>` : ''}
            ${controls ? `<div class="controls">${controls}</div>` : ''}
            <h4>Pins</h4><ul class="pins">${pinsList}</ul>
            <button type="button" class="danger" data-delpart="${part.id}">Delete part</button>`;
    }

    // ---------------- remote ----------------
    function renderRemote() {
        remoteDirty = false;
        const pane = $('remotePane');
        const servers = state.sim ? state.sim.servers.filter(s => s.routes.length) : [];
        const routes = servers.length ? servers[0].routes.map(r => r.path) : [];
        const dpad = dpadMap(routes);
        const resp = state.response;
        pane.innerHTML = `
            ${routes.length ? `<p class="muted">Your sketch runs a web server${state.sim && state.sim.wifi.ap ? ` on the "${esc(state.sim.wifi.ap)}" hotspot` : ''}. Tap a page to "open" it, like a phone would.</p>`
                : `<p class="muted">The arrows send <b>F</b>, <b>B</b>, <b>L</b>, <b>R</b> and <b>S</b> (stop) to Serial — read them with Serial.read(). If your sketch starts a WebServer, its pages appear here.</p>`}
            <div class="dpad">
              <span></span><button type="button" data-remote="up">▲</button><span></span>
              <button type="button" data-remote="left">◀</button><button type="button" data-remote="stop">■</button><button type="button" data-remote="right">▶</button>
              <span></span><button type="button" data-remote="down">▼</button><span></span>
            </div>
            <p class="muted small">Hold an arrow to drive; let go to stop. The keyboard arrow keys work too.</p>
            ${routes.length ? `<h4>Pages</h4><div class="routes">${routes.map(r => `<button type="button" data-route="${esc(r)}">${esc(r)}</button>`).join('')}</div>` : ''}
            ${resp ? `<h4>Last reply</h4><div class="resp"><code>${resp.code} ${esc(resp.type)}</code> from <code>${esc(resp.path)}</code>
                ${/html/.test(resp.type) ? `<iframe sandbox="" srcdoc="${esc(resp.body)}"></iframe>` : `<pre>${esc(resp.body.slice(0, 2000))}</pre>`}</div>` : ''}
            ${dpad.missing.length && routes.length ? `<p class="muted small">Name pages like /forward, /back, /left, /right, /stop to drive them with the arrows.</p>` : ''}`;
    }
    function dpadMap(routes) {
        const find = (re) => routes.find(r => re.test(r));
        const map = {
            up: find(/forward|front|fwd|\/up|\/f$/i), down: find(/back|reverse|rev|\/down|\/b$/i),
            left: find(/left|\/l$/i), right: find(/right|\/r$/i), stop: find(/stop|\/s$/i)
        };
        return { map, missing: Object.keys(map).filter(k => !map[k]) };
    }
    function remote(dir, pressed) {
        if (!state.running || !state.sim) return;
        const servers = state.sim.servers.filter(s => s.routes.length);
        if (servers.length) {
            const { map } = dpadMap(servers[0].routes.map(r => r.path));
            const path = pressed ? map[dir] : (dir === 'stop' ? null : map.stop);
            if (path) request(path);
        } else {
            const ch = pressed ? { up: 'F', down: 'B', left: 'L', right: 'R', stop: 'S' }[dir] : (dir === 'stop' ? null : 'S');
            if (ch) state.sim.serialIn += ch;
        }
    }
    function request(path) {
        const [p, q] = path.split('?');
        const args = {};
        (q || '').split('&').filter(Boolean).forEach(kv => { const [k, v] = kv.split('='); args[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
        for (const s of state.sim.servers) if (s.routes.length || s.notFound) { s.queue.push({ path: p, args }); if (!s.started) serialOut('[sim] The web server hasn\'t started yet — call server.begin()\n', 'warn'); break; }
    }

    // ---------------- tabs ----------------
    function showTab(group, name) {
        document.querySelectorAll(`#${group} button`).forEach(b => b.classList.toggle('on', b.dataset.tab === name));
        if (group === 'stageTabs') { $('circuitPane').hidden = name !== 'circuit'; $('worldPane').hidden = name !== 'world'; if (name === 'world') sizeWorld(); }
        else ['parts', 'serial', 'remote', 'part', 'code'].forEach(t => { $(t + 'Pane').hidden = t !== name; });
        if (name === 'remote') renderRemote();
        if (name === 'part') renderInspector();
    }
    function updateWorldTab() {
        const has = world.type !== 'none';
        document.querySelector('#stageTabs [data-tab="world"]').hidden = !has;
        $('worldTools').innerHTML = world.hasCar()
            ? `<button type="button" data-w="reset">Reset car</button><button type="button" data-w="rotl">⟲ 45°</button><button type="button" data-w="rotr">⟳ 45°</button>${world.type === 'arena' ? '<button type="button" data-w="box">+ Box</button>' : ''}<span class="muted small">Drag the car or the boxes</span>`
            : world.type === 'bin' ? '<span class="muted small">Drag the hand towards the bin</span>' : '';
        if (!has) showTab('stageTabs', 'circuit');
    }
    function sizeWorld() {
        const c = $('worldCanvas');
        const r = c.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        c.width = Math.max(200, r.width) * dpr; c.height = Math.max(160, r.height - 40) * dpr;
        c.style.width = Math.max(200, r.width) + 'px'; c.style.height = Math.max(160, r.height - 40) + 'px';
        c.getContext('2d').setTransform(1, 0, 0, 1, 0, 0);
    }

    function renderAll() {
        renderCircuit();
        renderInspector();
        updateWorldTab();
        if (!$('remotePane').hidden) renderRemote();
    }

    // ---------------- pointer on the circuit ----------------
    function svgPoint(evt) {
        const svg = $('svg');
        const pt = svg.createSVGPoint();
        pt.x = evt.clientX; pt.y = evt.clientY;
        return pt.matrixTransform(svg.getScreenCTM().inverse());
    }
    $('svg').addEventListener('pointerdown', (e) => {
        const p = svgPoint(e);
        const pin = e.target.closest('[data-pin]');
        const part = e.target.closest('[data-part]');
        const wire = e.target.closest('[data-wire]');
        const boot = e.target.closest('[data-boot]');
        const reset = e.target.closest('[data-reset]');
        if (pin) {
            const key = pin.dataset.pin;
            if (!state.wiring) state.wiring = { from: key, to: { x: p.x, y: p.y } };
            else if (state.wiring.from === key) state.wiring = null;
            else {
                const a = state.wiring.from;
                if (!state.project.wires.some(w => (w.a === a && w.b === key) || (w.a === key && w.b === a))) {
                    const w = { id: 'w' + Date.now().toString(36), a, b: key };
                    w.color = autoColor(w, state.project.wires.length);
                    state.project.wires.push(w);
                    if (state.sim) state.sim.markDirty();
                    changed();
                }
                state.wiring = null;
            }
            renderCircuit(); renderInspector();
            return;
        }
        if (boot) { if (state.sim) { state.sim.bootPressed = true; state.sim.markDirty(); } state.drag = { boot: true }; renderCircuit(); return; }
        if (reset) { if (state.running || state.sim) run(); return; }
        if (wire) { state.selected = { kind: 'wire', id: wire.dataset.wire }; state.wiring = null; renderCircuit(); renderInspector(); showTab('sideTabs', 'part'); return; }
        if (part) {
            const pr = state.project.parts.find(x => x.id === part.dataset.part);
            state.selected = { kind: 'part', id: pr.id };
            state.drag = { id: pr.id, dx: p.x - pr.x, dy: p.y - pr.y, moved: false };
            if (CATALOG[pr.type].clickable) { pr.props.pressed = true; state.drag.press = true; if (state.sim) state.sim.markDirty(); }
            part.setPointerCapture && $('svg').setPointerCapture(e.pointerId);
            renderCircuit(); renderInspector(); showTab('sideTabs', 'part');
            return;
        }
        if (e.target.closest('[data-board]')) {
            state.selected = { kind: 'board' };
            state.drag = { board: true, dx: p.x - state.project.board.x, dy: p.y - state.project.board.y, moved: false };
            $('svg').setPointerCapture(e.pointerId);
            renderCircuit(); renderInspector(); showTab('sideTabs', 'part');
            return;
        }
        state.selected = null;
        if (state.wiring) state.wiring = null;
        else { state.pan = { x: e.clientX, y: e.clientY, v: currentView(), moved: false }; $('svg').setPointerCapture(e.pointerId); }
        if (state.studio && !$('partPane').hidden) showTab('sideTabs', 'parts');
        renderCircuit(); renderInspector();
    });
    $('svg').addEventListener('pointermove', (e) => {
        if (state.pan) {
            const pn = state.pan, r = $('svg').getBoundingClientRect();
            const k = Math.max(pn.v.w / r.width, pn.v.h / r.height);
            const dx = (e.clientX - pn.x) * k, dy = (e.clientY - pn.y) * k;
            if (!pn.moved && Math.abs(dx) + Math.abs(dy) < 3 * k) return;
            pn.moved = true;
            state.view = { ...pn.v, x: pn.v.x - dx, y: pn.v.y - dy };
            renderCircuit();
            return;
        }
        const p = svgPoint(e);
        if (state.wiring) { state.wiring.to = { x: p.x, y: p.y }; renderCircuit(); return; }
        const d = state.drag;
        if (!d) return;
        if (d.board) { state.project.board.x = Math.round(p.x - d.dx); state.project.board.y = Math.round(p.y - d.dy); d.moved = true; renderCircuit(); return; }
        if (d.id) {
            const pr = state.project.parts.find(x => x.id === d.id);
            if (!pr) return;
            const nx = Math.round(p.x - d.dx), ny = Math.round(p.y - d.dy);
            if (Math.abs(nx - pr.x) + Math.abs(ny - pr.y) > 2 || d.moved) {
                pr.x = Math.max(0, Math.min(1080, nx)); pr.y = Math.max(0, Math.min(680, ny)); d.moved = true;
                if (d.press) { pr.props.pressed = false; d.press = false; if (state.sim) state.sim.markDirty(); }
                renderCircuit();
            }
        }
    });
    const endDrag = () => {
        state.pan = null;
        const d = state.drag;
        if (!d) return;
        if (d.boot && state.sim) { state.sim.bootPressed = false; state.sim.markDirty(); }
        if (d.press) { const pr = state.project.parts.find(x => x.id === d.id); if (pr) pr.props.pressed = false; if (state.sim) state.sim.markDirty(); }
        if (d.moved) changed();
        state.drag = null;
        renderCircuit();
    };
    $('svg').addEventListener('pointerup', endDrag);
    $('svg').addEventListener('pointercancel', endDrag);

    // ---------------- zoom ----------------
    function currentView() {
        const [x, y, w, h] = $('svg').getAttribute('viewBox').split(/\s+/).map(Number);
        return { x, y, w, h };
    }
    function zoom(factor, at) {
        const v = currentView();
        const w = Math.max(220, Math.min(5000, v.w * factor));
        const k = w / v.w;
        const cx = at ? at.x : v.x + v.w / 2, cy = at ? at.y : v.y + v.h / 2;
        state.view = { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, w, h: v.h * k };
        renderCircuit();
    }
    function fit() { state.view = null; renderCircuit(); }
    $('svg').addEventListener('wheel', (e) => {
        e.preventDefault();
        zoom(Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)))), svgPoint(e));
    }, { passive: false });

    function deleteSelected() {
        const sel = state.selected;
        if (!sel) return;
        if (sel.kind === 'part') {
            state.project.parts = state.project.parts.filter(p => p.id !== sel.id);
            state.project.wires = state.project.wires.filter(w => !w.a.startsWith(sel.id + ':') && !w.b.startsWith(sel.id + ':'));
        } else if (sel.kind === 'wire') state.project.wires = state.project.wires.filter(w => w.id !== sel.id);
        else return;
        state.selected = null;
        if (state.sim) state.sim.markDirty();
        changed(); renderCircuit(); renderInspector();
    }

    // ---------------- inspector events ----------------
    $('partPane').addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset.wirecolor) { const w = state.project.wires.find(x => x.id === t.dataset.wirecolor); if (w) { w.color = t.value; changed(); renderCircuit(); } return; }
        const prop = t.dataset.prop;
        if (!prop || !state.selected) return;
        const part = state.project.parts.find(p => p.id === state.selected.id);
        if (!part) return;
        part.props[prop] = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value;
        const v = $('partPane').querySelector(`[data-val="${prop}"]`);
        if (v) v.textContent = t.value + (t.dataset.unit || '');
        if (state.sim) state.sim.markDirty();
        changed(); renderCircuit();
    });
    $('partPane').addEventListener('click', (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.delpart || t.dataset.delwire) deleteSelected();
    });
    const holdHandler = (down) => (e) => {
        const t = e.target.closest('[data-hold]');
        if (!t || !state.selected) return;
        const part = state.project.parts.find(p => p.id === state.selected.id);
        if (!part) return;
        part.props[t.dataset.hold] = down;
        t.classList.toggle('down', down);
        if (state.sim) state.sim.markDirty();
        renderCircuit();
    };
    $('partPane').addEventListener('pointerdown', holdHandler(true));
    $('partPane').addEventListener('pointerup', holdHandler(false));
    $('partPane').addEventListener('pointerleave', holdHandler(false));

    // ---------------- remote events ----------------
    $('remotePane').addEventListener('pointerdown', (e) => {
        const r = e.target.closest('[data-remote]');
        if (r) { remote(r.dataset.remote, true); r.classList.add('down'); return; }
        const route = e.target.closest('[data-route]');
        if (route && state.running) request(route.dataset.route);
    });
    const remoteUp = (e) => { const r = e.target.closest && e.target.closest('[data-remote]'); if (r) { remote(r.dataset.remote, false); r.classList.remove('down'); } };
    $('remotePane').addEventListener('pointerup', remoteUp);
    $('remotePane').addEventListener('pointerleave', (e) => { document.querySelectorAll('[data-remote].down').forEach(b => { b.classList.remove('down'); remote(b.dataset.remote, false); }); });
    const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'stop' };
    const held = new Set();
    window.addEventListener('keydown', (e) => {
        const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName);
        if (typing) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) { e.preventDefault(); deleteSelected(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? 1 : -1); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); undoRedo(1); return; }
        if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && state.selected) { rotateSelected(); return; }
        if (e.key === 'Escape') { state.wiring = null; renderCircuit(); return; }
        const dir = KEYS[e.key];
        if (dir && state.running && !held.has(e.key)) { e.preventDefault(); held.add(e.key); remote(dir, true); }
    });
    window.addEventListener('keyup', (e) => {
        const dir = KEYS[e.key];
        if (dir && held.has(e.key)) { held.delete(e.key); remote(dir, false); }
    });

    // ---------------- world events ----------------
    const wc = $('worldCanvas');
    const wpt = (e) => { const r = wc.getBoundingClientRect(); const dpr = wc.width / r.width; return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };
    wc.addEventListener('pointerdown', (e) => { if (world.pointer('down', ...wpt(e))) wc.setPointerCapture(e.pointerId); });
    wc.addEventListener('pointermove', (e) => world.pointer('move', ...wpt(e)));
    wc.addEventListener('pointerup', (e) => world.pointer('up', ...wpt(e)));
    $('worldTools').addEventListener('click', (e) => {
        const t = e.target.closest('[data-w]');
        if (!t) return;
        if (t.dataset.w === 'reset') { const keep = world.boxes; world.reset(); if (world.type === 'arena') world.boxes = keep; }
        if (t.dataset.w === 'rotl') world.rotateCar(-45);
        if (t.dataset.w === 'rotr') world.rotateCar(45);
        if (t.dataset.w === 'box') world.addBox();
    });

    // ---------------- toolbar ----------------
    $('run').addEventListener('click', () => { if (audio && audio.state === 'suspended') audio.resume(); run(); if (world.type !== 'none') showTab('stageTabs', 'world'); });
    $('stop').addEventListener('click', stop);
    $('sound').addEventListener('click', () => { muted = !muted; $('sound').textContent = muted ? '🔇' : '🔊'; sound(0); });
    $('project').innerHTML = `<option value="">Examples…</option>${PROJECTS.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}`;
    $('project').addEventListener('change', (e) => {
        const t = PROJECTS.find(p => p.id === e.target.value);
        e.target.value = '';
        if (!t) return;
        const hasWork = state.project.parts.length || state.project.wires.length;
        if (hasWork && !confirm(`Replace your circuit with "${t.title}"?`)) return;
        loadProject(fromTemplate(t));
        changed();
        const replaceCode = !state.code.trim() || state.code.trim() === (PROJECTS.find(x => x.code.trim() === state.code.trim()) || {}).code?.trim()
            || confirm('Also load this example\'s code? (Your current code will be replaced.)');
        if (replaceCode) {
            setCode(t.code);
            post({ type: 'sim-code', code: t.code });
        }
    });
    $('world').addEventListener('change', (e) => {
        world.setType(e.target.value);
        state.project.world = e.target.value;
        changed(); updateWorldTab();
        if (world.type !== 'none') showTab('stageTabs', 'world');
    });
    $('addBtn').addEventListener('click', () => { $('palette').hidden = !$('palette').hidden; });
    $('palette').innerHTML = GROUPS.map(g => `<div class="pgroup"><h5>${g}</h5>${Object.entries(CATALOG).filter(([, d]) => d.group === g).map(([type, d]) => `<button type="button" data-add="${type}">${esc(d.label)}</button>`).join('')}</div>`).join('');
    $('palette').addEventListener('click', (e) => {
        const t = e.target.closest('[data-add]');
        if (!t) return;
        $('palette').hidden = true;
        addPart(t.dataset.add);
    });
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.add')) $('palette').hidden = true; });
    document.querySelectorAll('.tabs').forEach(nav => nav.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(nav.id, b.dataset.tab); }));
    $('serialForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = $('serialIn').value;
        if (state.sim) state.sim.serialIn += v + ($('lineEnd').value === 'nl' ? '\n' : $('lineEnd').value === 'crlf' ? '\r\n' : '');
        serialOut(`→ ${v}\n`, 'muted');
        $('serialIn').value = '';
    });
    $('clearSerial').addEventListener('click', () => { $('out').textContent = ''; outLen = 0; });
    $('code').addEventListener('input', () => { state.code = $('code').value; if (embedded) post({ type: 'sim-code', code: state.code }); changed(); });
    function setCode(code) { state.code = code || ''; $('code').value = state.code; }

    // ---------------- adding parts ----------------
    // at: where to drop it (circuit coordinates); without it, beside the board
    function addPart(type, at) {
        const def = CATALOG[type];
        const n = state.project.parts.length;
        const b = state.project.board;
        const id = type.replace(/\d+$/, '') + (Date.now() % 100000).toString(36);
        const x = at ? at.x - def.w / 2 : n % 2 === 1 ? b.x - 310 + (n % 3) * 30 : b.x + 250 + (n % 3) * 40;
        const y = at ? at.y - def.h / 2 : b.y - 70 + (n * 70) % 460;
        state.project.parts.push({ id, type, x: Math.round(x), y: Math.round(y), props: { ...def.props } });
        state.selected = { kind: 'part', id };
        if (state.sim) state.sim.markDirty();
        changed(); renderCircuit(); renderInspector(); showTab('sideTabs', 'part');
    }
    function thumb(type) {
        const def = CATALOG[type];
        let inner = '';
        try { inner = def.svg({ id: 'thumb', type, x: 0, y: 0, props: { ...def.props } }); } catch { }
        return `<svg viewBox="-4 -4 ${def.w + 8} ${def.h + 8}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${inner}</svg>`;
    }
    function renderComponents() {
        const q = $('compSearch').value.trim().toLowerCase();
        const html = GROUPS.map(g => {
            const items = Object.entries(CATALOG).filter(([t, d]) => d.group === g && (!q || d.label.toLowerCase().includes(q) || t.includes(q) || (d.notes || '').toLowerCase().includes(q)));
            if (!items.length) return '';
            return `<h5>${g}</h5><div class="comp-grid">${items.map(([t, d]) => `<button type="button" class="comp" data-comp="${t}" title="${esc(d.notes || d.label)}">${thumb(t)}<span>${esc(d.label)}</span></button>`).join('')}</div>`;
        }).join('');
        $('compList').innerHTML = html || '<p class="empty">No components match.</p>';
    }
    $('compSearch').addEventListener('input', renderComponents);
    $('compList').addEventListener('pointerdown', (e) => {
        const c = e.target.closest('[data-comp]');
        if (!c) return;
        e.preventDefault();
        state.adding = { type: c.dataset.comp, x: e.clientX, y: e.clientY, moved: false };
    });
    document.addEventListener('pointermove', (e) => {
        const a = state.adding;
        if (!a) return;
        if (!a.moved && Math.hypot(e.clientX - a.x, e.clientY - a.y) < 6) return;
        a.moved = true;
        const g = $('ghost');
        if (g.hidden) { g.innerHTML = thumb(a.type); g.hidden = false; }
        g.style.transform = `translate(${e.clientX - 32}px, ${e.clientY - 32}px)`;
    });
    document.addEventListener('pointerup', (e) => {
        const a = state.adding;
        if (!a) return;
        state.adding = null;
        $('ghost').hidden = true;
        if (!a.moved) { addPart(a.type); return; }
        const r = $('svg').getBoundingClientRect();
        if (!$('circuitPane').hidden && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) addPart(a.type, svgPoint(e));
    });

    // ---------------- canvas toolbar ----------------
    const WIRE_SWATCH = ['#3b4048', '#e03131', '#f08c00', '#fcc419', '#2b9348', '#1971c2', '#7048e8', '#868e96', '#f1f3f5', '#8d5524'];
    const ico = (d) => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const ICON = {
        rotate: ico('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
        trash: ico('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
        undo: ico('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
        redo: ico('<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
        minus: ico('<circle cx="11" cy="11" r="7"/><path d="M8 11h6"/><path d="m21 21-5-5"/>'),
        plus: ico('<circle cx="11" cy="11" r="7"/><path d="M8 11h6M11 8v6"/><path d="m21 21-5-5"/>'),
        fit: ico('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')
    };
    let toolsKey = '';
    function renderTools() {
        const sel = state.selected;
        const wire = sel && sel.kind === 'wire' ? state.project.wires.find(w => w.id === sel.id) : null;
        const key = [sel && sel.kind, sel && sel.id, wire && wire.color, hist.at, hist.stack.length].join('|');
        if (key === toolsKey) return;
        toolsKey = key;
        const isPart = sel && sel.kind === 'part';
        $('toolBtns').innerHTML = `
            <button type="button" data-t="rotate" title="Rotate (R)" ${isPart ? '' : 'disabled'}>${ICON.rotate}</button>
            <button type="button" data-t="delete" title="Delete (Del)" ${isPart || wire ? '' : 'disabled'}>${ICON.trash}</button>
            <span class="sep"></span>
            <button type="button" data-t="undo" title="Undo (Ctrl+Z)" ${hist.at > 0 ? '' : 'disabled'}>${ICON.undo}</button>
            <button type="button" data-t="redo" title="Redo (Ctrl+Shift+Z)" ${hist.at < hist.stack.length - 1 ? '' : 'disabled'}>${ICON.redo}</button>
            <span class="sep"></span>
            <button type="button" data-t="zoomout" title="Zoom out">${ICON.minus}</button>
            <button type="button" data-t="zoomin" title="Zoom in">${ICON.plus}</button>
            <button type="button" data-t="fit" title="Fit the circuit to the view">${ICON.fit}</button>
            ${wire ? `<span class="sep"></span><span class="swatches" title="Wire colour">${WIRE_SWATCH.map(c => `<button type="button" data-color="${c}" class="sw${c === wire.color ? ' on' : ''}" style="background:${c}" aria-label="Wire colour ${c}"></button>`).join('')}</span>` : ''}`;
    }
    $('canvasTools').innerHTML = '<span id="toolBtns" class="tool-btns"></span><span id="toolExtra" class="tool-extra"></span>';
    $('canvasTools').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.color) {
            const w = state.selected && state.project.wires.find(x => x.id === state.selected.id);
            if (w) { w.color = b.dataset.color; changed(); renderCircuit(); renderInspector(); }
            return;
        }
        ({ rotate: rotateSelected, delete: deleteSelected, undo: () => undoRedo(-1), redo: () => undoRedo(1),
            zoomin: () => zoom(1 / 1.25), zoomout: () => zoom(1.25), fit }[b.dataset.t] || (() => { }))();
    });
    function fmtTime(sec) {
        const m = Math.floor(sec / 60), s = sec - m * 60;
        return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
    }

    // ---------------- studio (embedded in an IDE that has its own run bar, serial and code) ----------------
    function enterStudio() {
        if (state.studio) return;
        state.studio = true;
        document.body.classList.add('studio');
        ['serial', 'code'].forEach(t => { document.querySelector(`#sideTabs [data-tab="${t}"]`).hidden = true; });
        $('toolExtra').append($('world'), $('sound'));
        showTab('sideTabs', 'parts');
        renderCircuit();
    }

    // ---------------- animation ----------------
    // Physics runs on its own timer by elapsed time (small steps), so the car moves at the
    // right speed even when the page draws few frames; drawing happens in tick()
    let lastPhys = performance.now();
    function physics() {
        const now = performance.now();
        let left = Math.min(0.5, (now - lastPhys) / 1000);
        lastPhys = now;
        const sim = state.sim;
        if (!sim) return;
        sim.markDirty();
        sim.solve();
        if (!state.running) return;
        while (left > 0) {
            const dt = Math.min(0.02, left);
            left -= dt;
            if (world.step(dt, state.project.parts)) { sim.markDirty(); sim.solve(); }
        }
    }
    setInterval(physics, 20);
    let frame = 0;
    function tick() {
        const now = performance.now();
        frame++;
        if (state.running || state.drag || frame % 10 === 0) {
            if (!state.wiring || frame % 3 === 0) renderCircuit();
        }
        if (!$('worldPane').hidden) world.render($('worldCanvas'), state.project.parts, state.theme);
        $('simTimer').hidden = !state.running;
        if (state.running) {
            $('clock').textContent = ((now - (state.t0 || now)) / 1000).toFixed(1) + ' s';
            $('simTimer').textContent = 'Simulator time ' + fmtTime((now - (state.t0 || now)) / 1000);
            const buzz = state.project.parts.filter(p => p.type === 'buzzer' && p.state && p.state.on).map(p => p.state.freq);
            sound(buzz.length ? Math.max(...buzz) : 0);
            if (remoteDirty && !$('remotePane').hidden) renderRemote();
            if (frame % 6 === 0 && !$('partPane').hidden) liveInspector();
        }
        requestAnimationFrame(tick);
    }
    // live values in the inspector without rebuilding it (so sliders keep working)
    function liveInspector() {
        const sel = state.selected;
        if (!sel || sel.kind !== 'part') return;
        const part = state.project.parts.find(p => p.id === sel.id);
        if (!part || !state.sim) return;
        let el = $('partPane').querySelector('.live');
        if (!el) { el = document.createElement('p'); el.className = 'live'; $('partPane').querySelector('h3').after(el); }
        const s = part.state || {};
        const bits = [];
        if (s.unpowered) bits.push('⚠ Not powered — check VCC and GND');
        if (part.type === 'servo') bits.push(`Angle ${Math.round(s.angle)}°`);
        if (part.type === 'motor') bits.push(`Speed ${Math.round((s.speed || 0) * 100)}%`);
        if (part.type === 'led') bits.push(s.b ? `On (${Math.round(s.b * 100)}%)` : 'Off');
        if (part.type === 'hcsr04' && s.cm !== undefined) bits.push(`Sees ${Math.round(s.cm)} cm`);
        if (part.type === 'l298n' && s.a !== undefined) bits.push(`Motor A ${Math.round(s.a * 100)}% · Motor B ${Math.round(s.b * 100)}%`);
        el.textContent = bits.join(' · ');
    }

    // ---------------- theme + messages ----------------
    function setTheme(t) {
        state.theme = t === 'light' ? 'light' : 'dark';
        document.documentElement.classList.toggle('light', state.theme === 'light');
    }
    window.addEventListener('message', (e) => {
        const d = e.data || {};
        if (d.type === 'load') {
            if (d.theme) setTheme(d.theme);
            if (d.chrome === 'studio') enterStudio();
            state.showEditor = !!d.showEditor;
            document.querySelector('#sideTabs [data-tab="code"]').hidden = !state.showEditor;
            if (d.title) { state.title = d.title; $('title').textContent = d.title; }
            const t = d.template && PROJECTS.find(p => p.id === d.template);
            loadProject(d.project ? d.project : t ? fromTemplate(t) : blankProject());
            setCode(d.code !== undefined ? d.code : t ? t.code : '');
            if (d.autorun) { run(); if (world.type !== 'none') showTab('stageTabs', 'world'); }
        } else if (d.type === 'code') {
            setCode(d.code);
        } else if (d.type === 'theme') setTheme(d.theme);
        else if (d.type === 'run') { run(); if (world.type !== 'none') showTab('stageTabs', 'world'); }
        else if (d.type === 'stop') stop();
        else if (d.type === 'serial-in') { if (state.sim) state.sim.serialIn += String(d.text || ''); }
        else if (d.type === 'example') {
            const t = PROJECTS.find(p => p.id === d.id);
            if (!t) return;
            loadProject(fromTemplate(t));
            changed();
            setCode(t.code);
            post({ type: 'sim-code', code: t.code });
        }
    });
    window.addEventListener('resize', () => { if (!$('worldPane').hidden) sizeWorld(); });

    // ---------------- start ----------------
    setTheme(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.querySelector('#sideTabs [data-tab="code"]').hidden = !state.showEditor;
    let saved = null, savedCode = null;
    if (!embedded) try { saved = JSON.parse(localStorage.getItem('esp32sim.project')); savedCode = localStorage.getItem('esp32sim.code'); } catch { }
    const first = PROJECTS.find(p => p.id === (new URLSearchParams(location.search).get('example') || 'dustbin')) || PROJECTS[0];
    loadProject(saved || fromTemplate(first));
    setCode(savedCode !== null && savedCode !== undefined && saved ? savedCode : first.code);
    if (!embedded) showTab('sideTabs', 'code');
    updateButtons();
    window.__esp32sim = { state, world }; // for debugging from the console
    requestAnimationFrame(tick);
    renderComponents();
    // A run started by the parent has no click inside this page, so wake the buzzer's audio on the first one
    document.addEventListener('pointerdown', () => { if (audio && audio.state === 'suspended') audio.resume(); });
    post({ type: 'sim-ready', examples: PROJECTS.map(p => ({ id: p.id, title: p.title })) });
})();
