// Parts that can be placed and wired to the ESP32-C3. Each part has pins (relative to its top-left),
// controls for the inspector, and up to four hooks the board calls:
//   outputs(p, ctx)  put voltages on the nets of its output pins (sensors, drivers)
//   observe(p, ctx)  read nets into p.state for drawing (LED brightness, servo angle, motor speed)
//   joins(p)         pairs of its own pins that are connected right now (a pressed button)
//   echoFor(p, board, net, level)   microseconds of echo when pulseIn() listens on `net`
(function (root) {
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const label = (x, y, text, size = 9, anchor = 'middle', cls = 'pl') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" class="${cls}">${esc(text)}</text>`;
    const pcb = (w, h, fill = '#1d5fa8') => `<rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="#0004"/>`;
    const header = (pins, y, h = 10) => pins.map(p => `<rect x="${p.x - 4}" y="${y}" width="8" height="${h}" fill="#222"/>`).join('');
    const powerBadge = (p, w) => (p.state && p.state.unpowered ? `<g transform="translate(${w - 14},-8)"><circle r="8" fill="#ffb547"/><text y="3.5" font-size="11" font-weight="700" text-anchor="middle" fill="#1a1200">!</text></g>` : '');
    const ledColors = { red: '#ff3b30', green: '#2fe36b', blue: '#3b8cff', yellow: '#ffd60a', white: '#f4f4f4', orange: '#ff9500' };
    const mountOptions = (opts) => ({ prop: 'mount', label: 'Mounted on', type: 'select', options: opts });

    const CATALOG = {
        led: {
            label: 'LED', group: 'Basic', w: 44, h: 70,
            pins: [{ id: 'A', label: 'Anode (+)', x: 15, y: 66 }, { id: 'K', label: 'Cathode (−)', x: 29, y: 66 }],
            props: { color: 'red' },
            controls: [{ prop: 'color', label: 'Colour', type: 'select', options: Object.keys(ledColors) }],
            notes: 'Long leg (+) to a GPIO, short leg (−) to GND. (The simulator includes the 220 Ω resistor.)',
            observe(p, ctx) {
                const a = ctx.net(p, 'A'), k = ctx.net(p, 'K');
                let b = 0;
                const lowSide = k && k.v !== null && k.v < 0.5;
                if (a && lowSide && a.pwm !== null && a.pwm !== undefined) b = a.pwm;      // PWM: brightness = duty cycle
                else if (a && lowSide && a.v !== null && a.v - k.v > 1.5) b = 1;
                p.state = { b };
            },
            svg(p) {
                const c = ledColors[p.props.color] || ledColors.red;
                const b = (p.state && p.state.b) || 0;
                return `${b > 0.02 ? `<circle cx="22" cy="22" r="${16 + b * 10}" fill="${c}" opacity="${0.25 * b}" class="glow"/>` : ''}
                    <path d="M8,36 V20 A14,14 0 0 1 36,20 V36 Z" fill="${c}" opacity="${0.35 + 0.65 * b}" stroke="#0006"/>
                    <rect x="5" y="36" width="34" height="5" rx="1" fill="${c}" opacity="0.8"/>
                    <line x1="15" y1="41" x2="15" y2="62" stroke="#999" stroke-width="2.5"/><line x1="29" y1="41" x2="29" y2="58" stroke="#999" stroke-width="2.5"/>`;
            }
        },
        rgbled: {
            label: 'RGB LED', group: 'Basic', w: 60, h: 72,
            pins: [{ id: 'R', label: 'Red', x: 12, y: 68 }, { id: 'GND', label: 'GND (common −)', x: 24, y: 68 }, { id: 'G', label: 'Green', x: 36, y: 68 }, { id: 'B', label: 'Blue', x: 48, y: 68 }],
            props: {},
            notes: 'Common-cathode: the long leg goes to GND, the others to GPIOs (use analogWrite to mix colours).',
            observe(p, ctx) {
                const ch = (pin) => { const n = ctx.net(p, pin); const g = ctx.grounded(p); return n && g && n.v !== null && n.v > 0.2 ? (n.pwm ?? (n.v > 1.5 ? 1 : 0)) : 0; };
                p.state = { r: ch('R'), g: ch('G'), b: ch('B') };
            },
            svg(p) {
                const s = p.state || { r: 0, g: 0, b: 0 };
                const col = `rgb(${Math.round(40 + 215 * s.r)},${Math.round(40 + 215 * s.g)},${Math.round(40 + 215 * s.b)})`;
                const on = Math.max(s.r, s.g, s.b);
                return `${on > 0.02 ? `<circle cx="30" cy="22" r="${18 + on * 8}" fill="${col}" opacity="${0.3 * on}"/>` : ''}
                    <path d="M14,38 V22 A16,16 0 0 1 46,22 V38 Z" fill="${col}" stroke="#0006" opacity="0.95"/>
                    ${[12, 24, 36, 48].map((x, i) => `<line x1="${x}" y1="38" x2="${x}" y2="${i === 1 ? 64 : 60}" stroke="#999" stroke-width="2.5"/>`).join('')}`;
            }
        },
        button: {
            label: 'Pushbutton', group: 'Basic', w: 60, h: 60,
            pins: [{ id: '1', label: 'Leg 1', x: 8, y: 56 }, { id: '2', label: 'Leg 2', x: 52, y: 56 }],
            props: { pressed: false },
            controls: [{ prop: 'pressed', label: 'Hold to press (or click the button)', type: 'hold' }],
            notes: 'Press joins leg 1 to leg 2. Typical: leg 1 → GPIO with INPUT_PULLUP, leg 2 → GND (pressed reads LOW).',
            clickable: true,
            joins(p) { return p.props.pressed ? [['1', '2']] : []; },
            svg(p) {
                const d = p.props.pressed;
                return `<rect x="4" y="8" width="52" height="40" rx="4" fill="#2d3238" stroke="#0008"/>
                    <circle cx="30" cy="28" r="${d ? 11 : 13}" fill="${d ? '#a01818' : '#e03131'}" stroke="#0007"/>
                    <line x1="8" y1="48" x2="8" y2="52" stroke="#aaa" stroke-width="3"/><line x1="52" y1="48" x2="52" y2="52" stroke="#aaa" stroke-width="3"/>`;
            }
        },
        pot: {
            label: 'Potentiometer', group: 'Basic', w: 70, h: 70,
            pins: [{ id: 'VCC', label: 'VCC', x: 13, y: 66 }, { id: 'OUT', label: 'Wiper (OUT)', x: 35, y: 66 }, { id: 'GND', label: 'GND', x: 57, y: 66 }],
            props: { value: 50 },
            controls: [{ prop: 'value', label: 'Knob', type: 'range', min: 0, max: 100, unit: '%' }],
            notes: 'Outer legs to 3V3 and GND, the middle leg to an ADC pin (GPIO0–4). analogRead gives 0–4095.',
            outputs(p, ctx) {
                const vcc = ctx.v(p, 'VCC');
                if (vcc !== null && ctx.grounded(p)) ctx.drive(p, 'OUT', vcc * p.props.value / 100);
            },
            svg(p) {
                const a = -135 + 270 * p.props.value / 100;
                return `<rect x="5" y="14" width="60" height="42" rx="6" fill="#2b6cb0"/><circle cx="35" cy="34" r="17" fill="#e8eef5" stroke="#0005"/>
                    <line x1="35" y1="34" x2="${35 + 13 * Math.sin(a * Math.PI / 180)}" y2="${34 - 13 * Math.cos(a * Math.PI / 180)}" stroke="#333" stroke-width="3" stroke-linecap="round"/>
                    ${label(35, 10, p.props.value + '%', 9, 'middle', 'pv')}
                    ${[13, 35, 57].map(x => `<line x1="${x}" y1="56" x2="${x}" y2="62" stroke="#aaa" stroke-width="3"/>`).join('')}`;
            }
        },
        joystick: {
            label: 'Joystick', group: 'Basic', w: 90, h: 92,
            pins: [{ id: 'GND', label: 'GND', x: 10, y: 88 }, { id: 'VCC', label: '+5V / 3V3', x: 27, y: 88 }, { id: 'VRX', label: 'VRx', x: 45, y: 88 }, { id: 'VRY', label: 'VRy', x: 63, y: 88 }, { id: 'SW', label: 'SW', x: 80, y: 88 }],
            props: { x: 0, y: 0, pressed: false },
            controls: [{ prop: 'x', label: 'X', type: 'range', min: -100, max: 100 }, { prop: 'y', label: 'Y', type: 'range', min: -100, max: 100 }, { prop: 'pressed', label: 'Press stick', type: 'hold' }],
            notes: 'VRx/VRy to ADC pins (GPIO0–4): centre reads about half. SW goes LOW when pressed (use INPUT_PULLUP).',
            outputs(p, ctx) {
                if (!ctx.powered(p, 'VCC', 'GND', 2.5)) return;
                const vcc = Math.min(3.3, ctx.v(p, 'VCC'));
                ctx.drive(p, 'VRX', vcc * (p.props.x + 100) / 200);
                ctx.drive(p, 'VRY', vcc * (p.props.y + 100) / 200);
                if (p.props.pressed) ctx.drive(p, 'SW', 0);
            },
            svg(p) {
                return `${pcb(90, 80, '#1b1f24')}<circle cx="45" cy="38" r="26" fill="#2b3036" stroke="#000"/>
                    <circle cx="${45 + p.props.x * 0.16}" cy="${38 + p.props.y * 0.16}" r="14" fill="${p.props.pressed ? '#555' : '#777'}" stroke="#000"/>
                    ${header(this.pins, 80, 8)}`;
            }
        },
        buzzer: {
            label: 'Buzzer', group: 'Basic', w: 56, h: 66,
            pins: [{ id: 'P', label: '+', x: 20, y: 62 }, { id: 'N', label: '−', x: 36, y: 62 }],
            props: {},
            notes: '+ to a GPIO, − to GND. tone(pin, 1000) plays 1 kHz; digitalWrite HIGH beeps.',
            observe(p, ctx) {
                const a = ctx.net(p, 'P');
                const on = !!(a && a.v !== null && ctx.grounded(p, 'N') && (a.freq || (a.v > 1.5)));
                p.state = { on, freq: on ? (a.freq || 2000) : 0 };
            },
            svg(p) {
                const on = p.state && p.state.on;
                return `<circle cx="28" cy="28" r="24" fill="#16191d" stroke="#000"/><circle cx="28" cy="28" r="5" fill="#444"/>
                    ${on ? `<path d="M52,14 q8,14 0,28 M58,8 q12,20 0,40" stroke="#ffb547" stroke-width="2.5" fill="none"/>${label(28, 8, (p.state.freq | 0) + ' Hz', 9, 'middle', 'pv')}` : ''}
                    <line x1="20" y1="52" x2="20" y2="58" stroke="#aaa" stroke-width="3"/><line x1="36" y1="52" x2="36" y2="58" stroke="#aaa" stroke-width="3"/>`;
            }
        },
        relay: {
            label: 'Relay module', group: 'Basic', w: 90, h: 70,
            pins: [{ id: 'VCC', label: 'VCC', x: 20, y: 66 }, { id: 'GND', label: 'GND', x: 45, y: 66 }, { id: 'IN', label: 'IN', x: 70, y: 66 }],
            props: { activeLow: false },
            controls: [{ prop: 'activeLow', label: 'Switches on when IN is LOW', type: 'toggle' }],
            notes: 'Switches a lamp or pump. Most cheap modules switch on when IN is LOW — tick the box above to match yours.',
            observe(p, ctx) {
                const powered = ctx.powered(p);
                const n = ctx.net(p, 'IN');
                const high = !!(n && n.v !== null && n.v > 1.5);
                p.state = { unpowered: !powered, on: powered && n && n.v !== null && (p.props.activeLow ? !high : high) };
            },
            svg(p) {
                const on = p.state && p.state.on;
                return `${pcb(90, 58, '#1c6b3a')}<rect x="10" y="8" width="44" height="32" rx="3" fill="#2a74c9"/>${label(32, 28, 'RELAY', 9, 'middle', 'pw')}
                    <circle cx="72" cy="20" r="6" fill="${on ? '#ff3b30' : '#401010'}"/>${label(72, 44, on ? 'ON' : 'OFF', 10, 'middle', 'pw')}
                    ${header(this.pins, 58, 8)}${powerBadge(p, 90)}`;
            }
        },
        hcsr04: {
            label: 'Ultrasonic HC-SR04', group: 'Sensors', w: 124, h: 74,
            pins: [{ id: 'VCC', label: 'VCC (5V)', x: 38, y: 70 }, { id: 'TRIG', label: 'TRIG', x: 54, y: 70 }, { id: 'ECHO', label: 'ECHO', x: 70, y: 70 }, { id: 'GND', label: 'GND', x: 86, y: 70 }],
            props: { distance: 50, mount: 'none' },
            controls: [{ prop: 'distance', label: 'Distance', type: 'range', min: 2, max: 400, unit: 'cm' }, mountOptions(['none', 'front', 'bin'])],
            notes: 'VCC → 5V, GND → GND, TRIG and ECHO → GPIOs. Measure with pulseIn(echo, HIGH) after a 10 µs TRIG pulse. On a real board, put a divider on ECHO (5 V).',
            distance(p, world) { const d = world && world.distanceFor(p); return d === null || d === undefined ? Number(p.props.distance) : d; },
            echoFor(p, board, n, level) {
                const nets = board.solve();
                if (!n || nets.find(`${p.id}:ECHO`) !== n || !level) return null;
                const vcc = nets.find(`${p.id}:VCC`), gnd = nets.find(`${p.id}:GND`);
                if (!vcc || vcc.v === null || vcc.v < 3 || !gnd || gnd.v !== 0) { board.warnOnce('us' + p.id, '⚠ The ultrasonic sensor has no power: VCC → 5V, GND → GND.'); return 0; }
                // TRIG must be wired to an output pin that went HIGH recently
                const trig = nets.find(`${p.id}:TRIG`);
                const trigger = Object.entries(board.pins).find(([g, s]) => s.mode === 'OUTPUT' && nets.find(`board:${g}`) === trig);
                if (!trig || !trigger) { board.warnOnce('trig' + p.id, '⚠ The ultrasonic sensor\'s TRIG isn\'t wired to an OUTPUT pin.'); return 0; }
                if (board.millis() - trigger[1].lastHigh > 200) { board.warnOnce('trigp' + p.id, '⚠ Send a TRIG pulse first: digitalWrite(trig, HIGH); delayMicroseconds(10); digitalWrite(trig, LOW);'); return 0; }
                const cm = clamp(this.distance(p, board.host.world), 2, 400);
                p.state = { ...(p.state || {}), lastCm: cm, pingAt: board.millis() };
                return cm * 58.3 * (1 + (Math.random() - 0.5) * 0.01);
            },
            observe(p, ctx) { p.state = { ...(p.state || {}), unpowered: !ctx.powered(p, 'VCC', 'GND', 3), cm: this.distance(p, ctx.world) }; },
            svg(p) {
                const pinging = p.state && p.state.pingAt && (performance.now() - (p.state.pingAt + 0)) < 300;
                const cm = p.state && p.state.cm !== undefined ? p.state.cm : p.props.distance;
                return `${pcb(124, 62, '#1971c2')}
                    <circle cx="30" cy="28" r="20" fill="#cfd6de" stroke="#5c6670" stroke-width="3"/><circle cx="30" cy="28" r="11" fill="#7a848e"/>
                    <circle cx="94" cy="28" r="20" fill="#cfd6de" stroke="#5c6670" stroke-width="3"/><circle cx="94" cy="28" r="11" fill="#7a848e"/>
                    ${label(62, 12, 'HC-SR04', 8, 'middle', 'pw')}${label(62, 58, Math.round(cm) + ' cm', 9, 'middle', 'pw')}
                    ${pinging ? '<path d="M18,-6 q44,-14 88,0" stroke="#2fe39a" stroke-width="2" fill="none" opacity="0.8"/>' : ''}
                    ${header(this.pins, 62, 8)}${powerBadge(p, 124)}`;
            }
        },
        irobstacle: {
            label: 'IR obstacle sensor', group: 'Sensors', w: 74, h: 84,
            pins: [{ id: 'VCC', label: 'VCC', x: 19, y: 80 }, { id: 'GND', label: 'GND', x: 37, y: 80 }, { id: 'OUT', label: 'OUT', x: 55, y: 80 }],
            props: { obstacle: false, mount: 'none' },
            controls: [{ prop: 'obstacle', label: 'Obstacle in front', type: 'toggle' }, mountOptions(['none', 'left', 'right', 'front', 'bin'])],
            notes: 'OUT goes LOW when something is close (its green LED lights). VCC → 3V3, GND → GND, OUT → any GPIO.',
            sees(p, world) { const w = world && world.obstacleFor(p); return w === null || w === undefined ? !!p.props.obstacle : w; },
            outputs(p, ctx) { if (ctx.powered(p)) ctx.drive(p, 'OUT', this.sees(p, ctx.world) ? 0 : 3.3); },
            observe(p, ctx) { p.state = { unpowered: !ctx.powered(p), seen: this.sees(p, ctx.world) }; },
            svg(p) {
                const seen = p.state && p.state.seen && !p.state.unpowered;
                return `${pcb(74, 72, '#1b1f24')}<rect x="14" y="-6" width="14" height="20" rx="4" fill="#ddd"/><rect x="44" y="-6" width="14" height="20" rx="4" fill="#222" stroke="#555"/>
                    <circle cx="20" cy="46" r="5" fill="${seen ? '#2fe36b' : '#0e3a1c'}"/><circle cx="52" cy="46" r="5" fill="${p.state && !p.state.unpowered ? '#ff3b30' : '#3a0e0e'}"/>
                    <circle cx="36" cy="30" r="6" fill="#2a74c9"/>${label(37, 64, seen ? 'BLOCKED' : 'clear', 8, 'middle', 'pw')}
                    ${header(this.pins, 72, 8)}${powerBadge(p, 74)}`;
            }
        },
        irline: {
            label: 'IR line sensor', group: 'Sensors', w: 70, h: 84,
            pins: [{ id: 'VCC', label: 'VCC', x: 14, y: 80 }, { id: 'GND', label: 'GND', x: 28, y: 80 }, { id: 'DO', label: 'DO', x: 42, y: 80 }, { id: 'AO', label: 'AO', x: 56, y: 80 }],
            props: { onLine: false, mount: 'none' },
            controls: [{ prop: 'onLine', label: 'Over the black line', type: 'toggle' }, mountOptions(['none', 'left', 'center', 'right'])],
            notes: 'TCRT5000 module: DO is HIGH over a black line and LOW over white. AO gives the reflection as a voltage.',
            black(p, world) { const w = world && world.lineFor(p); return w === null || w === undefined ? !!p.props.onLine : w; },
            outputs(p, ctx) {
                if (!ctx.powered(p)) return;
                const b = this.black(p, ctx.world);
                ctx.drive(p, 'DO', b ? 3.3 : 0);
                ctx.drive(p, 'AO', b ? 2.9 : 0.4);
            },
            observe(p, ctx) { p.state = { unpowered: !ctx.powered(p), black: this.black(p, ctx.world) }; },
            svg(p) {
                const b = p.state && p.state.black;
                return `${pcb(70, 72, '#1b1f24')}<rect x="20" y="4" width="30" height="18" rx="3" fill="#111" stroke="#666"/><circle cx="29" cy="13" r="5" fill="#3b8cff"/><circle cx="41" cy="13" r="5" fill="#222" stroke="#777"/>
                    <circle cx="35" cy="40" r="5" fill="${b && !p.state.unpowered ? '#2fe36b' : '#0e3a1c'}"/>${label(35, 62, b ? 'black' : 'white', 9, 'middle', 'pw')}
                    ${header(this.pins, 72, 8)}${powerBadge(p, 70)}`;
            }
        },
        pir: {
            label: 'PIR motion sensor', group: 'Sensors', w: 80, h: 84,
            pins: [{ id: 'VCC', label: 'VCC', x: 22, y: 80 }, { id: 'OUT', label: 'OUT', x: 40, y: 80 }, { id: 'GND', label: 'GND', x: 58, y: 80 }],
            props: { motion: false },
            controls: [{ prop: 'motion', label: 'Someone moves', type: 'toggle' }],
            notes: 'HC-SR501: OUT goes HIGH while it sees movement. VCC → 5V, GND → GND, OUT → any GPIO.',
            outputs(p, ctx) { if (ctx.powered(p)) ctx.drive(p, 'OUT', p.props.motion ? 3.3 : 0); },
            observe(p, ctx) { p.state = { unpowered: !ctx.powered(p) }; },
            svg(p) {
                return `${pcb(80, 72, '#1c6b3a')}<circle cx="40" cy="34" r="27" fill="${p.props.motion ? '#fff7d6' : '#f1f3f5'}" stroke="#adb5bd"/>
                    <path d="M22,34 a18,18 0 0 1 36,0" fill="none" stroke="#ced4da"/>${label(40, 66, p.props.motion ? 'MOTION' : 'still', 8, 'middle', 'pw')}
                    ${header(this.pins, 72, 8)}${powerBadge(p, 80)}`;
            }
        },
        ldr: {
            label: 'Light sensor (LDR)', group: 'Sensors', w: 70, h: 84,
            pins: [{ id: 'VCC', label: 'VCC', x: 14, y: 80 }, { id: 'GND', label: 'GND', x: 28, y: 80 }, { id: 'DO', label: 'DO', x: 42, y: 80 }, { id: 'AO', label: 'AO', x: 56, y: 80 }],
            props: { light: 70 },
            controls: [{ prop: 'light', label: 'Light', type: 'range', min: 0, max: 100, unit: '%' }],
            notes: 'AO goes up as it gets darker (to an ADC pin, GPIO0–4). DO goes HIGH when it is dark.',
            outputs(p, ctx) {
                if (!ctx.powered(p)) return;
                const vcc = Math.min(3.3, ctx.v(p, 'VCC'));
                ctx.drive(p, 'AO', vcc * (1 - p.props.light / 100));
                ctx.drive(p, 'DO', p.props.light < 30 ? 3.3 : 0);
            },
            observe(p, ctx) { p.state = { unpowered: !ctx.powered(p) }; },
            svg(p) {
                return `${pcb(70, 72, '#1b1f24')}<circle cx="35" cy="22" r="14" fill="#ffe8cc" stroke="#e8590c"/>
                    <path d="M26,18 q4,-6 9,0 t9,0 M26,26 q4,-6 9,0 t9,0" fill="none" stroke="#e8590c" stroke-width="2"/>
                    <circle cx="35" cy="22" r="22" fill="#ffd43b" opacity="${p.props.light / 300}"/>${label(35, 56, p.props.light + '% light', 8, 'middle', 'pw')}
                    ${header(this.pins, 72, 8)}${powerBadge(p, 70)}`;
            }
        },
        dht11: {
            label: 'DHT11 temp & humidity', group: 'Sensors', w: 62, h: 92,
            pins: [{ id: 'VCC', label: 'VCC', x: 13, y: 88 }, { id: 'DATA', label: 'DATA', x: 31, y: 88 }, { id: 'GND', label: 'GND', x: 49, y: 88 }],
            props: { temp: 28, hum: 60 },
            controls: [{ prop: 'temp', label: 'Temperature', type: 'range', min: 0, max: 50, unit: '°C' }, { prop: 'hum', label: 'Humidity', type: 'range', min: 20, max: 95, unit: '%' }],
            notes: 'DATA → a GPIO. Use the DHT library: DHT dht(pin, DHT11); dht.readTemperature();',
            observe(p, ctx) { p.state = { unpowered: !ctx.powered(p) }; },
            svg(p) {
                return `<rect x="6" y="0" width="50" height="74" rx="5" fill="#3b8cff" stroke="#0006"/>
                    ${[0, 1, 2, 3, 4, 5].map(r => `<rect x="14" y="${8 + r * 9}" width="34" height="5" rx="2" fill="#fff6"/>`).join('')}
                    ${label(31, 68, `${p.props.temp}° ${p.props.hum}%`, 8.5, 'middle', 'pw')}
                    ${[13, 31, 49].map(x => `<line x1="${x}" y1="74" x2="${x}" y2="84" stroke="#aaa" stroke-width="3"/>`).join('')}${powerBadge(p, 62)}`;
            }
        },
        soil: {
            label: 'Soil moisture sensor', group: 'Sensors', w: 56, h: 120,
            pins: [{ id: 'VCC', label: 'VCC', x: 14, y: 4 }, { id: 'GND', label: 'GND', x: 28, y: 4 }, { id: 'AO', label: 'AO', x: 42, y: 4 }],
            props: { moisture: 40 },
            controls: [{ prop: 'moisture', label: 'Soil moisture', type: 'range', min: 0, max: 100, unit: '%' }],
            notes: 'AO (to GPIO0–4) is HIGH when dry and drops as the soil gets wet.',
            outputs(p, ctx) { if (ctx.powered(p)) ctx.drive(p, 'AO', Math.min(3.3, ctx.v(p, 'VCC')) * (1 - p.props.moisture / 100) * 0.9 + 0.2); },
            observe(p, ctx) { p.state = { unpowered: !ctx.powered(p) }; },
            svg(p) {
                return `<path d="M6,10 h44 v60 l-8,46 h-6 l-6,-40 l-6,40 h-6 l-8,-46 z" fill="#c92a2a" stroke="#0006"/>
                    <rect x="0" y="80" width="56" height="40" fill="#8a5a2b" opacity="${0.25 + p.props.moisture / 160}"/>
                    ${label(28, 46, p.props.moisture + '%', 9, 'middle', 'pw')}${powerBadge(p, 56)}`;
            }
        },
        mq2: {
            label: 'Gas sensor MQ-2', group: 'Sensors', w: 70, h: 84,
            pins: [{ id: 'VCC', label: 'VCC', x: 14, y: 80 }, { id: 'GND', label: 'GND', x: 28, y: 80 }, { id: 'DO', label: 'DO', x: 42, y: 80 }, { id: 'AO', label: 'AO', x: 56, y: 80 }],
            props: { gas: 10 },
            controls: [{ prop: 'gas', label: 'Gas / smoke', type: 'range', min: 0, max: 100, unit: '%' }],
            notes: 'AO rises with smoke or gas (GPIO0–4). DO goes LOW above the module\'s threshold.',
            outputs(p, ctx) {
                if (!ctx.powered(p)) return;
                ctx.drive(p, 'AO', 0.3 + 2.9 * p.props.gas / 100);
                ctx.drive(p, 'DO', p.props.gas > 50 ? 0 : 3.3);
            },
            observe(p, ctx) { p.state = { unpowered: !ctx.powered(p) }; },
            svg(p) {
                return `${pcb(70, 72, '#1b1f24')}<circle cx="35" cy="30" r="22" fill="#adb5bd" stroke="#495057" stroke-width="3"/>
                    <circle cx="35" cy="30" r="14" fill="url(#mesh)" stroke="#868e96"/>${p.props.gas > 30 ? `<circle cx="35" cy="30" r="24" fill="#868e96" opacity="${p.props.gas / 200}"/>` : ''}
                    ${label(35, 64, p.props.gas + '% gas', 8, 'middle', 'pw')}${header(this.pins, 72, 8)}${powerBadge(p, 70)}`;
            }
        },
        servo: {
            label: 'Servo SG90', group: 'Motors', w: 100, h: 66,
            pins: [{ id: 'GND', label: 'GND (brown)', x: 4, y: 18 }, { id: 'VCC', label: 'V+ (red)', x: 4, y: 32 }, { id: 'SIG', label: 'Signal (orange)', x: 4, y: 46 }],
            props: { mount: 'none' },
            controls: [mountOptions(['none', 'lid'])],
            notes: 'Brown → GND, red → 5V, orange → a GPIO. Use ESP32Servo: servo.attach(pin); servo.write(90);',
            observe(p, ctx) {
                const powered = ctx.powered(p, 'VCC', 'GND', 3);
                const s = ctx.net(p, 'SIG');
                let angle = p.state && p.state.angle !== undefined ? p.state.angle : 90;
                if (powered && s && s.pulseUs) angle = clamp((s.pulseUs - 544) / (2400 - 544) * 180, 0, 180);
                p.state = { unpowered: !powered, angle };
            },
            svg(p) {
                const a = p.state ? p.state.angle : 90;
                return `<rect x="16" y="14" width="66" height="38" rx="4" fill="#1971c2" stroke="#0006"/><rect x="6" y="26" width="10" height="14" fill="#1864ab"/><rect x="82" y="26" width="10" height="14" fill="#1864ab"/>
                    <circle cx="64" cy="33" r="9" fill="#e9ecef"/>
                    <g transform="translate(64,33) rotate(${a - 90})"><rect x="-4" y="-34" width="8" height="38" rx="4" fill="#f8f9fa" stroke="#868e96"/></g>
                    ${label(36, 36, Math.round(a) + '°', 10, 'middle', 'pw')}
                    <path d="M4,18 H16 M4,32 H16 M4,46 H16" stroke-width="3" stroke="#8b4513"/>${powerBadge(p, 100)}`;
            }
        },
        l298n: {
            label: 'L298N motor driver', group: 'Motors', w: 170, h: 150,
            pins: [
                { id: 'OUT1', label: 'OUT1 (motor A)', x: 4, y: 44 }, { id: 'OUT2', label: 'OUT2 (motor A)', x: 4, y: 64 },
                { id: 'OUT3', label: 'OUT3 (motor B)', x: 166, y: 44 }, { id: 'OUT4', label: 'OUT4 (motor B)', x: 166, y: 64 },
                { id: 'GND', label: 'GND (join to ESP32 GND)', x: 30, y: 146 },
                { id: 'ENA', label: 'ENA (speed A, optional)', x: 58, y: 146 }, { id: 'IN1', label: 'IN1', x: 74, y: 146 }, { id: 'IN2', label: 'IN2', x: 90, y: 146 },
                { id: 'IN3', label: 'IN3', x: 106, y: 146 }, { id: 'IN4', label: 'IN4', x: 122, y: 146 }, { id: 'ENB', label: 'ENB (speed B, optional)', x: 138, y: 146 }
            ],
            props: {},
            notes: 'IN1/IN2 set motor A\'s direction, IN3/IN4 motor B\'s. Leave ENA/ENB unwired for full speed (jumpers on), or wire them to PWM pins for speed. The battery is built in; join its GND to the ESP32 GND.',
            outputs(p, ctx) {
                const grounded = ctx.grounded(p);
                const hi = (pin) => { const n = ctx.net(p, pin); return !!(n && n.v !== null && n.v > 1.5); };
                const speed = (pin) => { const n = ctx.net(p, pin); if (!n) return 1; if (n.v === null) return 0; return n.pwm !== null && n.pwm !== undefined ? n.pwm : (n.v > 1.5 ? 1 : 0); };
                const side = (a, b, en, o1, o2) => {
                    if (!grounded) return 0;
                    const dir = hi(a) && !hi(b) ? 1 : !hi(a) && hi(b) ? -1 : 0;
                    const s = speed(en);
                    ctx.drive(p, o1, dir > 0 ? 6 * s : 0);
                    ctx.drive(p, o2, dir < 0 ? 6 * s : 0);
                    return dir * s;
                };
                p.state = { unpowered: !grounded, a: side('IN1', 'IN2', 'ENA', 'OUT1', 'OUT2'), b: side('IN3', 'IN4', 'ENB', 'OUT3', 'OUT4') };
            },
            svg(p) {
                const s = p.state || { a: 0, b: 0 };
                const arrow = (x, v) => (Math.abs(v) < 0.05 ? label(x, 112, 'stop', 9, 'middle', 'pw') : label(x, 112, `${v > 0 ? '▲' : '▼'} ${Math.round(Math.abs(v) * 100)}%`, 10, 'middle', 'pw'));
                return `${pcb(170, 138, '#b02525')}<rect x="54" y="10" width="62" height="56" rx="4" fill="#111"/>
                    ${[0, 1, 2, 3, 4, 5, 6].map(k => `<rect x="${58 + k * 8}" y="4" width="4" height="10" fill="#333"/>`).join('')}
                    ${label(85, 44, 'L298N', 11, 'middle', 'pw')}
                    <rect x="0" y="36" width="22" height="38" fill="#1f6fb2"/><rect x="148" y="36" width="22" height="38" fill="#1f6fb2"/>
                    ${label(32, 96, 'Motor A', 8, 'middle', 'pw')}${label(138, 96, 'Motor B', 8, 'middle', 'pw')}
                    ${arrow(32, s.a)}${arrow(138, s.b)}
                    <rect x="12" y="122" width="40" height="12" rx="2" fill="#1f6fb2"/>${label(30, 131, '12V GND 5V', 6.5, 'middle', 'pw')}
                    ${header(this.pins.filter(x => x.y === 146), 138, 8)}${powerBadge(p, 170)}`;
            }
        },
        motor: {
            label: 'DC motor (wheel)', group: 'Motors', w: 74, h: 74,
            pins: [{ id: 'P', label: 'Motor +', x: 22, y: 70 }, { id: 'N', label: 'Motor −', x: 52, y: 70 }],
            props: { side: 'none' },
            controls: [{ prop: 'side', label: 'Wheel on the car', type: 'select', options: ['none', 'left', 'right'] }],
            notes: 'Connect its two wires to OUT1/OUT2 (or OUT3/OUT4) of the L298N. Swap them to reverse the direction.',
            observe(p, ctx) {
                const a = ctx.v(p, 'P'), b = ctx.v(p, 'N');
                const speed = a === null || b === null ? 0 : clamp((a - b) / 6, -1, 1);
                const prev = p.state || { angle: 0 };
                p.state = { speed, angle: prev.angle || 0 };
            },
            svg(p) {
                const s = p.state || { speed: 0, angle: 0 };
                s.angle = ((s.angle || 0) + s.speed * 25) % 360;
                return `<circle cx="37" cy="33" r="30" fill="#212529" stroke="#000"/><circle cx="37" cy="33" r="22" fill="#ffd43b"/>
                    <g transform="translate(37,33) rotate(${s.angle})">${[0, 60, 120].map(r => `<rect x="-2.5" y="-21" width="5" height="42" rx="2" fill="#e67700" transform="rotate(${r})"/>`).join('')}</g>
                    <circle cx="37" cy="33" r="5" fill="#495057"/>
                    ${p.props.side !== 'none' ? label(37, 8, p.props.side + ' wheel', 9, 'middle', 'pv') : ''}
                    ${Math.abs(s.speed) > 0.02 ? label(37, 68, (s.speed > 0 ? '⟳ ' : '⟲ ') + Math.round(Math.abs(s.speed) * 100) + '%', 9, 'middle', 'pv') : ''}`;
            }
        }
    };
    CATALOG.dht22 = { ...CATALOG.dht11, label: 'DHT22 temp & humidity', notes: 'DATA → a GPIO. DHT dht(pin, DHT22); dht.readHumidity();' };

    const GROUPS = ['Basic', 'Sensors', 'Motors'];
    const api = { CATALOG, GROUPS, esc };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SimParts = api;
})(typeof window !== 'undefined' ? window : globalThis);
