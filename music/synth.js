// Rumble Drop's theme synth: Web Audio voices that play the score in score.js.
// It runs only when the track is rendered (see render.mjs); the game plays the saved file.

import { eventsAt, STEP_SECONDS } from './score.js';

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export function createSynth(ctx, destination, noiseBuffer) {
  // voices -> out -> destination, with a pumping bus that dips on every kick (the sidechain
  // feel of electro house) and a dotted-eighth echo.
  const out = ctx.createGain();
  out.connect(destination);
  const pump = ctx.createGain();
  pump.connect(out);
  const delay = ctx.createDelay(1);
  delay.delayTime.value = STEP_SECONDS * 3;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2600;
  delay.connect(tone).connect(fb).connect(delay);
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  tone.connect(wet).connect(out);
  const bus = { out, pump, delay };

  // ---------- voice helpers ----------
  function env(g, t, peak, attack, hold, release) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    if (hold > 0) g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return t + attack + hold + release + 0.02;
  }

  // Every node a note makes is listed here, so the whole note can be disconnected when its
  // last sound ends. Otherwise finished notes linger in the graph and the cost keeps growing.
  let made = [];
  let lastSrc = null;
  let lastEnd = 0;
  function track(node, end) {
    made.push(node);
    if (end !== undefined && end >= lastEnd) {
      lastEnd = end;
      lastSrc = node;
    }
    return node;
  }

  function gain() {
    return track(ctx.createGain());
  }

  function osc(type, freq, t, end, dest, detune = 0) {
    const o = track(ctx.createOscillator(), end);
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end);
    return o;
  }

  function noiseSrc(t, end, dest) {
    const src = track(ctx.createBufferSource(), end);
    src.buffer = noiseBuffer;
    src.loop = true;
    src.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(end);
    return src;
  }

  function filter(type, freq, q = 0.7) {
    const f = track(ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  // ---------- voices ----------
  const voices = {
    kick(bus, t, e) {
      const g = gain();
      g.connect(bus.out);
      const end = env(g, t, 0.75 * e.vel, 0.002, 0.03, 0.22);
      const o = osc('sine', 180, t, end, g);
      o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
      const c = gain();
      c.connect(bus.out);
      const cend = env(c, t, 0.35, 0.001, 0, 0.025);
      const co = osc('triangle', 1400, t, cend, c);
      co.frequency.exponentialRampToValueAtTime(200, t + 0.018);
      // Sidechain: everything on the pump bus ducks under the kick, then swells back.
      bus.pump.gain.setValueAtTime(0.18, t);
      bus.pump.gain.setTargetAtTime(1, t + 0.03, 0.06);
    },
    clap(bus, t, e) {
      const f = filter('bandpass', 1500, 1.4);
      const g = gain();
      f.connect(g).connect(bus.out);
      g.gain.setValueAtTime(0.0001, t);
      // Three quick slaps, then a short tail.
      for (let i = 0; i < 3; i++) {
        const s = t + i * 0.011;
        g.gain.setValueAtTime(0.5 * e.vel, s);
        g.gain.exponentialRampToValueAtTime(0.08, s + 0.009);
      }
      g.gain.setValueAtTime(0.42 * e.vel, t + 0.033);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      noiseSrc(t, t + 0.22, f);
    },
    snare(bus, t, e) {
      const f = filter('highpass', 1800);
      const g = gain();
      f.connect(g).connect(bus.out);
      const end = env(g, t, 0.32 * e.vel, 0.001, 0, 0.11);
      noiseSrc(t, end, f);
      const b = gain();
      b.connect(bus.out);
      const bend = env(b, t, 0.22 * e.vel, 0.001, 0, 0.07);
      const o = osc('triangle', 240, t, bend, b);
      o.frequency.exponentialRampToValueAtTime(170, t + 0.07);
    },
    hat(bus, t, e) {
      const f = filter('highpass', e.open ? 6000 : 7500);
      const g = gain();
      f.connect(g).connect(bus.out);
      const end = env(g, t, (e.open ? 0.5 : 0.32) * e.vel, 0.001, 0, e.open ? 0.11 : 0.035);
      noiseSrc(t, end, f);
    },
    crash(bus, t, e) {
      const f = filter('highpass', 4500);
      const g = gain();
      f.connect(g).connect(bus.out);
      const end = env(g, t, 0.3 * e.vel, 0.002, 0, 1.8);
      noiseSrc(t, end, f);
      // A low boom under the crash marks the drop.
      const b = gain();
      b.connect(bus.out);
      const bend = env(b, t, 0.5 * e.vel, 0.003, 0.05, 0.6);
      const o = osc('sine', 90, t, bend, b);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.6);
    },
    riser(bus, t, e, sd) {
      const dur = e.steps * sd;
      const f = filter('bandpass', 400, 2.5);
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(7000, t + dur);
      const g = gain();
      f.connect(g).connect(bus.out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.97);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      noiseSrc(t, t + dur + 0.02, f);
    },
    bass(bus, t, e, sd) {
      const len = e.steps * sd * 0.85;
      const f = filter('lowpass', 400, 4);
      f.frequency.setValueAtTime(1800, t);
      f.frequency.exponentialRampToValueAtTime(380, t + len);
      const g = gain();
      f.connect(g).connect(bus.pump);
      const end = env(g, t, 0.24 * (e.vel ?? 1), 0.004, len * 0.5, len * 0.5);
      const fr = hz(e.midi);
      osc('sawtooth', fr, t, end, f, -9);
      osc('sawtooth', fr, t, end, f, 9);
      osc('square', fr * 2, t, end, f);
    },
    chord(bus, t, e, sd) {
      const len = e.steps * sd;
      const f = filter('lowpass', 400 + 3200 * e.open, 1.5);
      const g = gain();
      f.connect(g).connect(bus.pump);
      g.connect(bus.delay);
      const end = env(g, t, 0.09 * e.vel, 0.01, len * 0.55, len * 0.4);
      for (const n of e.notes) {
        const fr = hz(n);
        osc('sawtooth', fr, t, end, f, -12);
        osc('sawtooth', fr, t, end, f, 12);
      }
    },
    arp(bus, t, e, sd) {
      const f = filter('lowpass', 900, 6);
      f.frequency.setValueAtTime(700 + 4200 * e.bright, t);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.12);
      const g = gain();
      f.connect(g).connect(bus.pump);
      g.connect(bus.delay);
      const end = env(g, t, 0.085 * e.vel, 0.002, 0, Math.min(0.16, sd * 1.4));
      osc('square', hz(e.midi), t, end, f);
    },
    lead(bus, t, e, sd) {
      const len = e.steps * sd;
      const f = filter('lowpass', e.soft ? 1500 : 4800, 2);
      const g = gain();
      f.connect(g).connect(bus.out);
      g.connect(bus.delay);
      const peak = 0.12 * e.vel;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(peak * 0.65, t + 0.08);
      g.gain.setValueAtTime(peak * 0.65, t + Math.max(0.08, len * 0.85));
      g.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.85 + 0.07);
      const end = t + len * 0.85 + 0.09;
      const fr = hz(e.midi);
      osc('sawtooth', fr, t, end, f, -7);
      osc('square', fr, t, end, f, 7);
    },
  };

  // Queue every event that starts on `step` at time t.
  function schedule(step, t) {
    for (const e of eventsAt(step)) {
      made = [];
      lastSrc = null;
      lastEnd = 0;
      voices[e.voice](bus, t, e, STEP_SECONDS);
      const nodes = made;
      if (lastSrc) lastSrc.onended = () => nodes.forEach((n) => n.disconnect());
    }
  }

  return { schedule };
}
