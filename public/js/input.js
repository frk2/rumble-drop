// Board gestures and keyboard input. Calls actions.<name>() for each command.

const DAS = 0.17; // seconds before a held move starts repeating
const ARR = 0.045; // seconds between repeats

export class Input {
  constructor({ stage, actions, cellPixels, enabled }) {
    this.actions = actions;
    this.cellPixels = cellPixels;
    this.enabled = enabled;
    this.held = new Map(); // command -> { t, next }
    this.softHeld = false;
    this.bindKeys();
    this.bindGestures(stage);
  }

  press(cmd) {
    if (!this.enabled()) return;
    if (cmd === 'left') this.actions.move(-1);
    else if (cmd === 'right') this.actions.move(1);
    else if (cmd === 'soft') this.actions.soft();
    else if (cmd === 'cw') this.actions.rotate(1);
    else if (cmd === 'ccw') this.actions.rotate(-1);
    else if (cmd === 'slam') this.actions.slam();
    else if (cmd === 'hold') this.actions.hold();
    if (cmd === 'left' || cmd === 'right' || cmd === 'soft') this.held.set(cmd, { t: 0, next: DAS });
    if (cmd === 'soft') this.softHeld = true;
  }

  release(cmd) {
    this.held.delete(cmd);
    if (cmd === 'soft') this.softHeld = false;
  }

  releaseAll() {
    this.held.clear();
    this.softHeld = false;
    this.cancelGesture();
  }

  // Called every frame for auto-repeat of held moves.
  update(dt) {
    if (!this.enabled()) return;
    for (const [cmd, h] of this.held) {
      if (cmd === 'soft') continue; // soft drop uses fast gravity while held
      h.t += dt;
      while (h.t >= h.next) {
        h.next += ARR;
        this.actions.move(cmd === 'left' ? -1 : 1);
      }
    }
  }

  bindKeys() {
    const map = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowDown: 'soft',
      KeyS: 'soft',
      ArrowUp: 'cw',
      KeyX: 'cw',
      KeyW: 'cw',
      KeyZ: 'ccw',
      KeyQ: 'ccw',
      Space: 'slam',
      KeyC: 'hold',
      ShiftLeft: 'hold',
      ShiftRight: 'hold',
    };
    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('button, a, input') && (e.code === 'Space' || e.code === 'Enter')) return;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        this.actions.pause();
        e.preventDefault();
        return;
      }
      const cmd = map[e.code];
      if (!cmd || !this.enabled()) return;
      e.preventDefault();
      if (e.repeat) return;
      this.actions.unlock();
      this.press(cmd);
    });
    window.addEventListener('keyup', (e) => {
      const cmd = map[e.code];
      if (cmd) this.release(cmd);
    });
    window.addEventListener('blur', () => this.releaseAll());
  }

  // On the board: drag sideways to move, drag down to soft drop,
  // flick down to slam, flick up to hold, tap to rotate.
  bindGestures(stage) {
    let g = null;
    this.cancelGesture = () => {
      if (g && stage.hasPointerCapture?.(g.id)) stage.releasePointerCapture(g.id);
      g = null;
    };
    stage.addEventListener('pointerdown', (e) => {
      if (g || !this.enabled()) return;
      this.actions.unlock();
      stage.setPointerCapture?.(e.pointerId);
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: e.clientX, ay: e.clientY, t0: performance.now(), moved: false, samples: [] };
      e.preventDefault();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id || !this.enabled()) return;
      const now = performance.now();
      g.samples.push({ y: e.clientY, t: now });
      // Keep about the last 120 ms of movement, but always at least two samples.
      while (g.samples.length > 2 && now - g.samples[1].t > 120) g.samples.shift();
      const cell = Math.max(18, this.cellPixels() * 0.9);
      let dx = e.clientX - g.ax;
      while (Math.abs(dx) >= cell) {
        const step = Math.sign(dx);
        this.actions.move(step);
        g.ax += step * cell;
        dx = e.clientX - g.ax;
        g.moved = true;
      }
      const totalDy = e.clientY - g.y0;
      const totalDx = Math.abs(e.clientX - g.x0);
      if (totalDy > cell * 1.2 && totalDy > totalDx * 1.5) {
        let dy = e.clientY - g.ay;
        if (!g.dropping) {
          g.dropping = true;
          g.ay = e.clientY;
          dy = 0;
        }
        while (dy >= cell) {
          this.actions.soft();
          g.ay += cell;
          dy -= cell;
        }
        g.moved = true;
      } else if (!g.dropping) {
        g.ay = e.clientY;
      }
    });
    const end = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dt = performance.now() - g.t0;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      // Recent speed decides flicks, so a slow drag that ends still is not a slam.
      let vy = 0;
      const now = performance.now();
      if (g.samples.length > 0) {
        const a = g.samples[0];
        vy = (e.clientY - a.y) / Math.max(8, now - a.t);
      }
      // A short, quick stroke counts as a flick even with few touch samples.
      if (dt < 220) vy = Math.max(Math.abs(vy), Math.abs(dy) / Math.max(1, dt)) * Math.sign(dy);
      if (this.enabled() && e.type === 'pointerup') {
        if (dy > 50 && vy > 0.7 && Math.abs(dy) > Math.abs(dx)) this.actions.slam();
        else if (dy < -50 && vy < -0.5 && Math.abs(dy) > Math.abs(dx)) this.actions.hold();
        else if (!g.moved && Math.hypot(dx, dy) < 14 && dt < 350) {
          this.actions.rotate(1);
        }
      }
      g = null;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }
}
