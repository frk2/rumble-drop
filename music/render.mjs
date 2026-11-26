#!/usr/bin/env node
// Renders Rumble Drop's theme from the score and saves public/audio/theme.m4a.
// Needs Google Chrome (or Chromium; set CHROME=path) and ffmpeg. Run: node music/render.mjs
// The game only plays the saved file; this script is how the file was made.

import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '..', 'public', 'audio', 'theme.m4a');
const chrome = process.env.CHROME || 'google-chrome';

// Serve this folder to the page, nothing else.
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://x').pathname.slice(1);
  if (!['render.html', 'synth.js', 'score.js'].includes(name)) return res.writeHead(404).end();
  const type = extname(name) === '.html' ? 'text/html' : 'text/javascript';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(await readFile(join(here, name)));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const pagePort = server.address().port;

const profile = await mkdtemp(join(tmpdir(), 'rumble-render-'));
const browser = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const devtools = await new Promise((resolve, reject) => {
  let err = '';
  browser.stderr.on('data', (d) => {
    err += d;
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
    if (m) resolve(new URL(m[1]).port);
  });
  browser.on('exit', () => reject(new Error(`Chrome exited: ${err}`)));
});

try {
  const tab = await (await fetch(`http://127.0.0.1:${devtools}/json/new?http://127.0.0.1:${pagePort}/render.html`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    pending.get(d.id)?.(d);
    pending.delete(d.id);
  };
  await new Promise((r) => (ws.onopen = r));
  const evaluate = async (expression) => {
    const r = await new Promise((r) => {
      pending.set(++id, r);
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };
  while (!(await evaluate('window.ready === true'))) await new Promise((r) => setTimeout(r, 100));
  const t0 = Date.now();
  const r = await evaluate('render()');
  const wavFile = join(profile, 'theme.wav');
  await writeFile(wavFile, Buffer.from(r.wav, 'base64'));
  // AAC in MP4 plays in Safari and every current browser; the encoder's priming samples are
  // recorded in the file so decoders trim them and the loop points stay exact.
  execFileSync('ffmpeg', ['-nostdin', '-y', '-loglevel', 'error', '-i', wavFile, '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-map_metadata', '-1', outFile]);
  const { size } = await stat(outFile);
  console.log(`rendered ${(r.samples / r.sampleRate).toFixed(1)} s in ${((Date.now() - t0) / 1000).toFixed(1)} s; raw peak ${r.rawPeak.toFixed(3)}`);
  console.log(`wrote ${outFile} (${(size / 1024).toFixed(0)} KB)`);
  ws.close();
} finally {
  const exited = new Promise((r) => browser.once('exit', r));
  browser.kill();
  await exited;
  server.close();
  await rm(profile, { recursive: true, force: true });
}
