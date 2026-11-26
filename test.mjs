import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, KINDS, ROTATIONS, COLS, ROWS, emptyBoard, collides, pieceCells } from './public/js/logic.js';
import { fitScene, PHONE_PREVIEW_HEIGHT, PHONE_PREVIEW_Y } from './public/js/scene-layout.js';

const fill = (board, y, except = []) => {
  for (let x = 0; x < COLS; x++) if (!except.includes(x)) board[y][x] = 'O';
};

test('phone scene fits the well, previews and shake in both kinds of limiting viewport', () => {
  for (const [width, height] of [[375, 681], [390, 601], [428, 798], [402, 730], [320, 815]]) {
    const { cellSize, centerY } = fitScene(width, height, true);
    const toScreen = (y) => height / 2 - (y - centerY) * cellSize;
    assert.ok(toScreen(PHONE_PREVIEW_Y + PHONE_PREVIEW_HEIGHT / 2) >= 4);
    assert.ok(toScreen(-0.35) <= height - 4);
    assert.ok((width - 11 * cellSize) / 2 >= 4);
  }
});

test('the default scene framing still matches the iPad portrait layout', () => {
  for (const [width, height] of [[744, 1040], [390, 1040]]) {
    assert.deepEqual(fitScene(width, height), {
      cellSize: Math.min(width / 11.6, height / (ROWS + 1.2 + 1.15 + 0.7)),
      centerY: (ROWS + 1.2 + 1.15 - 0.7) / 2,
    });
  }
});

test('the standalone web app has locally served install icons', () => {
  const dir = new URL('./public/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', dir), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(new URL(manifest.start_url, dir).href, dir.href);
  for (const icon of manifest.icons) assert.ok(readFileSync(new URL(icon.src, dir)).length > 0);
  const png = readFileSync(new URL('icon-180.png', dir));
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
});

test('all seven pieces exist with four cells in every rotation', () => {
  assert.deepEqual([...KINDS].sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
  for (const k of KINDS) {
    for (const r of ROTATIONS[k]) assert.equal(new Set(r.map((c) => c.join())).size, 4, k);
  }
});

test('the bag deals each piece once per seven', () => {
  const g = new Game({ seed: 7 });
  const dealt = [g.piece.kind];
  while (dealt.length < 21) {
    dealt.push(g.queue.shift());
    g.fillQueue();
  }
  for (let i = 0; i < 21; i += 7) assert.deepEqual(dealt.slice(i, i + 7).sort(), [...KINDS].sort());
});

test('pieces move, stop at walls and fall with gravity', () => {
  const g = new Game({ seed: 1 });
  for (let i = 0; i < 12; i++) g.move(-1);
  assert.ok(Math.min(...pieceCells(g.piece).map(([x]) => x)) === 0);
  const y = g.piece.y;
  g.tick(1.01);
  assert.equal(g.piece.y, y + 1);
});

test('rotation kicks off the wall instead of failing', () => {
  const g = new Game({ seed: 3 });
  g.piece = { kind: 'I', rot: 1, x: -2, y: 5 };
  assert.ok(!collides(g.board, g.piece));
  assert.ok(g.rotate(1));
  assert.ok(!collides(g.board, g.piece));
});

test('a slam drops to the floor, scores two per row and locks', () => {
  const g = new Game({ seed: 2 });
  g.piece = { kind: 'O', rot: 0, x: 4, y: 1 };
  g.hardDrop();
  const ev = g.drainEvents();
  const slam = ev.find((e) => e.type === 'slam');
  assert.equal(slam.distance, ROWS - 3);
  assert.equal(g.board[ROWS - 1][4], 'O');
  assert.equal(g.score >= slam.distance * 2, true);
  assert.ok(ev.some((e) => e.type === 'lock' && e.slammed));
});

test('clearing four lines at once scores 800 and is reported', () => {
  const g = new Game({ seed: 4 });
  for (let y = ROWS - 4; y < ROWS; y++) fill(g.board, y, [9]);
  g.piece = { kind: 'I', rot: 1, x: 7, y: 1 };
  g.score = 0;
  g.hardDrop();
  const lock = g.drainEvents().find((e) => e.type === 'lock');
  assert.equal(lock.lines, 4);
  assert.equal(lock.allClear, true);
  assert.equal(g.lines, 4);
  assert.ok(g.board.every((row) => row.every((c) => !c)));
  assert.ok(g.score >= 800);
});

test('cleared rows are removed and the rest falls', () => {
  const g = new Game({ seed: 5 });
  fill(g.board, ROWS - 1, [0, 1]);
  g.board[ROWS - 2][5] = 'T';
  g.piece = { kind: 'O', rot: 0, x: 0, y: 1 };
  g.hardDrop();
  const lock = g.drainEvents().find((e) => e.type === 'lock');
  assert.equal(lock.lines, 1);
  assert.equal(g.board[ROWS - 1][5], 'T');
  assert.equal(g.board[ROWS - 1][0], 'O');
});

test('a snug fit is perfect; a piece on open floor is not', () => {
  const g = new Game({ seed: 6 });
  g.piece = { kind: 'T', rot: 0, x: 3, y: 1 };
  g.hardDrop();
  assert.equal(g.drainEvents().find((e) => e.type === 'lock').perfect, false);

  const h = new Game({ seed: 6 });
  h.board = emptyBoard();
  // Two-wide well for an O piece, two rows deep.
  for (const y of [ROWS - 1, ROWS - 2]) fill(h.board, y, [4, 5, 9]);
  h.piece = { kind: 'O', rot: 0, x: 4, y: 1 };
  h.hardDrop();
  const lock = h.drainEvents().find((e) => e.type === 'lock');
  assert.equal(lock.perfect, true);
  assert.equal(lock.lines, 0);
});

test('a piece that leaves a hole under it is not perfect', () => {
  const g = new Game({ seed: 8 });
  // A one-wide notch at x=4 in the floor row; a flat I over it leaves a hole.
  fill(g.board, ROWS - 1, [4, 9]);
  g.piece = { kind: 'I', rot: 0, x: 2, y: 1 };
  g.hardDrop();
  const lock = g.drainEvents().find((e) => e.type === 'lock');
  assert.equal(lock.lines, 0);
  assert.equal(lock.perfect, false);
});

test('a vertical I dropped into a one-wide well is perfect', () => {
  const g = new Game({ seed: 8 });
  for (let y = ROWS - 4; y < ROWS; y++) fill(g.board, y, [0, 9]);
  for (let y = ROWS - 4; y < ROWS; y++) g.board[y][9] = 'L';
  g.piece = { kind: 'I', rot: 1, x: -2, y: 1 };
  g.hardDrop();
  const lock = g.drainEvents().find((e) => e.type === 'lock');
  assert.equal(lock.lines, 4);
  assert.equal(lock.perfect, true);
});

test('hold swaps once per piece', () => {
  const g = new Game({ seed: 9 });
  const first = g.piece.kind;
  const next = g.queue[0];
  assert.ok(g.holdPiece());
  assert.equal(g.hold, first);
  assert.equal(g.piece.kind, next);
  assert.equal(g.holdPiece(), false);
});

test('consecutive clears build a combo and levels rise every ten lines', () => {
  const g = new Game({ seed: 10 });
  g.lines = 9;
  fill(g.board, ROWS - 1, [0, 1]);
  fill(g.board, ROWS - 2, [0, 1]);
  g.piece = { kind: 'O', rot: 0, x: 0, y: 1 };
  g.hardDrop();
  let ev = g.drainEvents();
  assert.equal(ev.find((e) => e.type === 'lock').lines, 2);
  assert.ok(ev.some((e) => e.type === 'levelup' && e.level === 2));
  fill(g.board, ROWS - 1, [0, 1]);
  g.piece = { kind: 'O', rot: 0, x: 0, y: 1 };
  g.hardDrop();
  ev = g.drainEvents();
  assert.equal(ev.find((e) => e.type === 'lock').combo, 1);
});

test('the game ends when a new piece cannot appear', () => {
  const g = new Game({ seed: 11 });
  for (let y = 0; y < 4; y++) fill(g.board, y, [0]);
  g.drainEvents();
  g.spawn('T');
  assert.equal(g.over, true);
  assert.ok(g.drainEvents().some((e) => e.type === 'gameover'));
  assert.equal(g.move(1), false);
});

// ---------- theme music score ----------
import { eventsAt, sectionAt, SECTIONS, SECTION_STEPS, STEPS_PER_BAR, LOOP_START, SCALE_PCS, STEP_SECONDS, INTRO_SECONDS, SONG_SECONDS } from './music/score.js';
import { THEME } from './public/js/theme.js';
import { statSync } from 'node:fs';

const SONG_STEPS = SECTIONS.length * SECTION_STEPS;
const voicesAt = (step) => eventsAt(step).map((e) => e.voice);

test('the song opens with an intro, then loops from the build and never runs out', () => {
  assert.equal(sectionAt(0).name, 'intro');
  assert.equal(sectionAt(SONG_STEPS).index, LOOP_START);
  assert.equal(sectionAt(SONG_STEPS).name, 'build');
  for (let s = 0; s < SONG_STEPS * 3; s += STEPS_PER_BAR) assert.ok(eventsAt(s).length > 0, `bar at step ${s} is silent`);
});

test('the drop keeps four on the floor with claps on two and four', () => {
  const drop = SECTIONS.findIndex((s) => s.name === 'drop') * SECTION_STEPS;
  for (let bar = 0; bar < 7; bar++) {
    for (let i = 0; i < STEPS_PER_BAR; i++) {
      const v = voicesAt(drop + bar * STEPS_PER_BAR + i);
      assert.equal(v.includes('kick'), i % 4 === 0, `kick at bar ${bar} step ${i}`);
      assert.equal(v.includes('clap'), i === 4 || i === 12, `clap at bar ${bar} step ${i}`);
    }
  }
  assert.ok(voicesAt(drop).includes('crash'));
  assert.ok(voicesAt(drop).includes('lead'));
});

test('the breakdown drops the kick and a riser leads back into the drop', () => {
  const brk = SECTIONS.findIndex((s) => s.name === 'breakdown') * SECTION_STEPS;
  for (let i = 0; i < SECTION_STEPS; i++) assert.ok(!voicesAt(brk + i).includes('kick'));
  const build = SECTIONS.findIndex((s) => s.name === 'build') * SECTION_STEPS;
  assert.ok(voicesAt(build + SECTION_STEPS - STEPS_PER_BAR).includes('riser'));
});

test('every pitch stays in key and in a playable range', () => {
  for (let s = 0; s < SONG_STEPS; s++) {
    for (const e of eventsAt(s)) {
      for (const n of e.notes ?? (e.midi !== undefined ? [e.midi] : [])) {
        assert.ok(SCALE_PCS.has(n % 12), `${e.voice} note ${n} at step ${s} is out of key`);
        assert.ok(n >= 28 && n <= 104, `${e.voice} note ${n} at step ${s} is out of range`);
      }
    }
  }
});

test("the game loops the music file at the score's section boundaries", () => {
  assert.equal(STEP_SECONDS, 0.1);
  assert.equal(THEME.loopStart, INTRO_SECONDS);
  assert.equal(THEME.loopEnd, SONG_SECONDS);
  // Whole samples at both common rates, so the loop cannot drift.
  for (const rate of [44100, 48000]) for (const t of [THEME.loopStart, THEME.loopEnd]) assert.ok(Math.abs(t * rate - Math.round(t * rate)) < 1e-6);
  const kb = statSync(new URL('./public/' + THEME.url, import.meta.url)).size / 1024;
  assert.ok(kb > 100 && kb < 1200, `theme file is ${kb.toFixed(0)} KB`);
});
