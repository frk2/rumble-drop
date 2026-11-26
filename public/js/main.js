import { Game } from './logic.js';
import { Scene3D } from './scene.js';
import { Input } from './input.js';
import { sfx, music, unlockAudio, setMuted, isMuted } from './audio.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#game');
const stage = $('#stage');
const overlay = $('#overlay');
const popups = $('#popups');
const flash = $('#flash');
const hud = { score: $('#score'), level: $('#level'), lines: $('#lines') };
const landscape = window.matchMedia('(orientation: landscape)');

const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) : undefined;
const game = new Game({ seed });
let scene;
try {
  scene = new Scene3D(canvas);
} catch (err) {
  console.error(err);
  $('#overlay-title').textContent = 'Your browser could not start 3D graphics';
  $('#overlay-text').textContent = 'Rumble Drop needs WebGL 2. Try Safari or Chrome with hardware acceleration on.';
  $('#play').hidden = true;
  throw err;
}

let state = 'title'; // title | play | paused | over
let clearHold = 0;
let best = 0;
let shownScore = 0;

const playing = () => !landscape.matches && state === 'play' && clearHold <= 0;

const actions = {
  unlock: unlockAudio,
  move(dx) {
    if (game.move(dx)) sfx.move();
  },
  rotate(dir) {
    game.rotate(dir);
  },
  soft() {
    game.softDrop();
  },
  slam() {
    game.hardDrop();
  },
  hold() {
    game.holdPiece();
  },
  pause() {
    if (landscape.matches) return;
    if (state === 'play') pause();
    else if (state === 'paused') resume();
  },
};

const input = new Input({
  stage,
  actions,
  cellPixels: () => scene.cellPixels(),
  enabled: playing,
});

// ---------- overlay screens ----------
function showOverlay(kind) {
  overlay.dataset.kind = kind;
  overlay.hidden = false;
  const title = $('#overlay-title');
  const text = $('#overlay-text');
  const play = $('#play');
  const resumeBtn = $('#resume');
  resumeBtn.hidden = kind !== 'paused';
  if (kind === 'title') {
    title.textContent = 'Rumble Drop';
    text.textContent = 'Stack the falling blocks, fill rows to blow them up.';
    play.textContent = 'Play';
  } else if (kind === 'paused') {
    title.textContent = 'Paused';
    text.textContent = `Score ${game.score.toLocaleString()} · Level ${game.level}`;
    play.textContent = 'Restart';
  } else {
    title.textContent = 'Game over';
    const isBest = game.score > 0 && game.score >= best;
    text.textContent = `Score ${game.score.toLocaleString()} · ${game.lines} lines${isBest ? ' · Best this session!' : ` · Best ${best.toLocaleString()}`}`;
    play.textContent = 'Play again';
  }
  if (!landscape.matches) focusOverlay();
}

function focusOverlay() {
  $(state === 'paused' ? '#resume' : '#play').focus({ preventScroll: true });
}

function start() {
  if (landscape.matches) return;
  unlockAudio();
  input.releaseAll();
  game.reset();
  scene.restart();
  clearHold = 0;
  shownScore = 0;
  state = 'play';
  overlay.hidden = true;
  popups.replaceChildren();
  $('#pause').disabled = false;
  stage.focus({ preventScroll: true });
  updateHud(true);
  sfx.start();
  music.play();
  popup('GO!', 'go');
}

function pause() {
  state = 'paused';
  input.releaseAll();
  music.pause();
  showOverlay('paused');
}

function resume() {
  if (landscape.matches) return;
  unlockAudio();
  state = 'play';
  overlay.hidden = true;
  stage.focus({ preventScroll: true });
  music.resume();
}

function syncOrientation() {
  if (landscape.matches) {
    if (state === 'play') pause();
    $('#orientation-status').hidden = state !== 'paused';
    $('#orientation-title').focus({ preventScroll: true });
  } else {
    scene.resize();
    if (!overlay.hidden) focusOverlay();
  }
}

$('#play').addEventListener('click', start);
$('#resume').addEventListener('click', resume);
$('#pause').addEventListener('click', () => actions.pause());
const muteBtn = $('#mute');
muteBtn.addEventListener('click', () => {
  unlockAudio();
  setMuted(!isMuted());
  muteBtn.setAttribute('aria-pressed', String(isMuted()));
  muteBtn.setAttribute('aria-label', isMuted() ? 'Sound off' : 'Sound on');
});
// Music switches: one in the header (wide screens) and one on the start and pause card.
const musicBtn = $('#music');
const musicCard = $('#music-card');
function showMusic() {
  const on = music.isOn();
  musicBtn.setAttribute('aria-pressed', String(on));
  musicCard.setAttribute('aria-pressed', String(on));
  musicCard.querySelector('span').textContent = on ? 'Music on' : 'Music off';
}
for (const btn of [musicBtn, musicCard]) {
  btn.addEventListener('click', () => {
    unlockAudio();
    music.setOn(!music.isOn());
    showMusic();
  });
}
showMusic();
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play') pause();
});

// ---------- popups ----------
function popup(text, cls, sub) {
  const el = document.createElement('div');
  el.className = `popup ${cls}`;
  const main = document.createElement('span');
  main.className = 'popup-main';
  main.textContent = text;
  if (cls === 'rumble') {
    main.replaceChildren(
      ...[...text].map((ch, i) => {
        const s = document.createElement('span');
        s.textContent = ch;
        s.style.setProperty('--i', i);
        return s;
      })
    );
  }
  el.append(main);
  if (sub) {
    const s = document.createElement('span');
    s.className = 'popup-sub';
    s.textContent = sub;
    el.append(s);
  }
  popups.append(el);
  el.addEventListener('animationend', (e) => {
    if (e.target === el) el.remove();
  });
  while (popups.children.length > 4) popups.firstChild.remove();
}

function screenFlash(color, strength) {
  flash.style.setProperty('--flash', color);
  flash.style.setProperty('--strength', strength);
  flash.classList.remove('on');
  void flash.offsetWidth;
  flash.classList.add('on');
}

function shakeDom(level) {
  stage.classList.remove('jolt-1', 'jolt-2', 'jolt-3');
  void stage.offsetWidth;
  stage.classList.add(`jolt-${level}`);
}

const CLEAR_WORDS = ['', 'NICE!', 'DOUBLE!', 'TRIPLE!!', 'RUMBLE!!!'];
const CLEAR_CLASS = ['', 'clear1', 'clear2', 'clear3', 'rumble'];

// ---------- game events to effects ----------
function handle(ev) {
  switch (ev.type) {
    case 'rotate':
      sfx.rotate();
      break;
    case 'bump':
      sfx.bump();
      break;
    case 'hold':
      sfx.hold();
      break;
    case 'slam':
      scene.slam(ev);
      sfx.slam(ev.distance);
      if (ev.distance >= 14) shakeDom(1);
      break;
    case 'land':
      break;
    case 'lock': {
      if (!ev.slammed) {
        scene.land(ev.cells, ev.kind);
        sfx.land();
      }
      if (ev.perfect) {
        scene.perfect(ev.cells, ev.kind);
        setTimeout(() => sfx.perfect(), ev.slammed ? 60 : 0);
        if (ev.lines === 0) {
          popup('PERFECT FIT!', 'perfect', `+${ev.gained.toLocaleString()}`);
          screenFlash('255, 214, 102', 0.25);
        }
      }
      if (ev.lines > 0) {
        const n = ev.lines;
        scene.clear(ev);
        clearHold = 0.16 + n * 0.06 + 0.08;
        sfx.clear(n, Math.max(0, ev.combo));
        // Let the bigger blasts punch through the music.
        if (n >= 2) music.duck(n >= 4 ? 0.25 : 0.5, n >= 4 ? 1.1 : 0.3);
        setTimeout(() => {
          popup(CLEAR_WORDS[n], CLEAR_CLASS[n], `+${ev.gained.toLocaleString()}`);
          if (ev.perfect) setTimeout(() => popup('PERFECT FIT!', 'perfect small'), 160);
          if (ev.combo >= 1) setTimeout(() => popup(`COMBO ×${ev.combo + 1}`, 'combo'), 260);
          if (ev.allClear) setTimeout(() => popup('ALL CLEAR!', 'rumble'), 500);
          screenFlash(n === 4 ? '255, 240, 255' : '255, 200, 245', [0, 0.15, 0.22, 0.3, 0.4][n]);
          if (n >= 2) shakeDom(n >= 4 ? 3 : n - 1);
        }, (0.16 + n * 0.06) * 1000);
      }
      break;
    }
    case 'levelup':
      setTimeout(() => {
        popup(`LEVEL ${ev.level}`, 'level');
        sfx.levelup();
        scene.levelUp();
      }, 700);
      break;
    case 'gameover':
      state = 'over';
      best = Math.max(best, game.score);
      input.releaseAll();
      scene.gameOver(game.board);
      sfx.gameover();
      music.end();
      shakeDom(2);
      $('#pause').disabled = true;
      setTimeout(() => showOverlay('over'), 1300);
      break;
  }
}

function updateHud(force = false) {
  if (shownScore !== game.score) {
    const diff = game.score - shownScore;
    shownScore += Math.max(1, Math.ceil(diff * 0.2));
    if (shownScore > game.score) shownScore = game.score;
    hud.score.textContent = shownScore.toLocaleString();
    if (diff > 40) {
      hud.score.classList.remove('bump');
      void hud.score.offsetWidth;
      hud.score.classList.add('bump');
    }
  } else if (force) hud.score.textContent = game.score.toLocaleString();
  hud.level.textContent = game.level;
  hud.lines.textContent = game.lines;
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  requestAnimationFrame(frame);
  if (landscape.matches) return;
  if (state === 'play') {
    if (clearHold > 0) clearHold -= dt;
    else {
      input.update(dt);
      game.tick(dt, input.softHeld);
    }
  }
  for (const ev of game.drainEvents()) handle(ev);
  updateHud();
  scene.render(dt, game, { showPiece: state !== 'title' && clearHold <= 0, paused: state === 'paused' });
}

new ResizeObserver(() => {
  if (!landscape.matches) scene.resize();
}).observe(canvas);
landscape.addEventListener('change', syncOrientation);
// iOS: stop pinch zoom and double-tap zoom from hijacking play.
for (const t of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => {
  if (!overlay.contains(e.target)) e.preventDefault();
}, { passive: false });

game.drainEvents();
showOverlay('title');
if (landscape.matches) syncOrientation();
requestAnimationFrame(frame);

// Small hook for automated checks.
window.rumble = { game, scene, start, handle, music, state: () => state };
