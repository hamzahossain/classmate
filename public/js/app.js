// App shell: router, device status bar, and the presenter panel next to the device.
import { store, quotaToday, formatBytes, seedDemoHistory } from './store.js';
import { TIERS, refreshStatus, status, liteLimit, backendLabel, drainQueue, demoForced } from './api.js';
import { setRouter, toast, esc } from './ui.js';
import * as home from './screens/home.js';
import * as read from './screens/read.js';
import * as grade from './screens/grade.js';
import * as test from './screens/test.js';
import * as report from './screens/classreport.js';
import * as listen from './screens/listen.js';
import * as oral from './screens/oral.js';
import * as bridge from './screens/bridge.js';
import * as students from './screens/students.js';

const SCREENS = { home, read, grade, test, report, listen, oral, bridge, students };
const view = document.getElementById('view');
let current = 'home';

function navigate(target, params = {}) {
  let [name, sub] = String(target).split(':');
  if (!SCREENS[name]) name = 'home';
  if (sub) {
    if (name === 'report') report.setView(sub);
    else if (name === 'oral') oral.setStep(sub);
    else params = { ...params, step: sub };
  }
  if (name === 'home' && current === 'read') read.reset();
  current = name;
  view.onclick = null; view.onchange = null;
  speechSynthesis?.cancel?.();
  SCREENS[name].render(view, params);
  view.scrollTop = 0;
  document.querySelector('.screen')?.setAttribute('data-screen', name);
}
setRouter(navigate);

// Global navigation buttons: data-nav="read" or data-nav="read:page"; data-set-tier="pro"
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { e.preventDefault(); navigate(nav.dataset.nav); return; }
  const st = e.target.closest('[data-set-tier]');
  if (st) setTier(st.dataset.setTier);
});

// ---------- tier, network, demo ----------
function setTier(t) {
  store.update(s => s.settings.tier = t);
  document.getElementById('device').dataset.tier = t;
  toast(`Now simulating Classmate ${TIERS[t].name} · ${TIERS[t].model}`);
  navigate(current === 'oral' || current === 'bridge' ? current : 'home');
  renderChrome();
}

function setOnline(on) {
  store.update(s => s.settings.online = on);
  renderChrome();
  if (on) drainQueue((msg) => { toast(msg, 'ok'); if (current === 'home') navigate('home'); });
  if (current === 'home') navigate('home');
}

// ---------- status bar + presenter panel ----------
function renderChrome() {
  const s = store.state, t = s.settings.tier, T = TIERS[t];
  const q = quotaToday();
  document.getElementById('device').dataset.tier = t;
  document.getElementById('sb-tier').textContent = t === 'lite' ? 'LITE · CLOUD AI' : `${T.name.toUpperCase()} · ${T.model.replace('Gemma 4 ', '')}`;
  document.getElementById('sb-net').innerHTML = s.settings.online ? signalIcon(true) : signalIcon(false);
  document.getElementById('sb-net').title = s.settings.online ? 'Network available' : 'No network';
  const offlineBadge = document.getElementById('sb-offline');
  offlineBadge.textContent = t === 'lite' ? (s.settings.online ? '' : 'OFFLINE · AI paused') : 'AI on device';
  offlineBadge.className = 'sb-badge ' + (t === 'lite' ? (s.settings.online ? '' : 'warn') : 'ok');

  // presenter panel
  document.querySelectorAll('[data-tier-card]').forEach(b => b.classList.toggle('on', b.dataset.tierCard === t));
  document.getElementById('net-toggle').checked = s.settings.online;
  document.getElementById('demo-toggle').checked = demoForced();
  document.getElementById('p-backend').textContent = backendLabel();
  document.getElementById('p-sent').textContent = formatBytes(s.data.sentBytes);
  document.getElementById('p-kept').textContent = formatBytes(s.data.keptBytes);
  const quota = document.getElementById('p-quota');
  quota.hidden = t !== 'lite';
  document.getElementById('p-quota-n').textContent = `${q.used} / ${liteLimit()}`;
  document.getElementById('p-quota-bar').style.width = Math.min(100, (q.used / liteLimit()) * 100) + '%';
  document.getElementById('p-queue').textContent = s.queue.length ? `${s.queue.length} waiting for network` : '';
  const tiers = status?.tiers || {};
  document.getElementById('p-backends').innerHTML = Object.entries(TIERS).map(([k, v]) =>
    `<li><b>${v.name}</b> ${esc(demoForced() ? 'Demo data' : tiers[k]?.label || 'checking…')}</li>`).join('');
}

function signalIcon(on) {
  return on
    ? '<svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1" opacity=".35"/></svg>'
    : '<svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1" opacity=".35"/><rect x="5" y="5" width="3" height="7" rx="1" opacity=".35"/><rect x="10" y="2.5" width="3" height="9.5" rx="1" opacity=".35"/><path d="M12 1 L18 7 M18 1 L12 7" stroke="currentColor" stroke-width="1.6"/></svg>';
}

function tickClock() {
  const d = new Date();
  document.getElementById('sb-time').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function bindPanel() {
  document.querySelectorAll('[data-tier-card]').forEach(b => b.addEventListener('click', () => setTier(b.dataset.tierCard)));
  document.getElementById('net-toggle').addEventListener('change', (e) => setOnline(e.target.checked));
  document.getElementById('demo-toggle').addEventListener('change', (e) => { store.update(s => s.settings.demo = e.target.checked); renderChrome(); });
  document.getElementById('p-use-quota').addEventListener('click', () => { store.update(s => s.quota.used = liteLimit()); renderChrome(); toast('Lite daily limit used up (for the demo).'); });
  document.getElementById('p-reset-quota').addEventListener('click', () => { store.update(s => s.quota.used = 0); renderChrome(); });
  document.getElementById('p-seed').addEventListener('click', () => { seedDemoHistory(); toast('Loaded three weeks of demo readings.', 'ok'); if (current === 'report') navigate('report'); });
  document.getElementById('p-reset').addEventListener('click', () => { if (confirm('Reset all device data?')) { store.reset(); navigate('home'); } });
  document.getElementById('p-home').addEventListener('click', () => navigate('home'));
  document.getElementById('p-counters-reset').addEventListener('click', () => { store.update(s => { s.data.sentBytes = 0; s.data.keptBytes = 0; }); });
}

store.on(renderChrome);
bindPanel();
tickClock(); setInterval(tickClock, 15000);
navigate('home');
renderChrome();
refreshStatus().then(renderChrome);
setInterval(() => refreshStatus().then(renderChrome), 15000);
// Voices load asynchronously in some browsers
speechSynthesis?.addEventListener?.('voiceschanged', () => {});
