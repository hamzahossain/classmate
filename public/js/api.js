// Talks to the simulator server. Enforces the tier rules the real device would:
//   Lite  -> needs network, counts uploaded bytes, has a daily limit
//   Base  -> on device, nothing uploaded
//   Pro   -> on device, nothing uploaded, Pro-only features
import { store, quotaToday } from './store.js';

export const TIERS = {
  lite: { key: 'lite', name: 'Lite', model: 'Gemma 4 · online', ram: '2–3 GB RAM', where: 'Online', price: '$', tagline: 'Cheapest. Needs the internet for AI, with a daily limit.' },
  base: { key: 'base', name: 'Base', model: 'Gemma 4 E2B', ram: '4–6 GB RAM', where: 'On device', price: '$$', tagline: 'Works anywhere. No internet needed, no limits.' },
  pro: { key: 'pro', name: 'Pro', model: 'Gemma 4 E4B', ram: '8 GB RAM', where: 'On device', price: '$$$', tagline: 'Most accurate, plus the Oral Examiner and Home Language bridge.' }
};

export class OfflineError extends Error { constructor(m = 'No network. Classmate Lite needs the internet for AI.') { super(m); this.offline = true; } }
export class QuotaError extends Error { constructor(m) { super(m); this.quota = true; } }

export let status = null;
export async function refreshStatus() {
  try { status = await (await fetch('/api/status', { cache: 'no-store' })).json(); } catch { status = null; }
  return status;
}

export const tier = () => store.state.settings.tier;
export const liteLimit = () => status?.liteDailyLimit || 40;
export const demoForced = () => store.state.settings.demo || new URLSearchParams(location.search).has('demo');
// True when answers come from built-in demo data (then demo-only hints may be sent).
export const usingMock = () => demoForced() || status?.tiers?.[tier()]?.kind === 'mock';

export function backendLabel(t = tier()) {
  if (demoForced()) return 'Demo data';
  return status?.tiers?.[t]?.label || 'checking…';
}

// Rough size of what a cloud app would upload for this payload.
export function payloadBytes(payload) {
  return new Blob([JSON.stringify(payload)]).size;
}

export async function ai(task, payload) {
  const s = store.state.settings;
  const t = s.tier;
  if (t === 'lite') {
    if (!s.online) throw new OfflineError();
    const q = quotaToday();
    if (q.used >= liteLimit()) throw new QuotaError(`Daily limit reached (${liteLimit()} AI actions). It resets at midnight. Base and Pro have no limit.`);
  }
  const body = JSON.stringify({ tier: t, task, payload, demo: demoForced() });
  const res = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  let json;
  try { json = await res.json(); } catch { throw new Error('The simulator server did not answer. Is it running?'); }
  if (!res.ok) throw new Error(json.error || res.statusText);
  const reqBytes = new Blob([body]).size;
  store.update(st => {
    if (t === 'lite') {
      st.data.sentBytes += reqBytes + new Blob([JSON.stringify(json.result)]).size;
      st.quota.used += 1;
    } else {
      st.data.keptBytes += reqBytes; // what a cloud app would have uploaded
    }
  });
  return json.result;
}

// ---- Lite offline queue: work waits on the device until the network returns ----
const handlers = {};
export function onQueue(type, fn) { handlers[type] = fn; }
export function enqueue(item) {
  store.update(st => st.queue.push({ id: 'q' + Date.now() + Math.random().toString(16).slice(2, 6), at: new Date().toISOString(), ...item }));
}
let draining = false;
export async function drainQueue(notify) {
  if (draining) return;
  const s = store.state;
  if (s.settings.tier !== 'lite' || !s.settings.online || !s.queue.length) return;
  draining = true;
  let done = 0;
  try {
    while (store.state.queue.length && store.state.settings.online) {
      const item = store.state.queue[0];
      try { await handlers[item.type]?.(item); done++; }
      catch (e) { if (e.offline || e.quota) break; console.warn('queue item failed', e); }
      store.update(st => { st.queue = st.queue.filter(q => q.id !== item.id); });
    }
  } finally { draining = false; }
  if (done && notify) notify(`Back online: graded ${done} saved item${done > 1 ? 's' : ''}.`);
}

export async function syncNow() {
  const s = store.state;
  const summary = {
    device: 'classmate-' + s.settings.tier,
    week: new Date().toISOString().slice(0, 10),
    students: s.students.map(st => {
      const rs = s.readings.filter(r => r.studentId === st.id);
      const last = rs[rs.length - 1];
      return { id: st.id, readings: rs.length, wcpm: last?.wcpm ?? null, acc: last ? Math.round(last.accuracy * 100) : null };
    }),
    sheetsGraded: s.sheets.length,
    orals: s.orals.length
  };
  const body = JSON.stringify(summary);
  const res = await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  if (!res.ok) throw new Error('Sync failed');
  const bytes = new Blob([body]).size;
  store.update(st => { st.data.sentBytes += bytes; st.data.syncs.push({ at: new Date().toISOString(), bytes }); });
  return bytes;
}
