// STUDENTS & DEVICE: class list, plus what this device is and what it has sent.
import { store, seedDemoHistory, formatBytes } from '../store.js';
import { tier, TIERS, backendLabel } from '../api.js';
import { esc, header, toast } from '../ui.js';

const COLORS = ['#e76f51', '#2a9d8f', '#e9c46a', '#8e7dbe', '#f4a261', '#4f86c6', '#d16ba5', '#6a994e'];

export function render(view) {
  const s = store.state;
  const t = TIERS[tier()];
  view.innerHTML = `${header('Students & device')}
  <section class="pad">
    <div class="card">
      <div class="card-label">Class list</div>
      <div class="rows">${s.students.map(st => `
        <div class="srow edit">
          <span class="avatar" style="--c:${st.color}">${esc(st.name[0])}</span>
          <input class="input slim grow" value="${esc(st.name)}" data-rename="${st.id}" aria-label="Student name">
          <button class="icon-btn" data-remove="${st.id}" aria-label="Remove ${esc(st.name)}">✕</button>
        </div>`).join('')}</div>
      <div class="row"><input id="newname" class="input grow" placeholder="New student name"><button class="btn primary" data-act="add">Add</button></div>
    </div>
    <div class="card">
      <div class="card-label">This device</div>
      <dl class="spec">
        <dt>Version</dt><dd>Classmate ${esc(t.name)}</dd>
        <dt>AI model</dt><dd>${esc(t.model)} · ${esc(t.where.toLowerCase())}</dd>
        <dt>Memory</dt><dd>${esc(t.ram)}</dd>
        <dt>Running now</dt><dd>${esc(backendLabel())}</dd>
        <dt>Data sent</dt><dd>${formatBytes(s.data.sentBytes)}</dd>
        <dt>Kept on device</dt><dd>${formatBytes(s.data.keptBytes)} of photos and voice that a cloud app would have uploaded</dd>
        <dt>Readings stored</dt><dd>${s.readings.length}</dd>
      </dl>
    </div>
    <div class="row">
      <button class="btn grow" data-act="seed">Load demo class history</button>
      <button class="btn danger" data-act="reset">Reset device</button>
    </div>
  </section>`;
  view.onchange = (e) => {
    const id = e.target.dataset.rename;
    if (id && e.target.value.trim()) store.update(st => { st.students.find(x => x.id === id).name = e.target.value.trim(); });
  };
  view.onclick = (e) => {
    const rm = e.target.closest('[data-remove]')?.dataset.remove;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (rm) { store.update(st => st.students = st.students.filter(x => x.id !== rm)); render(view); }
    if (act === 'add') {
      const name = view.querySelector('#newname').value.trim();
      if (!name) return;
      store.update(st => st.students.push({ id: 's' + Date.now(), name, color: COLORS[st.students.length % COLORS.length] }));
      render(view);
    }
    if (act === 'seed') { seedDemoHistory(); toast('Loaded three weeks of demo readings.', 'ok'); render(view); }
    if (act === 'reset') { if (confirm('Erase all readings, sheets and exams on this device?')) { store.reset(); render(view); toast('Device reset.', 'ok'); } }
  };
}
