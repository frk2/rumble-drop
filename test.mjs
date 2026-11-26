import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, KINDS, ROTATIONS, COLS, ROWS, emptyBoard, collides, pieceCells } from './public/js/logic.js';

const fill = (board, y, except = []) => {
  for (let x = 0; x < COLS; x++) if (!except.includes(x)) board[y][x] = 'O';
};

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
