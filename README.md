# Rumble Drop

A colorful 3D falling-block game built with three.js, made to be played by touch
on an iPad mini (keyboard works too). Seven four-square pieces, slam-down shakes,
perfect-fit sparkles and line-clear explosions that grow with every extra line.

This folder is an EmptyOS static Thing (`thing.yaml`, served from `public/`),
published at https://rumble-drop.faraz.emptyos.app/.

- `public/` — the game (no build step, no third-party requests)
- `public/vendor/three/` — three.js r185.1 and the postprocessing addons it uses (MIT, see `LICENSE`)
- `./verify` — syntax checks and the game-logic tests in `test.mjs` (Node 22+)

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
