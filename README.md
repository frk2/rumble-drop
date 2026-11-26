# Rumble Drop

A colorful 3D falling-block game built with three.js, made to be played by touch
on iPhones and iPad mini (keyboard works too). Seven four-square pieces, slam-down
shakes, perfect-fit sparkles and line-clear explosions that grow with every extra line.
Play in portrait, or make your browser window taller than it is wide. Turning to
landscape pauses the game until you turn back and choose Resume.
On iPhone, use Safari’s Add to Home Screen to play without the browser toolbar.

This folder is an EmptyOS static Thing (`thing.yaml`, served from `public/`),
published at https://rumble-drop.faraz.emptyos.app/.

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
- `public/icon.svg` — Home Screen icon source. Regenerate the iOS PNG with
  `ffmpeg -i public/icon.svg -frames:v 1 public/icon-180.png`.

Run locally: `python3 -m http.server -d public 8080` and open http://localhost:8080/.

## Deploy

A merge into `main` deploys this app to its EmptyOS Thing `rumble-drop`
(https://rumble-drop.faraz.emptyos.app/) automatically. After Toastty merges a pull
request, its `merge-and-deploy` skill runs
`~/.toastty/skills/emptyos-deploy/scripts/emptyos-deploy`, which publishes
main as one commit, keeps the Thing's live visibility, and posts the result
as the `emptyos/deploy` status on the merged commit, so a failed deploy shows
as a red mark on main.

Do not publish with `empty put` by hand: the next deploy stops when the live
Thing holds content that is not on main. To deploy main by hand, run
`~/.toastty/skills/emptyos-deploy/scripts/emptyos-deploy --github frk2/rumble-drop`
(add `--check` to see what it would do).
