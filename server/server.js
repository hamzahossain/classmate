// Classmate device simulator: zero-dependency Node server.
//   npm start        -> uses the model backends configured in .env
//   npm run demo     -> demo data only, no model needed
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TASKS, PRO_ONLY, parseJson, stripThinking } from './tasks.js';
import { mock } from './mock.js';
import { callPython, callOpenAI, callGemini, pythonHealth, openaiHealth } from './backends.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

// ---------- config (.env without dependencies) ----------
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();
const env = process.env;
const cfg = {
  PORT: Number(env.PORT || 3000),
  LOCAL_BACKEND: (env.LOCAL_BACKEND || 'python').toLowerCase(),
  PYTHON_MODEL_URL: (env.PYTHON_MODEL_URL || 'http://127.0.0.1:8008').replace(/\/$/, ''),
  OPENAI_COMPAT_URL_BASE: env.OPENAI_COMPAT_URL_BASE || 'http://127.0.0.1:8080',
  OPENAI_COMPAT_URL_PRO: env.OPENAI_COMPAT_URL_PRO || env.OPENAI_COMPAT_URL_BASE || 'http://127.0.0.1:8080',
  GEMINI_API_KEY: env.GEMINI_API_KEY || '',
  LITE_MODEL: env.LITE_MODEL || 'gemma-4-31b-it',
  LITE_DAILY_LIMIT: Number(env.LITE_DAILY_LIMIT || 40),
  DEMO: process.argv.includes('--demo') || /^(1|true|yes)$/i.test(env.DEMO || '')
};

// ---------- which backend serves each tier ----------
let statusCache = { at: 0, value: null };
async function backendStatus() {
  if (Date.now() - statusCache.at < 4000 && statusCache.value) return statusCache.value;
  const demo = { kind: 'mock', label: 'Demo data (no model)' };
  let base = demo, pro = demo;
  if (!cfg.DEMO && cfg.LOCAL_BACKEND === 'python') {
    const h = await pythonHealth(cfg);
    if (h) {
      base = { kind: 'python', label: h.models?.base?.label || 'Gemma 4 E2B (local)', ready: h.models?.base?.ok };
      pro = { kind: 'python', label: h.models?.pro?.label || 'Gemma 4 E4B (local)', ready: h.models?.pro?.ok };
      if (!base.ready) base = { ...demo, label: 'Demo data (model files missing, see README)' };
      if (!pro.ready) pro = base;
    } else {
      base = pro = { ...demo, label: 'Demo data (model server not running)' };
    }
  } else if (!cfg.DEMO && cfg.LOCAL_BACKEND === 'openai') {
    const okBase = await openaiHealth(cfg.OPENAI_COMPAT_URL_BASE);
    const okPro = await openaiHealth(cfg.OPENAI_COMPAT_URL_PRO);
    base = okBase ? { kind: 'openai', label: 'Gemma 4 E2B (llama-server)' } : { ...demo, label: 'Demo data (llama-server not reachable)' };
    pro = okPro ? { kind: 'openai', label: 'Gemma 4 E4B (llama-server)' } : base;
  }
  let lite;
  if (cfg.DEMO) lite = demo;
  else if (cfg.GEMINI_API_KEY) lite = { kind: 'gemini', label: `${cfg.LITE_MODEL} (Gemini API)` };
  else lite = { ...base, label: base.kind === 'mock' ? base.label : base.label + ', simulated online' };
  const value = { demo: cfg.DEMO, liteDailyLimit: cfg.LITE_DAILY_LIMIT, tiers: { lite, base, pro } };
  statusCache = { at: Date.now(), value };
  return value;
}

async function runTask(tier, task, payload, forceDemo) {
  const build = TASKS[task];
  if (!build) throw httpError(400, 'Unknown task ' + task);
  if (PRO_ONLY.has(task) && tier !== 'pro') throw httpError(403, 'This feature needs Classmate Pro (Gemma 4 E4B).');
  const status = await backendStatus();
  const backend = forceDemo ? { kind: 'mock', label: 'Demo data (forced)' } : status.tiers[tier] || status.tiers.base;
  const t0 = Date.now();
  let result;
  if (backend.kind === 'mock') {
    await new Promise(r => setTimeout(r, 350 + Math.random() * 500)); // feel like a model
    result = mock(task, payload);
  } else {
    const req = { tier, ...build(payload) };
    const call = backend.kind === 'python' ? callPython : backend.kind === 'openai' ? callOpenAI : callGemini;
    const text = await call(cfg, req);
    result = req.json ? parseJson(text) : stripThinking(text);
  }
  return { result, backend: backend.label, kind: backend.kind, ms: Date.now() - t0 };
}

// ---------- http plumbing ----------
function httpError(code, msg) { const e = new Error(msg); e.code = code; return e; }
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(httpError(413, 'Request too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(httpError(400, 'Invalid JSON')); } });
    req.on('error', reject);
  });
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json',
  '.ico': 'image/x-icon', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown; charset=utf-8'
};
function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.normalize(path.join(PUBLIC, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/api/status' && req.method === 'GET') return send(res, 200, await backendStatus());
    if (pathname === '/api/ai' && req.method === 'POST') {
      const { tier = 'base', task, payload = {}, demo = false } = await readBody(req);
      const out = await runTask(tier, task, payload, demo);
      return send(res, 200, out);
    }
    if (pathname === '/api/sync' && req.method === 'POST') {
      // The "district server". In real life this is the only thing that ever leaves the device.
      const body = await readBody(req, 1024 * 1024);
      const line = JSON.stringify({ received: new Date().toISOString(), ...body }) + '\n';
      fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
      fs.appendFileSync(path.join(ROOT, 'data', 'sync-log.jsonl'), line);
      return send(res, 200, { ok: true, bytes: Buffer.byteLength(JSON.stringify(body)) });
    }
    if (pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    return serveStatic(req, res);
  } catch (err) {
    const code = err.code && Number.isInteger(err.code) ? err.code : 502;
    console.error(`[error] ${err.message}`);
    return send(res, code, { error: err.message });
  }
});

server.listen(cfg.PORT, async () => {
  const s = await backendStatus();
  console.log(`\n  Classmate simulator  ->  http://localhost:${cfg.PORT}`);
  console.log(`  Report               ->  http://localhost:${cfg.PORT}/report.html\n`);
  for (const [tier, b] of Object.entries(s.tiers)) console.log(`  ${tier.padEnd(5)} : ${b.label}`);
  console.log('');
});
