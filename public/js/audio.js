// Synthesized sound effects. Nothing is downloaded; every sound is made with Web Audio.

let ctx = null;
let master = null;
let muted = false;
let noiseBuffer = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02);
}

export function isMuted() {
  return muted;
}

function ready() {
  return ctx && ctx.state === 'running' && !muted;
}

function tone({ type = 'sine', freq = 440, to = null, start = 0, dur = 0.15, vol = 0.3, attack = 0.005 }) {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ start = 0, dur = 0.2, vol = 0.3, filter = 'lowpass', freq = 800, to = null, q = 0.7 }) {
  const t = ctx.currentTime + start;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

// A bright major-pentatonic ladder used for chimes.
const LADDER = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1567.98, 1760, 2093];

export const sfx = {
  move() {
    if (!ready()) return;
    tone({ type: 'square', freq: 660, dur: 0.035, vol: 0.05 });
  },
  rotate() {
    if (!ready()) return;
    tone({ type: 'triangle', freq: 880, to: 1320, dur: 0.06, vol: 0.12 });
  },
  bump() {
    if (!ready()) return;
    tone({ type: 'square', freq: 140, dur: 0.05, vol: 0.06 });
  },
  hold() {
    if (!ready()) return;
    tone({ type: 'sine', freq: 520, to: 260, dur: 0.12, vol: 0.18 });
    tone({ type: 'sine', freq: 780, to: 390, dur: 0.12, vol: 0.08, start: 0.03 });
  },
  land() {
    if (!ready()) return;
    tone({ type: 'sine', freq: 180, to: 70, dur: 0.12, vol: 0.3 });
    noise({ dur: 0.06, vol: 0.12, freq: 1200 });
  },
  slam(distance) {
    if (!ready()) return;
    const power = Math.min(1, 0.4 + distance / 18);
    noise({ dur: 0.09, vol: 0.25 * power, filter: 'highpass', freq: 3000, to: 600 });
    tone({ type: 'sine', freq: 150, to: 38, dur: 0.35, vol: 0.7 * power, start: 0.01 });
    tone({ type: 'triangle', freq: 90, to: 45, dur: 0.25, vol: 0.35 * power, start: 0.01 });
    noise({ dur: 0.35, vol: 0.35 * power, freq: 500, to: 80, start: 0.01 });
  },
  perfect() {
    if (!ready()) return;
    [0, 2, 4, 5, 7].forEach((n, i) => {
      tone({ type: 'triangle', freq: LADDER[n], dur: 0.35, vol: 0.18, start: 0.05 + i * 0.055 });
      tone({ type: 'sine', freq: LADDER[n] * 2, dur: 0.25, vol: 0.06, start: 0.05 + i * 0.055 });
    });
  },
  clear(lines, combo) {
    if (!ready()) return;
    const base = Math.min(combo, 5);
    // Rising whoosh, longer for more lines.
    noise({ dur: 0.25 + lines * 0.12, vol: 0.18 + lines * 0.05, filter: 'bandpass', freq: 400, to: 5000, q: 1.2 });
    // A chord that grows a note per line.
    const chord = [0, 2, 4, 7, 9].slice(0, lines + 1);
    chord.forEach((n, i) => {
      const f = LADDER[Math.min(n + base, LADDER.length - 1)];
      tone({ type: 'sawtooth', freq: f / 2, dur: 0.5 + lines * 0.15, vol: 0.07, start: 0.08 });
      tone({ type: 'triangle', freq: f, dur: 0.6 + lines * 0.15, vol: 0.14, start: 0.08 + i * 0.04 });
    });
    if (lines >= 3) {
      tone({ type: 'sine', freq: 110, to: 30, dur: 0.9, vol: 0.6, start: 0.05 });
      noise({ dur: 0.9, vol: 0.3, freq: 900, to: 60, start: 0.05 });
    }
    if (lines >= 4) {
      LADDER.forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.3, vol: 0.12, start: 0.25 + i * 0.045 }));
      LADDER.slice().reverse().forEach((f, i) => tone({ type: 'sine', freq: f * 1.5, dur: 0.25, vol: 0.06, start: 0.8 + i * 0.04 }));
      for (let i = 0; i < 6; i++) noise({ dur: 0.4, vol: 0.18, freq: 2500, to: 200, start: 0.4 + i * 0.22, filter: 'bandpass', q: 0.8 });
    }
  },
  levelup() {
    if (!ready()) return;
    [0, 4, 7, 10].forEach((n, i) => tone({ type: 'square', freq: LADDER[n], dur: 0.15, vol: 0.07, start: i * 0.08 }));
  },
  gameover() {
    if (!ready()) return;
    [7, 5, 4, 2, 0].forEach((n, i) => tone({ type: 'triangle', freq: LADDER[n] / 2, dur: 0.4, vol: 0.2, start: i * 0.16 }));
    tone({ type: 'sine', freq: 100, to: 30, dur: 1.4, vol: 0.5, start: 0.6 });
  },
  start() {
    if (!ready()) return;
    [0, 2, 4, 7].forEach((n, i) => tone({ type: 'triangle', freq: LADDER[n], dur: 0.2, vol: 0.15, start: i * 0.07 }));
  },
};
