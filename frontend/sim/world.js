// Worlds the sensors look at and the motors move in:
//   arena  a robot car among walls and boxes (ultrasonic + IR obstacle sensors see them)
//   line   a robot car on a white floor with a black track (IR line sensors read it)
//   bin    a smart dustbin: a hand in front of the ultrasonic sensor, a lid on the servo
// Distances are in cm. Sensors use their part's "mount" to know where they sit on the car.
(function (root) {
    const ARENA = { w: 300, h: 200 };
    const CAR = { len: 20, wid: 14, wheelBase: 20, maxSpeed: 38 };

    function rectsForArena() {
        return [{ x: 120, y: 40, w: 30, h: 30 }, { x: 210, y: 120, w: 40, h: 25 }, { x: 60, y: 130, w: 25, h: 35 }];
    }

    class World {
        constructor(type) {
            this.type = type || 'none';
            this.reset();
        }
        reset() {
            this.boxes = this.type === 'arena' ? rectsForArena() : [];
            this.car = this.type === 'line' ? { x: 150, y: 35, th: 0 } : { x: 40, y: 40, th: 0.5 };
            this.hand = 60;       // bin: hand distance from the sensor, cm
            this.bumped = false;
            this.trail = [];
            this.lineMask = null;
            if (this.type === 'line') this.buildTrack();
        }
        setType(type) { this.type = type; this.reset(); }
        hasCar() { return this.type === 'arena' || this.type === 'line'; }

        // ---- the line track, drawn once into a 1 px = 1 cm mask ----
        buildTrack() {
            const c = document.createElement('canvas');
            c.width = ARENA.w; c.height = ARENA.h;
            const g = c.getContext('2d');
            g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
            g.strokeStyle = '#000'; g.lineWidth = 3.5; g.lineJoin = 'round';
            g.beginPath();
            g.moveTo(60, 35);
            g.lineTo(240, 35);
            g.bezierCurveTo(300, 35, 300, 120, 245, 125);
            g.bezierCurveTo(200, 130, 190, 90, 150, 100);
            g.bezierCurveTo(110, 110, 130, 170, 80, 170);
            g.bezierCurveTo(20, 170, 0, 35, 60, 35);
            g.stroke();
            this.lineCanvas = c;
            this.lineMask = g.getImageData(0, 0, c.width, c.height).data;
        }
        isBlack(x, y) {
            if (!this.lineMask) return false;
            const xi = Math.round(x), yi = Math.round(y);
            if (xi < 0 || yi < 0 || xi >= ARENA.w || yi >= ARENA.h) return false;
            return this.lineMask[(yi * ARENA.w + xi) * 4] < 128;
        }

        // ---- sensor queries (null = "not mounted, use the part's own slider") ----
        carPoint(fx, fy) {
            const { x, y, th } = this.car;
            return { x: x + fx * Math.cos(th) - fy * Math.sin(th), y: y + fx * Math.sin(th) + fy * Math.cos(th) };
        }
        distanceFor(p) {
            const m = p.props.mount;
            if (this.type === 'bin' && m === 'bin') return this.hand;
            if (!this.hasCar() || m !== 'front') return null;
            const o = this.carPoint(CAR.len / 2, 0);
            let best = 400;
            for (const da of [-0.13, 0, 0.13]) best = Math.min(best, this.ray(o.x, o.y, this.car.th + da, 400));
            return best;
        }
        obstacleFor(p) {
            const m = p.props.mount;
            if (this.type === 'bin' && m === 'bin') return this.hand < 12;
            if (!this.hasCar() || !['left', 'right', 'front'].includes(m)) return null;
            const side = m === 'left' ? -1 : m === 'right' ? 1 : 0;
            const o = this.carPoint(CAR.len / 2, side * (CAR.wid / 2 - 2));
            return this.ray(o.x, o.y, this.car.th + side * 0.6, 20) < 15;
        }
        lineFor(p) {
            const m = p.props.mount;
            if (this.type !== 'line' || !['left', 'center', 'right'].includes(m)) return null;
            const side = m === 'left' ? -1 : m === 'right' ? 1 : 0;
            const o = this.carPoint(CAR.len / 2 - 2, side * 3.2);
            return this.isBlack(o.x, o.y);
        }
        ray(x, y, th, max) {
            const dx = Math.cos(th), dy = Math.sin(th);
            for (let d = 0; d < max; d += 1) {
                const px = x + dx * d, py = y + dy * d;
                if (px <= 0 || py <= 0 || px >= ARENA.w || py >= ARENA.h) return d;
                for (const b of this.boxes) if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return d;
            }
            return max;
        }

        // ---- motion ----
        step(dt, parts) {
            if (!this.hasCar()) return false;
            const left = parts.find(p => p.type === 'motor' && p.props.side === 'left');
            const right = parts.find(p => p.type === 'motor' && p.props.side === 'right');
            const sl = left && left.state ? left.state.speed : 0;
            const sr = right && right.state ? right.state.speed : 0;
            if (Math.abs(sl) < 0.01 && Math.abs(sr) < 0.01) return false;
            const v = (sl + sr) / 2 * CAR.maxSpeed;
            const w = (sl - sr) / CAR.wheelBase * CAR.maxSpeed;
            const th = this.car.th + w * dt;
            const nx = this.car.x + v * Math.cos(th) * dt;
            const ny = this.car.y + v * Math.sin(th) * dt;
            this.car.th = th;
            // Blocked: slide along the wall or box instead of sticking to it
            let px = nx, py = ny;
            if (this.collides(px, py)) {
                if (!this.collides(nx, this.car.y)) py = this.car.y;
                else if (!this.collides(this.car.x, ny)) px = this.car.x;
                else { this.bumped = true; return true; }
                this.bumped = true;
            } else this.bumped = false;
            this.car.x = px; this.car.y = py;
            const nxRef = px, nyRef = py;
            this.trail.push([nxRef, nyRef]);
            if (this.trail.length > 400) this.trail.shift();
            return true;
        }
        collides(x, y) {
            const r = 9;
            if (x < r || y < r || x > ARENA.w - r || y > ARENA.h - r) return true;
            return this.boxes.some(b => x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r);
        }

        // ---- drawing ----
        render(canvas, parts, theme) {
            const g = canvas.getContext('2d');
            const W = canvas.width, H = canvas.height;
            g.clearRect(0, 0, W, H);
            if (this.type === 'bin') return this.renderBin(g, W, H, parts, theme);
            const s = Math.min(W / ARENA.w, H / ARENA.h);
            const ox = (W - ARENA.w * s) / 2, oy = (H - ARENA.h * s) / 2;
            this.view = { s, ox, oy };
            g.save();
            g.translate(ox, oy); g.scale(s, s);
            g.fillStyle = this.type === 'line' ? '#ffffff' : (theme === 'dark' ? '#1b2027' : '#eef1f4');
            g.fillRect(0, 0, ARENA.w, ARENA.h);
            if (this.type === 'line' && this.lineCanvas) g.drawImage(this.lineCanvas, 0, 0);
            // grid
            g.strokeStyle = this.type === 'line' ? '#0001' : (theme === 'dark' ? '#ffffff10' : '#0000000d'); g.lineWidth = 0.4;
            for (let x = 0; x <= ARENA.w; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ARENA.h); g.stroke(); }
            for (let y = 0; y <= ARENA.h; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(ARENA.w, y); g.stroke(); }
            g.strokeStyle = '#868e96'; g.lineWidth = 2; g.strokeRect(1, 1, ARENA.w - 2, ARENA.h - 2);
            for (const b of this.boxes) { g.fillStyle = '#e8590c'; g.fillRect(b.x, b.y, b.w, b.h); g.fillStyle = '#0003'; g.fillRect(b.x, b.y + b.h - 3, b.w, 3); }
            // trail
            g.strokeStyle = '#2fe39a66'; g.lineWidth = 1; g.beginPath();
            this.trail.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
            // sensor beams
            for (const p of parts) {
                if (p.type === 'hcsr04' && p.props.mount === 'front') {
                    const o = this.carPoint(CAR.len / 2, 0);
                    const d = this.distanceFor(p);
                    g.fillStyle = '#2fe39a22'; g.beginPath(); g.moveTo(o.x, o.y);
                    g.arc(o.x, o.y, d, this.car.th - 0.13, this.car.th + 0.13); g.closePath(); g.fill();
                    g.fillStyle = '#2fe39a'; g.font = '6px system-ui'; g.fillText(Math.round(d) + ' cm', o.x + Math.cos(this.car.th) * Math.min(d, 60) + 2, o.y + Math.sin(this.car.th) * Math.min(d, 60));
                }
                if (p.type === 'irobstacle' && ['left', 'right', 'front'].includes(p.props.mount)) {
                    const side = p.props.mount === 'left' ? -1 : p.props.mount === 'right' ? 1 : 0;
                    const o = this.carPoint(CAR.len / 2, side * (CAR.wid / 2 - 2));
                    const hit = this.obstacleFor(p);
                    g.strokeStyle = hit ? '#ff3b30' : '#ff3b3055'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(o.x, o.y);
                    g.lineTo(o.x + Math.cos(this.car.th + side * 0.6) * 15, o.y + Math.sin(this.car.th + side * 0.6) * 15); g.stroke();
                }
            }
            this.drawCar(g, parts);
            g.restore();
            if (this.bumped) { g.fillStyle = '#ff3b30'; g.font = `600 ${Math.round(13 * (window.devicePixelRatio || 1))}px system-ui`; g.fillText('Bump!', 12, 26 * (window.devicePixelRatio || 1)); }
        }
        drawCar(g, parts) {
            const { x, y, th } = this.car;
            g.save(); g.translate(x, y); g.rotate(th);
            const L = CAR.len, Wd = CAR.wid;
            const wheel = (wx, wy, motor) => {
                g.fillStyle = '#212529'; g.fillRect(wx - 4, wy - 2, 8, 4);
                if (motor && motor.state && Math.abs(motor.state.speed) > 0.02) { g.fillStyle = '#ffd43b'; g.fillRect(wx - 4, wy - 0.6, 8, 1.2); }
            };
            const left = parts.find(p => p.type === 'motor' && p.props.side === 'left');
            const right = parts.find(p => p.type === 'motor' && p.props.side === 'right');
            wheel(-3, -Wd / 2 - 1, left); wheel(-3, Wd / 2 + 1, right);
            g.fillStyle = '#1971c2'; g.beginPath(); g.roundRect(-L / 2, -Wd / 2, L, Wd, 3); g.fill();
            g.fillStyle = '#0b4f8a'; g.fillRect(L / 2 - 4, -5, 3, 10);
            g.fillStyle = '#fff'; g.beginPath(); g.moveTo(L / 2 - 6, 0); g.lineTo(L / 2 - 11, -3); g.lineTo(L / 2 - 11, 3); g.fill();
            // line sensors
            for (const p of parts) {
                if (p.type === 'irline' && ['left', 'center', 'right'].includes(p.props.mount)) {
                    const side = p.props.mount === 'left' ? -1 : p.props.mount === 'right' ? 1 : 0;
                    g.fillStyle = this.lineFor(p) ? '#2fe36b' : '#ff3b30';
                    g.beginPath(); g.arc(L / 2 - 2, side * 3.2, 1.3, 0, Math.PI * 2); g.fill();
                }
            }
            g.restore();
        }
        renderBin(g, W, H, parts, theme) {
            const servo = parts.find(p => p.type === 'servo' && p.props.mount === 'lid');
            const angle = servo && servo.state ? servo.state.angle : 0;
            const s = Math.min(W / 320, H / 260);
            g.save(); g.scale(s, s); g.translate(0, 40);
            g.fillStyle = theme === 'dark' ? '#1b2027' : '#eef1f4'; g.fillRect(0, -40, 320, 260);
            g.fillStyle = theme === 'dark' ? '#2a313a' : '#d7dde3'; g.fillRect(0, 196, 320, 24);
            // bin
            g.fillStyle = '#2b8a3e'; g.beginPath(); g.moveTo(40, 80); g.lineTo(150, 80); g.lineTo(140, 196); g.lineTo(50, 196); g.closePath(); g.fill();
            g.fillStyle = '#ffffff22'; for (let k = 0; k < 4; k++) g.fillRect(62 + k * 20, 100, 6, 80);
            // lid: hinge on the left, opens by the servo angle (0 = closed)
            g.save(); g.translate(38, 78); g.rotate(-Math.min(110, angle) * Math.PI / 180);
            g.fillStyle = '#237032'; g.fillRect(0, -6, 116, 8); g.restore();
            // ultrasonic on the front
            g.fillStyle = '#1971c2'; g.fillRect(150, 110, 10, 26);
            g.fillStyle = '#cfd6de'; g.beginPath(); g.arc(162, 116, 4, 0, 7); g.arc(162, 130, 4, 0, 7); g.fill();
            // hand
            const hx = 166 + this.hand * 1.4;
            this.handX = hx * s; this.binScale = s;
            g.strokeStyle = '#2fe39a55'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(166, 123); g.lineTo(hx - 8, 123); g.stroke(); g.setLineDash([]);
            g.font = '26px system-ui'; g.fillText('✋', hx - 10, 132);
            g.fillStyle = theme === 'dark' ? '#e6e9ee' : '#15191e'; g.font = '11px system-ui';
            g.fillText(`hand: ${Math.round(this.hand)} cm`, Math.min(hx - 20, 250), 160);
            g.fillText(`lid: ${Math.round(angle)}°`, 60, 60);
            g.fillStyle = '#69727c'; g.fillText('Drag the hand closer or further', 12, 212);
            g.restore();
        }

        // ---- pointer: drag the car (arena/line) or the hand (bin) ----
        pointer(kind, x, y) {
            if (this.type === 'bin') {
                if (kind === 'down') this.dragging = Math.abs(x - this.handX) < 40;
                if (this.dragging && (kind === 'move' || kind === 'down')) this.hand = Math.max(2, Math.min(100, (x / this.binScale - 166) / 1.4));
                if (kind === 'up') this.dragging = false;
                return this.dragging;
            }
            if (!this.view) return false;
            const cx = (x - this.view.ox) / this.view.s, cy = (y - this.view.oy) / this.view.s;
            if (kind === 'down') {
                const box = this.boxes.findIndex(b => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h);
                if (Math.hypot(cx - this.car.x, cy - this.car.y) < 14) this.dragging = { what: 'car', dx: cx - this.car.x, dy: cy - this.car.y };
                else if (box !== -1) this.dragging = { what: 'box', i: box, dx: cx - this.boxes[box].x, dy: cy - this.boxes[box].y };
                else this.dragging = null;
            } else if (kind === 'move' && this.dragging) {
                if (this.dragging.what === 'car') { this.car.x = cx - this.dragging.dx; this.car.y = cy - this.dragging.dy; this.trail = []; }
                else { const b = this.boxes[this.dragging.i]; b.x = cx - this.dragging.dx; b.y = cy - this.dragging.dy; }
            } else if (kind === 'up') this.dragging = null;
            return !!this.dragging;
        }
        rotateCar(deg) { this.car.th += deg * Math.PI / 180; }
        addBox() { this.boxes.push({ x: 20 + Math.random() * 240, y: 20 + Math.random() * 150, w: 25, h: 25 }); }
    }

    const api = { World, ARENA };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SimWorld = api;
})(typeof window !== 'undefined' ? window : globalThis);
