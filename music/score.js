// Rumble Drop's theme: an original four-on-the-floor electro track, written as data.
// render.mjs plays it through the synth in synth.js and saves public/audio/theme.m4a.
// Pure functions only, so the arrangement can be tested without Web Audio.
// Time is counted in sixteenth-note steps; a bar is 16 steps.

export const STEPS_PER_BAR = 16;
export const BARS_PER_SECTION = 8;
export const SECTION_STEPS = STEPS_PER_BAR * BARS_PER_SECTION;

// 150 BPM makes a sixteenth exactly 0.1 s, so every loop point falls on a whole sample.
export const BPM = 150;
export const STEP_SECONDS = 60 / BPM / 4;

// The intro plays once, then sections LOOP_START.. repeat forever.
// Each section says which layers play.
const S = {
  intro: { name: 'intro', kick: true, hats: 'off', bass: true, arp: true, chords: false, lead: false, clap: false, fill: 'snare' },
  build: { name: 'build', kick: true, hats: 'off', bass: true, arp: true, chords: true, lead: false, clap: true, fill: 'riser' },
  drop: { name: 'drop', kick: true, hats: 'busy', bass: true, arp: true, chords: true, lead: 'a', clap: true, fill: 'snare' },
  drop2: { name: 'drop2', kick: true, hats: 'busy', bass: true, arp: true, chords: true, lead: 'b', clap: true, fill: 'riser' },
  breakdown: { name: 'breakdown', kick: false, hats: 'none', bass: false, arp: true, chords: true, lead: 'soft', clap: false, fill: 'riser' },
};
export const SECTIONS = [S.intro, S.build, S.drop, S.drop2, S.breakdown];
export const LOOP_START = 1;
export const INTRO_SECONDS = LOOP_START * SECTION_STEPS * STEP_SECONDS;
export const SONG_SECONDS = SECTIONS.length * SECTION_STEPS * STEP_SECONDS;

export function sectionAt(step) {
  const idx = Math.floor(step / SECTION_STEPS);
  if (idx < SECTIONS.length) return { ...SECTIONS[idx], index: idx };
  const loopLen = SECTIONS.length - LOOP_START;
  const i = LOOP_START + ((idx - LOOP_START) % loopLen);
  return { ...SECTIONS[i], index: i };
}

// MIDI note numbers. Key: A minor / C major.
// Chord roots, one per bar, eight bars per phrase: Am F C G | Am F G E.
const PROGRESSION = [
  { root: 45, notes: [57, 60, 64] }, // Am
  { root: 41, notes: [57, 60, 65] }, // F
  { root: 48, notes: [55, 60, 64] }, // C
  { root: 43, notes: [55, 59, 62] }, // G
  { root: 45, notes: [57, 60, 64] }, // Am
  { root: 41, notes: [57, 60, 65] }, // F
  { root: 43, notes: [55, 59, 62] }, // G
  { root: 40, notes: [56, 59, 64] }, // E (major: the lift back to Am)
];

export function chordAt(step) {
  const bar = Math.floor(step / STEPS_PER_BAR) % PROGRESSION.length;
  return PROGRESSION[bar];
}

// Lead melody, written for this game. [step within 8 bars, midi, length in steps].
const LEAD_A = [
  // Am
  [0, 76, 2], [3, 76, 2], [6, 79, 2], [8, 81, 3], [12, 79, 1], [14, 76, 2],
  // F
  [16, 72, 2], [19, 74, 2], [22, 76, 2], [24, 77, 2], [26, 76, 2], [28, 74, 2], [30, 72, 2],
  // C
  [32, 79, 2], [35, 79, 2], [38, 76, 2], [40, 79, 3], [43, 84, 3], [46, 83, 2],
  // G
  [48, 83, 2], [50, 81, 2], [52, 79, 4], [56, 74, 4], [60, 79, 2], [62, 81, 1], [63, 83, 1],
  // Am
  [64, 84, 2], [67, 83, 2], [70, 81, 2], [72, 76, 3], [76, 79, 2], [78, 81, 2],
  // F
  [80, 77, 2], [83, 76, 2], [86, 77, 2], [88, 81, 3], [92, 79, 2], [94, 77, 2],
  // G
  [96, 86, 2], [99, 83, 2], [102, 79, 2], [104, 81, 2], [106, 83, 2], [108, 86, 4],
  // E
  [112, 83, 3], [115, 80, 3], [118, 76, 2], [120, 80, 2], [122, 83, 2], [124, 88, 4],
];
// The second drop answers the first: the same opening, then a new, higher second half.
const LEAD_B = [
  ...LEAD_A.filter(([s]) => s < 64),
  // Am
  [64, 81, 2], [66, 84, 2], [68, 88, 3], [72, 86, 2], [74, 84, 2], [76, 83, 2], [78, 81, 2],
  // F
  [80, 81, 3], [83, 77, 3], [86, 81, 2], [88, 84, 4], [92, 83, 2], [94, 81, 2],
  // G
  [96, 83, 2], [98, 86, 2], [100, 91, 4], [104, 86, 2], [106, 83, 2], [108, 79, 4],
  // E
  [112, 80, 2], [114, 83, 2], [116, 88, 4], [120, 86, 2], [122, 83, 2], [124, 80, 4],
];

const ARP_SHAPE = [0, 1, 2, 3, 2, 1, 0, 1]; // index into chord notes + octave

// The busy hi-hat pattern: offbeat opens with closed sixteenths around them.
const BUSY_HATS = [0.35, 0.25, 1, 0.3, 0.35, 0.25, 1, 0.45];

// Every musical event that starts on this step.
export function eventsAt(step) {
  const sec = sectionAt(step);
  const inSec = step % SECTION_STEPS;
  const inBar = step % STEPS_PER_BAR;
  const bar = Math.floor(inSec / STEPS_PER_BAR);
  const lastBar = bar === BARS_PER_SECTION - 1;
  const chord = chordAt(step);
  const ev = [];

  // Drums.
  const kickOn = sec.kick && inBar % 4 === 0 && !(lastBar && sec.fill === 'riser' && inBar >= 8);
  if (kickOn) ev.push({ voice: 'kick', vel: 1 });
  if (sec.clap && (inBar === 4 || inBar === 12) && !(lastBar && sec.fill === 'riser')) ev.push({ voice: 'clap', vel: 1 });
  if (sec.hats === 'off' && inBar % 4 === 2) ev.push({ voice: 'hat', vel: 0.8, open: true });
  if (sec.hats === 'busy') {
    const v = BUSY_HATS[inBar % 8];
    ev.push({ voice: 'hat', vel: v, open: v === 1 });
  }
  if (inSec === 0 && sec.index !== 0 && (sec.name === 'drop' || sec.name === 'drop2' || sec.name === 'breakdown')) {
    ev.push({ voice: 'crash', vel: sec.name === 'breakdown' ? 0.6 : 1 });
  }

  // Fills in the last bar of each section.
  if (lastBar) {
    if (sec.fill === 'riser') {
      if (inBar === 0) ev.push({ voice: 'riser', steps: STEPS_PER_BAR });
      // A snare roll that doubles up as it nears the drop.
      const roll = inBar < 8 ? inBar % 2 === 0 : true;
      if (roll && sec.name !== 'breakdown') ev.push({ voice: 'snare', vel: 0.35 + (inBar / 15) * 0.6 });
      if (sec.name === 'breakdown' && inBar >= 8) ev.push({ voice: 'snare', vel: 0.3 + ((inBar - 8) / 7) * 0.6 });
    } else if (inBar >= 12) {
      ev.push({ voice: 'snare', vel: 0.5 + (inBar - 12) * 0.12 });
    }
  }

  // Bass: pumping offbeat eighths with an octave hop, root of the bar's chord.
  // The intro holds the bass back for its first four bars.
  const bassOn = sec.bass && !(sec.name === 'intro' && bar < 4) && !(lastBar && sec.fill === 'riser' && inBar >= 8);
  if (bassOn) {
    if (inBar % 4 === 2) ev.push({ voice: 'bass', midi: chord.root + (inBar === 14 ? 12 : 0), steps: 2 });
    if (sec.name.startsWith('drop') && inBar % 4 === 3) ev.push({ voice: 'bass', midi: chord.root + 12, steps: 1, vel: 0.6 });
  }

  // Chords: quarter-note stabs that swell after each kick (the sidechain "pump").
  if (sec.chords && inBar % 4 === 0) {
    const opening = sec.name === 'breakdown' || sec.name === 'build';
    const vel = sec.name === 'build' ? 0.7 : sec.name === 'breakdown' ? 1.4 : 1;
    ev.push({ voice: 'chord', notes: chord.notes, steps: 4, vel, open: opening ? 0.35 + bar / 14 : 1 });
  }

  // Arp: sixteenth-note plucks running over the chord.
  if (sec.arp) {
    const tones = [...chord.notes, chord.notes[0] + 12];
    const idx = ARP_SHAPE[inBar % ARP_SHAPE.length];
    const up = sec.name === 'intro' ? 0 : 12;
    const vel = inBar % 4 === 0 ? 1 : 0.7;
    const bright = sec.name === 'intro' ? 0.25 + bar / 10 : sec.name === 'build' ? 0.4 + bar / 12 : 1;
    ev.push({ voice: 'arp', midi: tones[idx] + up, steps: 1, vel, bright });
  }

  // Lead.
  if (sec.lead) {
    const line = sec.lead === 'b' ? LEAD_B : LEAD_A;
    const soft = sec.lead === 'soft';
    // The breakdown plays only the first half of the tune, quietly.
    const note = soft && inSec >= 64 ? null : line.find(([s]) => s === inSec);
    if (note) {
      const [, midi, len] = note;
      ev.push({ voice: 'lead', midi, steps: len, vel: soft ? 0.9 : 1, soft });
    }
  }
  return ev;
}

// Pitch classes the score may use: A natural minor, plus the G# of the E chord.
export const SCALE_PCS = new Set([0, 2, 4, 5, 7, 9, 11, 8]);
