// All device data lives on the device (localStorage in the simulator).
const KEY = 'classmate.device.v1';

const COLORS = ['#e76f51', '#2a9d8f', '#e9c46a', '#8e7dbe', '#f4a261', '#4f86c6', '#d16ba5', '#6a994e'];
const NAMES = ['Rafi', 'Mina', 'Tanvir', 'Ayesha', 'Joy', 'Nadia', 'Sami', 'Lina'];

function defaults() {
  return {
    settings: { tier: 'base', online: true, demo: false, lang: 'en', homeLang: 'bn' },
    students: NAMES.map((name, i) => ({ id: 's' + (i + 1), name, color: COLORS[i % COLORS.length] })),
    passage: null,        // today's page: { text, title, start, image? }
    readings: [],         // read-aloud results
    sheets: [],           // graded answer sheets (current batch)
    exam: { question: '', modelAnswer: '', maxMarks: 10, math: false },
    orals: [],            // oral exam results (Pro)
    queue: [],            // Lite: work waiting for a network
    quota: { day: today(), used: 0 },
    data: { sentBytes: 0, keptBytes: 0, syncs: [] }
  };
}

export function today() { return new Date().toISOString().slice(0, 10); }

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = defaults();
    const s = JSON.parse(raw);
    return { ...d, ...s, settings: { ...d.settings, ...s.settings }, data: { ...d.data, ...s.data }, quota: { ...d.quota, ...s.quota }, exam: { ...d.exam, ...s.exam } };
  } catch { return defaults(); }
}

export const store = {
  state: load(),
  listeners: new Set(),
  save() {
    try {
      // never persist large media; it would not fit and the real device stores files separately
      // (the Lite offline queue holds recordings, so it stays in memory for the session)
      const slim = { ...this.state, queue: [], passage: this.state.passage && { ...this.state.passage, image: undefined } };
      localStorage.setItem(KEY, JSON.stringify(slim));
    } catch { /* storage full or blocked: keep working in memory */ }
    this.listeners.forEach(fn => fn(this.state));
  },
  update(fn) { fn(this.state); this.save(); },
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  reset() { const settings = this.state.settings; this.state = defaults(); this.state.settings = { ...this.state.settings, tier: settings.tier }; this.save(); },
  student(id) { return this.state.students.find(s => s.id === id); }
};

// Reset Lite's daily quota at midnight.
export function quotaToday() {
  const q = store.state.quota;
  if (q.day !== today()) { q.day = today(); q.used = 0; store.save(); }
  return q;
}

export function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

// Three weeks of believable history so the Class Report is not empty in a demo.
export function seedDemoHistory() {
  const s = store.state;
  const base = { Rafi: 92, Mina: 48, Tanvir: 55, Ayesha: 84, Joy: 70, Nadia: 38, Sami: 66, Lina: 77 };
  const tricky = ['through', 'thought', 'mirror', 'counted', 'brown', 'walked', 'tied', 'clouds', 'white', 'began'];
  const readings = [];
  const now = Date.now();
  s.students.forEach((st, k) => {
    const start = base[st.name] ?? 60 + (k * 7) % 30;
    for (let w = 0; w < 6; w++) {
      const day = new Date(now - (5 - w) * 3.5 * 864e5);
      const speed = Math.round(start + w * (start < 60 ? 3.2 : 1.8) + ((k * 13 + w * 7) % 9) - 4);
      const acc = Math.min(0.99, (start < 60 ? 0.78 : 0.9) + w * 0.012 + ((k + w) % 3) * 0.01);
      const attempted = 40 + ((k + w) % 3) * 6;
      const correct = Math.round(attempted * acc);
      const nErr = attempted - correct;
      const errors = Array.from({ length: Math.min(nErr, 4) }, (_, e) => ({ expected: tricky[(k * 3 + w + e * 2) % tricky.length], said: '', type: e % 2 ? 'missed' : 'misread' }));
      readings.push({ id: `seed-${st.id}-${w}`, studentId: st.id, date: day.toISOString(), wcpm: speed, accuracy: correct / attempted, attempted, correct, errors, seconds: 25, seeded: true });
    }
  });
  s.readings = [...s.readings.filter(r => !r.seeded), ...readings];
  store.save();
}
