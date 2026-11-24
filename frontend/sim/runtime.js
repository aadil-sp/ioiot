// The simulated ESP32-C3 SuperMini: its pins, the wires and parts attached to them, and the Arduino API
// a sketch calls. Connected pins form nets; the board, sensors and drivers put voltages on nets, and
// LEDs, motors and the sketch's digitalRead/analogRead read them back.
(function (root) {
    const BOARD_PINS = {
        left: ['5V', 'GND', '3V3', '4', '3', '2', '1', '0'],
        right: ['5', '6', '7', '8', '9', '10', '20', '21']
    };
    const GPIOS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21];
    const ADC_PINS = [0, 1, 2, 3, 4];
    const LED_BUILTIN = 8; // blue LED, lit when the pin is LOW
    const BOOT_PIN = 9;    // BOOT button pulls GPIO9 to GND

    class Stop extends Error { constructor() { super('stopped'); } }

    class Board {
        constructor(host) {
            this.host = host; // { project, parts catalog, log(text, kind), onChange() }
            this.reset();
        }

        reset() {
            this.pins = {};
            for (const g of GPIOS) this.pins[g] = { mode: 'INPUT', out: 0, pwm: null, pulseUs: null, freq: null, lastHigh: -1e9 };
            this.ledc = { channels: {}, pinRes: {}, usedSetup: false };
            this.analogBits = 12;
            this.analogWriteBits = 8;
            this.isr = {}; // gpio -> { fn, mode, last }
            this.pendingIsr = [];
            this.bootPressed = false;
            this.dirty = true;
            this.nets = null;
            this.warned = new Set();
            this.t0 = performance.now();
            this.serialIn = '';
            this.serialTimeout = 1000;
            this.servers = [];
            this.wifi = { status: 0, ssid: '', ap: null, connectAt: 0 };
            this.http = [];
        }

        millis() { return performance.now() - this.t0; }
        warnOnce(key, text) { if (!this.warned.has(key)) { this.warned.add(key); this.host.log(text + '\n', 'warn'); } }
        markDirty() { this.dirty = true; }

        // ---- nets ----
        solve() {
            if (!this.dirty && this.nets) return this.nets;
            const project = this.host.project;
            const catalog = this.host.catalog;
            const parent = {};
            const find = (k) => { while (parent[k] && parent[k] !== k) { parent[k] = parent[parent[k]] || parent[k]; k = parent[k]; } return k; };
            const union = (a, b) => { parent[a] = parent[a] || a; parent[b] = parent[b] || b; const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
            for (const w of project.wires) union(w.a, w.b);
            // Pressed buttons join their two sides
            for (const p of project.parts) {
                const def = catalog[p.type];
                if (def && def.joins) for (const [a, b] of def.joins(p)) union(`${p.id}:${a}`, `${p.id}:${b}`);
            }
            const nets = {};
            const net = (key) => {
                const r = find(key);
                if (!parent[key]) return null; // not wired
                return nets[r] || (nets[r] = { v: null, strong: false, weak: null, pwm: null, pulseUs: null, freq: null, short: false });
            };
            const drive = (key, v, extra) => {
                const n = net(key);
                if (!n) return;
                if (n.strong && Math.abs(n.v - v) > 0.5) n.short = true;
                n.v = v; n.strong = true;
                if (extra) Object.assign(n, extra);
            };
            // Board
            drive('board:5V', 5); drive('board:3V3', 3.3); drive('board:GND', 0);
            for (const g of GPIOS) {
                const p = this.pins[g];
                const key = `board:${g}`;
                if (p.mode === 'OUTPUT') {
                    const duty = p.pwm;
                    drive(key, duty !== null ? 3.3 * duty : (p.out ? 3.3 : 0), { pwm: duty, pulseUs: p.pulseUs, freq: p.freq });
                } else {
                    const n = net(key);
                    if (n && !n.strong) {
                        if (p.mode === 'INPUT_PULLUP' || (g === BOOT_PIN && !this.bootPressed && p.mode === 'INPUT')) n.weak = 3.3;
                        if (p.mode === 'INPUT_PULLDOWN') n.weak = 0;
                    }
                }
            }
            if (this.bootPressed) drive(`board:${BOOT_PIN}`, 0);
            // Parts drive their outputs; repeat so chains (GPIO → L298N → motor) settle
            const ctx = this.ctx(net, drive);
            for (let pass = 0; pass < 3; pass++) {
                for (const p of project.parts) {
                    const def = catalog[p.type];
                    if (def && def.outputs) def.outputs(p, ctx);
                }
            }
            for (const n of Object.values(nets)) if (!n.strong && n.weak !== null) n.v = n.weak;
            this.nets = { find: (k) => net(k), list: nets };
            this.dirty = false;
            for (const p of project.parts) {
                const def = catalog[p.type];
                if (def && def.observe) def.observe(p, this.ctx(net, drive));
            }
            this.checkInterrupts();
            return this.nets;
        }

        ctx(net, drive) {
            const self = this;
            return {
                net: (p, pin) => net(`${p.id}:${pin}`),
                v: (p, pin) => { const n = net(`${p.id}:${pin}`); return n ? n.v : null; },
                drive: (p, pin, v, extra) => drive(`${p.id}:${pin}`, v, extra),
                powered(p, vcc = 'VCC', gnd = 'GND', min = 2.7) {
                    const a = net(`${p.id}:${vcc}`), b = net(`${p.id}:${gnd}`);
                    return !!(a && b && a.v !== null && a.v >= min && b.strong && b.v === 0);
                },
                grounded(p, gnd = 'GND') { const b = net(`${p.id}:${gnd}`); return !!(b && b.strong && b.v === 0); },
                world: self.host.world,
                time: self.millis()
            };
        }

        netOfGpio(g) { const nets = this.solve(); return nets.find(`board:${g}`); }

        level(g) {
            const n = this.netOfGpio(g);
            const p = this.pins[g];
            if (g === LED_BUILTIN && (!n)) return p.mode === 'OUTPUT' ? p.out : (p.mode === 'INPUT_PULLUP' ? 1 : 0);
            if (!n || n.v === null) {
                if (p.mode === 'INPUT_PULLUP') return 1;
                if (g === BOOT_PIN) return this.bootPressed ? 0 : 1;
                if (p.mode === 'OUTPUT') return p.out;
                return null; // floating
            }
            return n.v > 1.65 ? 1 : 0;
        }

        // ---- interrupts ----
        checkInterrupts() {
            for (const [g, h] of Object.entries(this.isr)) {
                const lv = this.level(+g) ?? 0;
                if (h.last === undefined) { h.last = lv; continue; }
                if (lv !== h.last) {
                    const rising = lv === 1;
                    if (h.mode === 'CHANGE' || (h.mode === 'RISING' && rising) || (h.mode === 'FALLING' && !rising)
                        || (h.mode === 'LOW' && lv === 0) || (h.mode === 'HIGH' && lv === 1)) this.pendingIsr.push(h.fn);
                    h.last = lv;
                }
            }
        }
    }

    // ---------- the Arduino API a sketch sees ----------
    function makeApi(board, host) {
        let stopped = false;
        let yields = 0;
        let lastBreath = performance.now();
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const isPin = (g) => GPIOS.includes(g);
        const pinCheck = (g, what) => {
            g = Number(g);
            if (!isPin(g)) { board.warnOnce('pin' + g, `⚠ ${what}(${g}): the ESP32-C3 SuperMini has GPIO 0–10, 20 and 21.`); return null; }
            if ((g === 18 || g === 19)) board.warnOnce('usb', '⚠ GPIO18/19 are the USB pins.');
            return g;
        };

        async function runIsrs() {
            while (board.pendingIsr.length) {
                const fn = board.pendingIsr.shift();
                try { await fn(); } catch (e) { if (e instanceof Stop) throw e; host.log(`⚠ interrupt: ${e.message}\n`, 'err'); }
            }
        }
        async function __yield() {
            if (stopped) throw new Stop();
            yields++;
            if (board.pendingIsr.length) await runIsrs();
            const now = performance.now();
            if (now - lastBreath > 12) { lastBreath = now; await sleep(0); if (stopped) throw new Stop(); }
        }
        async function delay(ms) {
            ms = Math.max(0, Number(ms) || 0);
            const end = performance.now() + ms;
            while (true) {
                if (stopped) throw new Stop();
                if (board.pendingIsr.length) await runIsrs();
                const left = end - performance.now();
                if (left <= 0) break;
                await sleep(Math.min(left, 20));
            }
            lastBreath = performance.now();
        }
        async function delayMicroseconds(us) { if (us > 2000) await delay(us / 1000); else await __yield(); }

        const fmtNum = (x, arg) => {
            if (typeof x === 'number') {
                if (arg !== undefined && Number.isInteger(x) && [2, 8, 16].includes(arg)) return (x >>> 0).toString(arg).toUpperCase();
                if (arg !== undefined && !(Number.isInteger(x) && arg === 10)) return x.toFixed(arg);
                if (!Number.isInteger(x)) return isFinite(x) ? x.toFixed(2) : (isNaN(x) ? 'nan' : 'inf');
                return String(x);
            }
            if (typeof x === 'boolean') return x ? '1' : '0';
            if (x && typeof x === 'object' && x.toString) return x.toString();
            return x === null || x === undefined ? '' : String(x);
        };
        function printf(fmt, ...args) {
            let k = 0;
            return String(fmt).replace(/%([-+ 0#]*)(\d*)(?:\.(\d+))?(l{0,2}|h{0,2}|z)?([diufFsScxXoeEgp%])/g, (all, flags, width, prec, len, conv) => {
                if (conv === '%') return '%';
                let a = args[k++];
                let s;
                switch (conv) {
                    case 'd': case 'i': case 'u': s = String(Math.trunc(Number(a) || 0)); break;
                    case 'f': case 'F': s = Number(a).toFixed(prec !== undefined ? +prec : 6); break;
                    case 'e': case 'E': s = Number(a).toExponential(prec !== undefined ? +prec : 6); break;
                    case 'g': s = String(Number(a)); break;
                    case 'x': s = (Number(a) >>> 0).toString(16); break;
                    case 'X': s = (Number(a) >>> 0).toString(16).toUpperCase(); break;
                    case 'o': s = (Number(a) >>> 0).toString(8); break;
                    case 'c': s = typeof a === 'number' ? String.fromCharCode(a) : String(a).charAt(0); break;
                    default: s = fmtNum(a);
                }
                if (width && s.length < +width) s = flags.includes('-') ? s.padEnd(+width) : s.padStart(+width, flags.includes('0') && conv !== 's' ? '0' : ' ');
                return s;
            });
        }

        const Serial = {
            begin() { return true; },
            end() {},
            print(x, arg) { host.log(fmtNum(x, arg)); },
            println(x, arg) { host.log((x === undefined ? '' : fmtNum(x, arg)) + '\n'); },
            printf(fmt, ...args) { host.log(printf(fmt, ...args)); },
            write(x) { host.log(typeof x === 'number' ? String.fromCharCode(x) : String(x)); return 1; },
            available() { return board.serialIn.length; },
            read() { if (!board.serialIn.length) return -1; const c = board.serialIn[0]; board.serialIn = board.serialIn.slice(1); return c; },
            peek() { return board.serialIn.length ? board.serialIn[0] : -1; },
            flush() {},
            setTimeout(ms) { board.serialTimeout = ms; },
            setDebugOutput() {},
            async readString() {
                const end = performance.now() + board.serialTimeout;
                let last = board.serialIn.length;
                while (performance.now() < end) {
                    await delay(30);
                    if (board.serialIn.length && board.serialIn.length === last) break;
                    last = board.serialIn.length;
                }
                const s = board.serialIn; board.serialIn = ''; return s;
            },
            async readStringUntil(ch) {
                const end = performance.now() + board.serialTimeout;
                ch = typeof ch === 'number' ? String.fromCharCode(ch) : ch;
                while (!board.serialIn.includes(ch) && performance.now() < end) await delay(15);
                const at = board.serialIn.indexOf(ch);
                const s = at === -1 ? board.serialIn : board.serialIn.slice(0, at);
                board.serialIn = at === -1 ? '' : board.serialIn.slice(at + 1);
                return s;
            },
            async parseInt() {
                const end = performance.now() + board.serialTimeout;
                while (!/-?\d/.test(board.serialIn) && performance.now() < end) await delay(15);
                const m = /^[^-\d]*(-?\d+)/.exec(board.serialIn);
                if (!m) return 0;
                board.serialIn = board.serialIn.slice(m[0].length);
                return parseInt(m[1], 10);
            },
            async parseFloat() {
                const end = performance.now() + board.serialTimeout;
                while (!/-?\d/.test(board.serialIn) && performance.now() < end) await delay(15);
                const m = /^[^-\d.]*(-?\d*\.?\d+)/.exec(board.serialIn);
                if (!m) return 0;
                board.serialIn = board.serialIn.slice(m[0].length);
                return parseFloat(m[1]);
            },
            valueOf() { return 1; }
        };

        function pinMode(g, mode) {
            g = pinCheck(g, 'pinMode'); if (g === null) return;
            const names = { 1: 'INPUT', 3: 'OUTPUT', 5: 'INPUT_PULLUP', 9: 'INPUT_PULLDOWN' };
            board.pins[g].mode = typeof mode === 'string' ? mode : (names[mode] || 'INPUT');
            board.markDirty();
        }
        function digitalWrite(g, v) {
            g = pinCheck(g, 'digitalWrite'); if (g === null) return;
            const p = board.pins[g];
            if (p.mode !== 'OUTPUT') {
                // Writing HIGH to an input turns on its pull-up, like on the board
                if (p.mode === 'INPUT' && !p.warnedWrite) { p.warnedWrite = true; board.warnOnce('dw' + g, `⚠ digitalWrite(${g}, …) before pinMode(${g}, OUTPUT) — the pin isn't an output yet.`); }
                return;
            }
            p.out = v && v !== '0' ? 1 : 0;
            p.pwm = null; p.pulseUs = null; p.freq = null;
            if (p.out) p.lastHigh = board.millis();
            board.markDirty();
        }
        function digitalRead(g) {
            g = pinCheck(g, 'digitalRead'); if (g === null) return 0;
            const lv = board.level(g);
            if (lv === null) {
                board.warnOnce('float' + g, `⚠ GPIO${g} isn't connected to anything (floating) — digitalRead gives random values on a real board.`);
                return 0;
            }
            return lv;
        }
        function analogRead(g) {
            g = Number(g);
            if (!ADC_PINS.includes(g)) { board.warnOnce('adc' + g, `⚠ analogRead(${g}): on the ESP32-C3 only GPIO0–4 can read analog values.`); return 0; }
            const n = board.netOfGpio(g);
            const max = (1 << board.analogBits) - 1;
            if (!n || n.v === null) return Math.round(Math.random() * max * 0.05);
            return Math.max(0, Math.min(max, Math.round(n.v / 3.3 * max)));
        }
        function analogReadMilliVolts(g) { return Math.round(analogRead(g) / ((1 << board.analogBits) - 1) * 3300); }
        function setPwm(g, duty, freq) {
            const p = board.pins[g];
            if (p.mode !== 'OUTPUT') p.mode = 'OUTPUT';
            p.pwm = Math.max(0, Math.min(1, duty));
            if (freq !== undefined) p.freq = freq;
            if (p.pwm > 0) p.lastHigh = board.millis();
            board.markDirty();
        }
        function analogWrite(g, val) {
            g = pinCheck(g, 'analogWrite'); if (g === null) return;
            setPwm(g, Number(val) / ((1 << board.analogWriteBits) - 1));
        }
        // LEDC: core 3.x takes pins (ledcAttach/ledcWrite(pin)); 2.x takes channels (ledcSetup/ledcAttachPin)
        function ledcAttach(g, freq, bits) { g = pinCheck(g, 'ledcAttach'); if (g === null) return false; board.ledc.pinRes[g] = bits || 8; board.pins[g].mode = 'OUTPUT'; board.pins[g].freq = freq; board.pins[g].pwm = 0; board.markDirty(); return true; }
        function ledcAttachChannel(g, freq, bits) { return ledcAttach(g, freq, bits); }
        function ledcSetup(ch, freq, bits) { board.ledc.usedSetup = true; board.ledc.channels[ch] = { freq, bits: bits || 8, pins: (board.ledc.channels[ch] || {}).pins || [] }; return freq; }
        function ledcAttachPin(g, ch) { g = pinCheck(g, 'ledcAttachPin'); if (g === null) return; const c = board.ledc.channels[ch] || (board.ledc.channels[ch] = { freq: 5000, bits: 8, pins: [] }); c.pins.push(g); board.pins[g].mode = 'OUTPUT'; board.markDirty(); }
        function ledcWrite(target, duty) {
            const c = board.ledc.usedSetup ? board.ledc.channels[target] : null;
            if (c) { for (const g of c.pins) setPwm(g, duty / ((1 << c.bits) - 1), c.freq); return; }
            const g = Number(target);
            if (!isPin(g)) return;
            setPwm(g, duty / ((1 << (board.ledc.pinRes[g] || 8)) - 1));
        }
        function ledcWriteTone(target, freq) {
            const pins = board.ledc.usedSetup && board.ledc.channels[target] ? board.ledc.channels[target].pins : [Number(target)];
            for (const g of pins) if (isPin(g)) { const p = board.pins[g]; p.mode = 'OUTPUT'; p.freq = freq || null; p.pwm = freq ? 0.5 : 0; board.markDirty(); }
            return freq;
        }
        function ledcDetach(g) { const p = board.pins[g]; if (p) { p.pwm = null; p.freq = null; board.markDirty(); } return true; }
        function ledcChangeFrequency(g, freq) { const p = board.pins[g]; if (p) p.freq = freq; return freq; }
        const toneTimers = {};
        function tone(g, freq, duration) {
            g = pinCheck(g, 'tone'); if (g === null) return;
            const p = board.pins[g];
            p.mode = 'OUTPUT'; p.freq = freq; p.pwm = 0.5; board.markDirty();
            clearTimeout(toneTimers[g]);
            if (duration) toneTimers[g] = setTimeout(() => noTone(g), duration);
        }
        function noTone(g) {
            if (g === undefined) { for (const k of GPIOS) if (board.pins[k].freq) noTone(k); return; }
            const p = board.pins[g]; if (!p) return;
            p.freq = null; p.pwm = null; p.out = 0; board.markDirty();
        }

        async function pulseIn(g, level = 1, timeout = 1000000) {
            g = pinCheck(g, 'pulseIn'); if (g === null) return 0;
            const nets = board.solve();
            const n = nets.find(`board:${g}`);
            const parts = host.project.parts;
            let us = 0;
            for (const p of parts) {
                const def = host.catalog[p.type];
                if (!def || !def.echoFor) continue;
                const r = def.echoFor(p, board, n, level);
                if (r !== null && r !== undefined) { us = r; break; }
            }
            if (!us || us > timeout) {
                if (!us) board.warnOnce('pulse' + g, `⚠ pulseIn(${g}): no pulse arrived. Is an ultrasonic sensor's ECHO wired to GPIO${g}, with TRIG pulsed first and VCC/GND connected?`);
                await delay(Math.min(timeout, 1000000) / 1000);
                return 0;
            }
            await delay(us / 1000);
            return Math.round(us);
        }

        function attachInterrupt(g, fn, mode) {
            g = pinCheck(g, 'attachInterrupt'); if (g === null) return;
            const modes = { 1: 'RISING', 2: 'FALLING', 3: 'CHANGE', 4: 'LOW', 5: 'HIGH' };
            board.isr[g] = { fn, mode: typeof mode === 'string' ? mode : (modes[mode] || 'CHANGE') };
            board.markDirty();
        }

        // ---- libraries ----
        class Servo {
            constructor() { this.pin = null; this.min = 544; this.max = 2400; this.us = 1472; }
            attach(pin, min, max) {
                const g = pinCheck(pin, 'servo.attach'); if (g === null) return 0;
                this.pin = g; if (min) this.min = min; if (max) this.max = max;
                const p = board.pins[g]; p.mode = 'OUTPUT'; p.pulseUs = this.us; p.pwm = this.us / 20000; board.markDirty();
                return 1;
            }
            write(angle) {
                if (angle > 200) return this.writeMicroseconds(angle);
                angle = Math.max(0, Math.min(180, Number(angle) || 0));
                this.writeMicroseconds(this.min + (this.max - this.min) * angle / 180);
            }
            writeMicroseconds(us) {
                this.us = us;
                if (this.pin === null) { board.warnOnce('servo', '⚠ servo.write() before servo.attach(pin).'); return; }
                const p = board.pins[this.pin]; p.pulseUs = us; p.pwm = us / 20000; p.lastHigh = board.millis(); board.markDirty();
            }
            read() { return Math.round((this.us - this.min) / (this.max - this.min) * 180); }
            readMicroseconds() { return this.us; }
            attached() { return this.pin !== null; }
            detach() { if (this.pin !== null) { const p = board.pins[this.pin]; p.pulseUs = null; p.pwm = null; board.markDirty(); } this.pin = null; }
            setPeriodHertz() {}
        }
        const ESP32PWM = { allocateTimer() {} };

        function partOnPin(g, types) {
            const n = board.netOfGpio(g);
            if (!n) return null;
            const nets = board.solve();
            return host.project.parts.find(p => types.includes(p.type) && host.catalog[p.type].pins.some(pin => nets.find(`${p.id}:${pin.id}`) === n)) || null;
        }
        class DHT {
            constructor(pin, type) { this.pin = Number(pin); this.type = type; }
            begin() {}
            reading(field) {
                const p = partOnPin(this.pin, ['dht11', 'dht22']);
                if (!p) { board.warnOnce('dht' + this.pin, `⚠ No DHT sensor's DATA pin is wired to GPIO${this.pin}.`); return NaN; }
                const nets = board.solve();
                const vcc = nets.find(`${p.id}:VCC`), gnd = nets.find(`${p.id}:GND`);
                if (!vcc || vcc.v === null || vcc.v < 2.7 || !gnd || gnd.v !== 0) { board.warnOnce('dhtp' + p.id, '⚠ The DHT sensor has no power: wire VCC to 3V3 or 5V and GND to GND.'); return NaN; }
                return field === 'temp' ? Number(p.props.temp) : Number(p.props.hum);
            }
            readTemperature(f) { const c = this.reading('temp'); return f ? c * 9 / 5 + 32 : c; }
            readHumidity() { return this.reading('hum'); }
            computeHeatIndex(t, h) { return t + 0.05 * h; }
        }
        class DHTesp {
            setup(pin, type) { this.dht = new DHT(pin, type); }
            getTemperature() { return this.dht ? this.dht.readTemperature() : NaN; }
            getHumidity() { return this.dht ? this.dht.readHumidity() : NaN; }
            getTempAndHumidity() { return { temperature: this.getTemperature(), humidity: this.getHumidity() }; }
            getStatusString() { return 'OK'; }
        }
        Object.assign(DHTesp, { DHT11: 11, DHT22: 22, AUTO_DETECT: 0 });
        class NewPing {
            constructor(trig, echo, maxCm = 500) { this.trig = Number(trig); this.echo = Number(echo); this.maxCm = maxCm; }
            ping() {
                board.pins[this.trig].mode = 'OUTPUT'; board.pins[this.trig].lastHigh = board.millis();
                const n = board.netOfGpio(this.echo);
                for (const p of host.project.parts) {
                    const def = host.catalog[p.type];
                    if (def && def.echoFor) { const r = def.echoFor(p, board, n, 1); if (r) return r / 58.3 > this.maxCm ? 0 : Math.round(r); }
                }
                return 0;
            }
            ping_cm() { return Math.round(this.ping() / 58.3); }
            ping_in() { return Math.round(this.ping() / 148); }
            ping_median(it = 5) { return this.ping(); }
            convert_cm(us) { return Math.round(us / 58.3); }
        }
        const prefsStore = host.prefs;
        class Preferences {
            begin(ns) { this.ns = ns; prefsStore[ns] = prefsStore[ns] || {}; return true; }
            end() {}
            clear() { prefsStore[this.ns] = {}; return true; }
            remove(k) { delete prefsStore[this.ns][k]; return true; }
            isKey(k) { return k in prefsStore[this.ns]; }
            put(k, v) { prefsStore[this.ns][k] = v; return 1; }
            get(k, d) { return k in prefsStore[this.ns] ? prefsStore[this.ns][k] : d; }
        }
        for (const t of ['Int', 'UInt', 'Long', 'ULong', 'Float', 'Double', 'Bool', 'String', 'Char', 'UChar', 'Short', 'UShort']) {
            Preferences.prototype['put' + t] = Preferences.prototype.put;
            Preferences.prototype['get' + t] = function (k, d) { return this.get(k, d === undefined ? (t === 'String' ? '' : 0) : d); };
        }

        class IPAddress {
            constructor(a = 0, b = 0, c = 0, d = 0) { this.parts = [a, b, c, d]; }
            toString() { return this.parts.join('.'); }
            fromString(s) { this.parts = String(s).split('.').map(Number); return true; }
        }
        const WL = { WL_IDLE_STATUS: 0, WL_NO_SSID_AVAIL: 1, WL_SCAN_COMPLETED: 2, WL_CONNECTED: 3, WL_CONNECT_FAILED: 4, WL_CONNECTION_LOST: 5, WL_DISCONNECTED: 6 };
        const WiFi = {
            mode() { return true; },
            begin(ssid) {
                board.wifi.ssid = String(ssid || '');
                board.wifi.status = WL.WL_DISCONNECTED;
                board.wifi.connectAt = board.millis() + 900;
                host.log(`[sim] Connecting to Wi-Fi "${board.wifi.ssid}"… (the simulator pretends it works)\n`, 'muted');
                return WL.WL_DISCONNECTED;
            },
            status() {
                if (board.wifi.status === WL.WL_DISCONNECTED && board.wifi.connectAt && board.millis() >= board.wifi.connectAt) board.wifi.status = WL.WL_CONNECTED;
                return board.wifi.status;
            },
            isConnected() { return this.status() === WL.WL_CONNECTED; },
            localIP() { return new IPAddress(192, 168, 1, 42); },
            gatewayIP() { return new IPAddress(192, 168, 1, 1); },
            subnetMask() { return new IPAddress(255, 255, 255, 0); },
            softAP(ssid) { board.wifi.ap = String(ssid || 'ESP32'); host.log(`[sim] Hotspot "${board.wifi.ap}" is up at 192.168.4.1\n`, 'muted'); host.onRemote(); return true; },
            softAPIP() { return new IPAddress(192, 168, 4, 1); },
            softAPConfig() { return true; },
            disconnect() { board.wifi.status = WL.WL_DISCONNECTED; board.wifi.connectAt = 0; return true; },
            reconnect() { return true; },
            setHostname() { return true; },
            setSleep() {},
            RSSI() { return -55; },
            SSID() { return board.wifi.ssid; },
            macAddress() { return '34:85:18:AB:CD:EF'; },
            scanNetworks() { return 2; },
            softAPgetStationNum() { return host.remoteUsers ? 1 : 0; }
        };
        class WebServer {
            constructor(port = 80) {
                this.port = port; this.routes = []; this.notFound = null; this.queue = []; this.req = null; this.started = false;
                board.servers.push(this);
            }
            on(path, a, b) { const handler = typeof a === 'function' ? a : b; this.routes.push({ path: String(path), handler }); host.onRemote(); }
            onNotFound(fn) { this.notFound = fn; }
            begin() { this.started = true; host.log(`[sim] Web server running — use the Remote tab to open its pages\n`, 'muted'); host.onRemote(); }
            close() { this.started = false; }
            stop() { this.started = false; }
            async handleClient() {
                if (!this.queue.length) return;
                const req = this.queue.shift();
                this.req = req;
                const route = this.routes.find(r => r.path === req.path);
                try {
                    if (route) await route.handler();
                    else if (this.notFound) await this.notFound();
                    else this.send(404, 'text/plain', 'Not found');
                } finally { this.req = null; }
            }
            send(code, type = 'text/plain', body = '') { host.onResponse({ path: this.req ? this.req.path : '?', code, type: String(type), body: String(body) }); }
            send_P(code, type, body) { this.send(code, type, body); }
            sendHeader() {}
            arg(name) { const q = this.req ? this.req.args : {}; return typeof name === 'number' ? Object.values(q)[name] || '' : (q[name] || ''); }
            argName(i) { return Object.keys(this.req ? this.req.args : {})[i] || ''; }
            args() { return Object.keys(this.req ? this.req.args : {}).length; }
            hasArg(name) { return !!(this.req && name in this.req.args); }
            uri() { return this.req ? this.req.path : ''; }
            method() { return 1; }
            client() { return { remoteIP: () => new IPAddress(192, 168, 4, 2) }; }
        }
        class HTTPClient {
            begin(url) { this.url = url; return true; }
            addHeader() {}
            setTimeout() {}
            async GET() { board.warnOnce('http', '[sim] The simulator has no internet: HTTP requests return -1.'); return -1; }
            async POST() { return this.GET(); }
            getString() { return ''; }
            end() {}
        }
        class WiFiClient { connect() { return false; } connected() { return false; } stop() {} print() {} println() {} available() { return 0; } read() { return -1; } setInsecure() {} }
        const WiFiClientSecure = WiFiClient;

        const ESP = {
            restart() { host.restart(); throw new Stop(); },
            getChipModel() { return 'ESP32-C3'; },
            getChipRevision() { return 4; },
            getFreeHeap() { return 248000 + Math.round(Math.random() * 1000); },
            getEfuseMac() { return 0x3485180abcdef; },
            getCpuFreqMHz() { return 160; },
            getFlashChipSize() { return 4194304; },
            deepSleep() { host.log('[sim] deep sleep — the simulation stops here\n', 'muted'); throw new Stop(); }
        };

        function __Unknown(name) {
            return new Proxy({}, {
                get(target, prop) {
                    if (prop === 'then') return undefined;
                    if (prop === Symbol.toPrimitive || prop === 'toString') return () => '';
                    return () => 0;
                }
            });
        }

        const math = {
            map: (x, a, b, c, d) => (b === a ? c : Math.trunc((x - a) * (d - c) / (b - a) + c)),
            constrain: (x, a, b) => Math.min(Math.max(x, a), b),
            min: Math.min, max: Math.max, abs: Math.abs, pow: Math.pow, sqrt: Math.sqrt, sq: (x) => x * x,
            sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
            floor: Math.floor, ceil: Math.ceil, round: Math.round, log: Math.log, exp: Math.exp, fabs: Math.abs, fmod: (a, b) => a % b,
            isnan: Number.isNaN, isinf: (x) => !Number.isFinite(x) && !Number.isNaN(x),
            random: (a, b) => (b === undefined ? Math.floor(Math.random() * a) : Math.floor(a + Math.random() * (b - a))),
            randomSeed() {}, esp_random: () => Math.floor(Math.random() * 4294967296),
            bitRead: (x, n) => (x >> n) & 1, bitSet: (x, n) => x | (1 << n), bitClear: (x, n) => x & ~(1 << n),
            bitWrite: (x, n, b) => (b ? x | (1 << n) : x & ~(1 << n)), bit: (n) => 1 << n,
            lowByte: (x) => x & 0xff, highByte: (x) => (x >> 8) & 0xff,
            millis: () => Math.floor(board.millis()), micros: () => Math.floor(board.millis() * 1000)
        };

        const consts = {
            HIGH: 1, LOW: 0, INPUT: 'INPUT', OUTPUT: 'OUTPUT', INPUT_PULLUP: 'INPUT_PULLUP', INPUT_PULLDOWN: 'INPUT_PULLDOWN',
            LED_BUILTIN, BUILTIN_LED: LED_BUILTIN, A0: 0, A1: 1, A2: 2, A3: 3, A4: 4,
            RISING: 'RISING', FALLING: 'FALLING', CHANGE: 'CHANGE', ONLOW: 'LOW', ONHIGH: 'HIGH',
            DEC: 10, HEX: 16, BIN: 2, OCT: 8, PI: Math.PI, TWO_PI: Math.PI * 2, HALF_PI: Math.PI / 2, DEG_TO_RAD: Math.PI / 180, RAD_TO_DEG: 180 / Math.PI,
            WIFI_STA: 1, WIFI_AP: 2, WIFI_AP_STA: 3, WIFI_OFF: 0, WIFI_MODE_STA: 1, WIFI_MODE_AP: 2, WIFI_MODE_APSTA: 3, WIFI_MODE_NULL: 0,
            HTTP_GET: 1, HTTP_POST: 2, HTTP_ANY: 0, HTTP_CODE_OK: 200,
            DHT11: 11, DHT22: 22, DHT21: 21, AM2301: 21,
            ADC_11db: 3, ADC_0db: 0, ADC_6db: 2, ADC_2_5db: 1,
            ...WL
        };

        const api = {
            ...consts, ...math,
            __yield, delay, delayMicroseconds,
            pinMode, digitalWrite, digitalRead, analogRead, analogReadMilliVolts, analogWrite,
            analogReadResolution: (b) => { board.analogBits = b; }, analogWriteResolution: (b) => { board.analogWriteBits = b; },
            analogSetAttenuation() {}, analogSetPinAttenuation() {}, analogWriteFrequency() {},
            ledcAttach, ledcAttachChannel, ledcSetup, ledcAttachPin, ledcWrite, ledcWriteTone, ledcDetach, ledcDetachPin: ledcDetach, ledcChangeFrequency,
            tone, noTone, pulseIn, pulseInLong: pulseIn,
            attachInterrupt, detachInterrupt: (g) => { delete board.isr[g]; }, digitalPinToInterrupt: (g) => g,
            interrupts() {}, noInterrupts() {},
            Serial, Serial0: Serial, Serial1: Serial, USBSerial: Serial,
            Servo, ESP32PWM, DHT, DHTesp, NewPing, Preferences, IPAddress, WiFi, WebServer, HTTPClient, WiFiClient, WiFiClientSecure, ESP,
            __Unknown,
            __int: (x) => { const n = Number(x); return Number.isFinite(n) ? Math.trunc(n) : 0; },
            __String: (x, arg) => (arg === undefined ? (typeof x === 'number' && !Number.isInteger(x) ? x.toFixed(2) : fmtNum(x)) : fmtNum(x, arg)),
            __char: (x) => (typeof x === 'number' ? String.fromCharCode(x) : String(x).charAt(0)),
            __array: function make(fill, ...dims) { const [n, ...rest] = dims; return Array.from({ length: Number(n) || 0 }, () => (rest.length ? make(fill, ...rest) : fill)); },
            __sizeof: (x) => (Array.isArray(x) ? x.length * 4 : typeof x === 'string' ? x.length + 1 : 4),
            __replaceAll: (s, a, b) => String(s).split(String(a)).join(String(b)),
            F: (s) => s,
            isDigit: (c) => /^[0-9]$/.test(c), isAlpha: (c) => /^[A-Za-z]$/.test(c), isSpace: (c) => /^\s$/.test(c),
            isUpperCase: (c) => /^[A-Z]$/.test(c), isLowerCase: (c) => /^[a-z]$/.test(c), isAlphaNumeric: (c) => /^[A-Za-z0-9]$/.test(c),
            esp_restart: () => ESP.restart(),
            vTaskDelay: (t) => delay(t), pdMS_TO_TICKS: (ms) => ms, portTICK_PERIOD_MS: 1
        };
        return { api, stop() { stopped = true; }, Stop };
    }

    // Arduino String methods on JS strings (the sandboxed frame has its own String)
    const sp = String.prototype;
    if (!sp.toInt) {
        sp.toInt = function () { return parseInt(this, 10) || 0; };
        sp.toFloat = function () { return parseFloat(this) || 0; };
        sp.toDouble = sp.toFloat;
        sp.equals = function (o) { return String(this) === String(o); };
        sp.equalsIgnoreCase = function (o) { return String(this).toLowerCase() === String(o).toLowerCase(); };
        sp.compareTo = function (o) { return String(this) < String(o) ? -1 : String(this) > String(o) ? 1 : 0; };
        sp.remove = function (i, n) { return n === undefined ? this.slice(0, i) : this.slice(0, i) + this.slice(i + n); };
        sp.c_str = function () { return String(this); };
        sp.isEmpty = function () { return this.length === 0; };
    }

    const exportsObj = { Board, makeApi, BOARD_PINS, GPIOS, ADC_PINS, LED_BUILTIN, BOOT_PIN, Stop };
    if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;
    else root.SimRuntime = exportsObj;
})(typeof window !== 'undefined' ? window : globalThis);
