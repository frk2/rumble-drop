# Rumble Drop

A colorful 3D falling-block game built with three.js, made to be played by touch
on an iPad mini (keyboard works too). Seven four-square pieces, slam-down shakes,
perfect-fit sparkles and line-clear explosions that grow with every extra line.

This folder is an EmptyOS static Thing (`thing.yaml`, served from `public/`).
It is not on the EmptyOS computer yet; publishing there is a separate step.

- `public/` — the game (no build step, no third-party requests)
- `public/audio/theme.m4a` — the background music, an original electro track made for this game
  (AAC, 64 s: a 12.8 s intro, then a 51.2 s section that loops without a gap). Players can turn it
  off with the music button in the header or the Music switch on the start and pause card.
- `music/` — the source of that track: the score (`score.js`), the synth that plays it (`synth.js`)
  and `render.mjs`, which renders it in headless Chrome and encodes it with ffmpeg:
  `node music/render.mjs` (set `CHROME=` if Chrome is not `google-chrome`). If you change the
  score's length or tempo, update `public/js/theme.js` to match; `./verify` checks it.
- `public/vendor/three/` — three.js r185.1 and the postprocessing addons it uses (MIT, see `LICENSE`)
- `./verify` — syntax checks and the game-logic and music tests in `test.mjs` (Node 22+)

Run locally: `python3 -m http.server -d public 8080` and open http://localhost:8080/.
