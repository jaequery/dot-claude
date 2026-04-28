#!/usr/bin/env node
// debug-trace daemon — loopback-only HTTP sink for AI-injected runtime probes.
// Zero deps. Run from the project root; writes runtime files to ./.debug-trace/.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RUN_DIR = path.resolve(process.cwd(), '.debug-trace');
const LOG_FILE = path.join(RUN_DIR, 'log.jsonl');
const PORT_FILE = path.join(RUN_DIR, 'port');
const PID_FILE = path.join(RUN_DIR, 'pid');
const MAX_BODY = 1024 * 1024;
const MAX_LINES = 10000;

fs.mkdirSync(RUN_DIR, { recursive: true });
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');

let count = lineCount(LOG_FILE);

function lineCount(file) {
  try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length; }
  catch { return 0; }
}

function rotateIfNeeded() {
  if (count <= MAX_LINES) return;
  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
  const kept = lines.slice(-Math.floor(MAX_LINES / 2));
  fs.writeFileSync(LOG_FILE, kept.join('\n') + '\n');
  count = kept.length;
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); reject(new Error('body too large')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Loopback-only enforcement.
  const ip = req.socket.remoteAddress || '';
  if (!ip.includes('127.0.0.1') && ip !== '::1' && !ip.endsWith(':127.0.0.1')) {
    send(res, 403, { error: 'loopback only' });
    return;
  }

  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true, port: server.address().port, count });
  }
  if (req.method === 'GET' && url.pathname === '/dump') {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    fs.createReadStream(LOG_FILE).pipe(res);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/clear') {
    fs.writeFileSync(LOG_FILE, '');
    count = 0;
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/shutdown') {
    send(res, 200, { ok: true, bye: true });
    setTimeout(shutdown, 50);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/log') {
    try {
      const raw = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
      const line = JSON.stringify({ ts: Date.now(), ...parsed }) + '\n';
      fs.appendFileSync(LOG_FILE, line);
      count++;
      rotateIfNeeded();
      return send(res, 200, { ok: true });
    } catch (e) {
      return send(res, 400, { error: String(e && e.message || e) });
    }
  }
  send(res, 404, { error: 'not found' });
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  fs.writeFileSync(PORT_FILE, String(port));
  fs.writeFileSync(PID_FILE, String(process.pid));
  process.stdout.write(`READY ${port}\n`);
});

function shutdown() {
  try { fs.unlinkSync(PORT_FILE); } catch {}
  try { fs.unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
