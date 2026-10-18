// Small UI helpers shared by every screen.
import { store } from './store.js';
import { TIERS, backendLabel, payloadBytes, tier } from './api.js';
import { openCamera, pickImages } from './media.js';
import { formatBytes } from './store.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function screenEl() { return document.querySelector('.screen'); }

// ---- navigation ----
let router = null;
export function setRouter(fn) { router = fn; }
export function go(name, params) { router?.(name, params); }

export function header(title, { back = 'home', right = '' } = {}) {
  return `<header class="appbar">
    <button class="icon-btn" data-nav="${back}" aria-label="Back">‹</button>
    <h1>${esc(title)}</h1>
    <div class="appbar-right">${right}</div>
  </header>`;
}

// ---- toast ----
let toastTimer;
export function toast(msg, kind = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = 'toast', 3200);
}

// ---- busy overlay: shows where the AI runs and what leaves the device ----
export async function withBusy(text, payload, fn) {
  const el = document.getElementById('busy');
  const t = tier();
  const bytes = payload ? payloadBytes(payload) : 0;
  const where = t === 'lite'
    ? `Online · uploading ${formatBytes(bytes)}`
    : `On this device · ${TIERS[t].model} · nothing uploaded`;
  el.innerHTML = `<div class="busy-card"><div class="spinner"></div><div class="busy-text">${esc(text)}</div><div class="busy-sub">${esc(where)}</div><div class="busy-model">${esc(backendLabel())}</div></div>`;
  el.classList.add('show');
  const t0 = performance.now();
  try { return await fn(); }
  finally {
    // keep it visible long enough to read
    const left = 450 - (performance.now() - t0);
    if (left > 0) await new Promise(r => setTimeout(r, left));
    el.classList.remove('show');
  }
}

// Turn errors into friendly device messages.
export function showError(e) {
  if (e?.offline || e?.quota) console.info(e.message); else console.error(e);
  if (e?.offline) { toast('No network. Lite saved this and will grade it when the internet returns.', 'warn'); return; }
  if (e?.quota) { toast(e.message, 'warn'); return; }
  toast(e?.message || String(e), 'error');
}

// ---- capture: "Open camera" or "Pick a file" ----
export function captureButtons(id = 'cap') {
  return `<div class="capture-row">
    <button class="btn big primary" data-cap="camera" id="${id}-cam"><span class="ico">📷</span>Open camera</button>
    <button class="btn big" data-cap="file" id="${id}-file"><span class="ico">🖼️</span>Pick a file</button>
  </div>`;
}

export async function capture(kind, { multiple = false } = {}) {
  if (kind === 'camera') {
    const shot = await openCamera(screenEl());
    return shot ? [shot] : [];
  }
  return pickImages({ multiple });
}

export function studentChip(st, extra = '') {
  return `<span class="avatar" style="--c:${st.color}">${esc(st.name[0])}</span><span>${esc(st.name)}</span>${extra}`;
}

export function studentGrid(selected) {
  return `<div class="student-grid">${store.state.students.map(st => `
    <button class="student ${selected === st.id ? 'sel' : ''}" data-student="${st.id}">
      <span class="avatar xl" style="--c:${st.color}">${esc(st.name[0])}</span>
      <span class="student-name">${esc(st.name)}</span>
    </button>`).join('')}</div>`;
}

export function locked(featureName, why) {
  return `${header(featureName)}
  <section class="pad center locked">
    <div class="lock-badge">PRO</div>
    <h2>${esc(featureName)} needs Classmate Pro</h2>
    <p>${why}</p>
    <button class="btn big primary" data-set-tier="pro">Switch simulator to Pro</button>
  </section>`;
}

export function sparkline(values, { w = 96, h = 28 } = {}) {
  if (!values.length) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * (w - 4) + 2},${h - 3 - ((v - min) / span) * (h - 6)}`).join(' ');
  const last = pts.split(' ').pop().split(',');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="currentColor"/></svg>`;
}
