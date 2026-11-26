// Rumble Drop game rules. Pure logic, no rendering, so it can be tested in Node.
// Board coordinates: x grows right (0..COLS-1), y grows down (0..ROWS-1).
// The top HIDDEN rows are above the visible well.

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN = 2;
export const ROWS = VISIBLE_ROWS + HIDDEN;

export const KINDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// Spawn shapes in their bounding box (x, y-down).
const SHAPES = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

function rotateCW(cells, size) {
  return cells.map(([x, y]) => [size - 1 - y, x]);
}

// ROTATIONS[kind][r] = cells for rotation state r (0 spawn, 1 right, 2 flipped, 3 left)
export const ROTATIONS = {};
for (const k of KINDS) {
  const { size, cells } = SHAPES[k];
  const states = [cells];
  for (let r = 1; r < 4; r++) states.push(k === 'O' ? cells : rotateCW(states[r - 1], size));
  ROTATIONS[k] = states;
}

// Wall kicks, written y-up as is customary; converted to y-down when used.
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

export const LINE_POINTS = [0, 100, 300, 500, 800];

// Seconds per row of gravity at a level.
export function gravityInterval(level) {
  const l = Math.min(level, 20) - 1;
  return Math.max(0.02, Math.pow(0.8 - l * 0.007, l));
}

// Mulberry32: small seeded random generator so tests are repeatable.
export function makeRandom(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export function pieceCells(p) {
  return ROTATIONS[p.kind][p.rot].map(([x, y]) => [p.x + x, p.y + y]);
}

export function collides(board, p) {
  for (const [x, y] of pieceCells(p)) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y >= 0 && board[y][x]) return true;
  }
  return false;
}

export const LOCK_DELAY = 0.5;
const MAX_LOCK_RESETS = 15;

export class Game {
  constructor({ seed, startLevel = 1 } = {}) {
    this.random = makeRandom(seed ?? Date.now());
    this.startLevel = startLevel;
    this.reset();
  }

  reset() {
    this.board = emptyBoard();
    this.bag = [];
    this.queue = [];
    this.hold = null;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.level = this.startLevel;
    this.combo = -1;
    this.over = false;
    this.fallTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.events = [];
    this.pieceCount = 0;
    this.fillQueue();
    this.spawn(this.queue.shift());
  }

  fillQueue() {
    while (this.queue.length < 5) {
      if (this.bag.length === 0) {
        this.bag = [...KINDS];
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop());
    }
  }

  spawn(kind) {
    this.fillQueue();
    const x = kind === 'O' ? 4 : 3;
    this.piece = { kind, rot: 0, x, y: 1 };
    this.fallTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = this.piece.y;
    this.pieceCount++;
    if (collides(this.board, this.piece)) {
      // Try one row higher before giving up.
      this.piece.y -= 1;
      if (collides(this.board, this.piece)) {
        this.over = true;
        this.emit({ type: 'gameover' });
      }
    }
    this.emit({ type: 'spawn', kind });
  }

  emit(e) {
    this.events.push(e);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  grounded() {
    return collides(this.board, { ...this.piece, y: this.piece.y + 1 });
  }

  afterMove() {
    if (this.piece.y > this.lowestY) {
      this.lowestY = this.piece.y;
      this.lockResets = 0;
    }
    if (this.grounded() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  move(dx) {
    if (this.over) return false;
    const next = { ...this.piece, x: this.piece.x + dx };
    if (collides(this.board, next)) {
      this.emit({ type: 'bump', dx });
      return false;
    }
    this.piece = next;
    this.afterMove();
    this.emit({ type: 'move', dx });
    return true;
  }

  rotate(dir) {
    if (this.over || this.piece.kind === 'O') {
      if (!this.over) this.emit({ type: 'rotate', dir });
      return !this.over;
    }
    const from = this.piece.rot;
    const to = (from + dir + 4) % 4;
    const table = this.piece.kind === 'I' ? KICKS_I : KICKS_JLSTZ;
    for (const [kx, ky] of table[`${from}>${to}`]) {
      const next = { ...this.piece, rot: to, x: this.piece.x + kx, y: this.piece.y - ky };
      if (!collides(this.board, next)) {
        this.piece = next;
        this.afterMove();
        this.emit({ type: 'rotate', dir });
        return true;
      }
    }
    this.emit({ type: 'bump', dx: 0 });
    return false;
  }

  softDrop() {
    if (this.over) return false;
    const next = { ...this.piece, y: this.piece.y + 1 };
    if (collides(this.board, next)) return false;
    this.piece = next;
    this.fallTimer = 0;
    this.score += 1;
    this.afterMove();
    this.emit({ type: 'soft' });
    return true;
  }

  ghostY() {
    let y = this.piece.y;
    while (!collides(this.board, { ...this.piece, y: y + 1 })) y++;
    return y;
  }

  hardDrop() {
    if (this.over) return;
    const startY = this.piece.y;
    const endY = this.ghostY();
    const distance = endY - startY;
    const before = pieceCells(this.piece);
    this.piece.y = endY;
    this.score += distance * 2;
    this.emit({ type: 'slam', distance, from: before, to: pieceCells(this.piece), kind: this.piece.kind });
    this.lock(true);
  }

  holdPiece() {
    if (this.over || this.holdUsed) {
      this.emit({ type: 'bump', dx: 0 });
      return false;
    }
    const current = this.piece.kind;
    const swap = this.hold;
    this.hold = current;
    this.holdUsed = true;
    this.pieceCount--;
    this.spawn(swap ?? this.queue.shift());
    this.emit({ type: 'hold', kind: current });
    return true;
  }

  // How snugly a locked piece sits. Call after its cells are on the board.
  fitOf(cells) {
    const mine = new Set(cells.map(([x, y]) => `${x},${y}`));
    const filled = (x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && this.board[y][x]) || mine.has(`${x},${y}`);
    let gapsBelow = 0;
    let openSides = 0;
    for (const [x, y] of cells) {
      if (!mine.has(`${x},${y + 1}`) && !filled(x, y + 1)) gapsBelow++;
      if (!mine.has(`${x - 1},${y}`) && !filled(x - 1, y)) openSides++;
      if (!mine.has(`${x + 1},${y}`) && !filled(x + 1, y)) openSides++;
    }
    return { gapsBelow, openSides, perfect: gapsBelow === 0 && openSides <= 1 };
  }

  lock(slammed = false) {
    const cells = pieceCells(this.piece);
    const kind = this.piece.kind;
    for (const [x, y] of cells) {
      if (y >= 0) this.board[y][x] = kind;
    }
    const fit = this.fitOf(cells);
    const full = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every(Boolean)) full.push(y);
    }
    const clearedRows = full.map((y) => [...this.board[y]]);
    const n = full.length;
    let gained = 0;
    if (n > 0) {
      this.combo++;
      gained += LINE_POINTS[n] * this.level;
      if (this.combo > 0) gained += 50 * this.combo * this.level;
      // Remove from the bottom up so earlier splices do not shift later indices.
      for (let i = full.length - 1; i >= 0; i--) this.board.splice(full[i], 1);
      while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(null));
      this.lines += n;
    } else {
      this.combo = -1;
    }
    if (fit.perfect) gained += 50 * this.level;
    this.score += gained;
    const lockedOut = cells.every(([, y]) => y < HIDDEN);
    const boardEmpty = this.board.every((row) => row.every((c) => !c));
    this.emit({
      type: 'lock',
      kind,
      cells,
      slammed,
      perfect: fit.perfect,
      rows: full,
      clearedRows,
      lines: n,
      combo: this.combo,
      gained,
      allClear: n > 0 && boardEmpty,
    });
    const newLevel = this.startLevel + Math.floor(this.lines / 10);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.emit({ type: 'levelup', level: newLevel });
    }
    this.holdUsed = false;
    if (lockedOut) {
      this.over = true;
      this.emit({ type: 'gameover' });
      return;
    }
    this.spawn(this.queue.shift());
  }

  // Advance time. softHeld makes the piece fall fast.
  tick(dt, softHeld = false) {
    if (this.over) return;
    if (this.grounded()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY || this.lockResets >= MAX_LOCK_RESETS && this.lockTimer >= LOCK_DELAY / 3) {
        this.emit({ type: 'land' });
        this.lock(false);
      }
      return;
    }
    this.lockTimer = 0;
    const interval = softHeld ? Math.min(0.04, gravityInterval(this.level) / 20) : gravityInterval(this.level);
    this.fallTimer += dt;
    while (this.fallTimer >= interval) {
      this.fallTimer -= interval;
      const next = { ...this.piece, y: this.piece.y + 1 };
      if (collides(this.board, next)) break;
      this.piece = next;
      if (softHeld) this.score += 1;
      this.afterMove();
    }
  }
}
