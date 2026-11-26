# Rumble Drop

A colorful 3D falling-block game built with three.js, made to be played by touch
on an iPad mini (keyboard works too). Seven four-square pieces, slam-down shakes,
perfect-fit sparkles and line-clear explosions that grow with every extra line.

This folder is an EmptyOS static Thing (`thing.yaml`, served from `public/`).
It is not on the EmptyOS computer yet; publishing there is a separate step.

- `public/` — the game (no build step, no third-party requests)
- `public/vendor/three/` — three.js r185.1 and the postprocessing addons it uses (MIT, see `LICENSE`)
- `./verify` — syntax checks and the game-logic tests in `test.mjs` (Node 22+)

Run locally: `python3 -m http.server -d public 8080` and open http://localhost:8080/.
