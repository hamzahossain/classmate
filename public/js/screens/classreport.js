// CLASS REPORT: statistics computed in code, Gemma turns them into advice.
// Weekly sync sends only this summary (kilobytes), never photos or voices.
import { store, seedDemoHistory, formatBytes } from '../store.js';
import { ai, syncNow } from '../api.js';
import { esc, header, withBusy, showError, toast, sparkline } from '../ui.js';
import { speak } from '../media.js';

const S = { view: 'class', studentId: null, insight: null, parent: {} };

const LANGS = [['en', 'English'], ['bn', 'বাংলা'], ['hi', 'हिन्दी'], ['ur', 'اردو'], ['sw', 'Kiswahili'], ['es', 'Español'], ['fr', 'Français']];

function median(xs) { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; }

export function computeStats() {
  const s = store.state;
  const per = s.students.map(st => {
    const rs = s.readings.filter(r => r.studentId === st.id).sort((a, b) => a.date.localeCompare(b.date));
    const last = rs[rs.length - 1];
    return { st, rs, last, trend: rs.length > 1 ? rs[rs.length - 1].wcpm - rs[0].wcpm : 0 };
  });
  const latest = per.filter(p => p.last).map(p => p.last.wcpm);
  const med = median(latest);
  per.forEach(p => {
    p.status = !p.last ? 'no data'
      : (p.last.wcpm < med * 0.7 || p.last.accuracy < 0.85) ? 'needs help'
      : p.trend >= 8 ? 'improving' : 'on track';
  });
  const counts = new Map();
  s.readings.forEach(r => r.errors?.forEach(e => e.expected && counts.set(e.expected, (counts.get(e.expected) || 0) + 1)));
  const tricky = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word, count]) => ({ word, count }));
  const accs = per.filter(p => p.last).map(p => p.last.accuracy);
  const sheets = s.sheets;
  return {
    per, median: med, tricky,
    avgAcc: accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : 0,
    sheetsAvg: sheets.length ? sheets.reduce((a, x) => a + x.score / x.max, 0) / sheets.length : null
  };
}

export function render(view) {
  return S.view === 'student' ? student(view) : classView(view);
}

function classView(view) {
  const s = store.state;
  const c = computeStats();
  const lastSync = s.data.syncs[s.data.syncs.length - 1];
  if (!s.readings.length) {
    view.innerHTML = `${header('Class Report')}
    <section class="pad center"><p class="lead">No readings yet.</p><p class="muted">Use Read Aloud with a few students, or load three weeks of demo history.</p>
    <button class="btn big primary" data-act="seed">Load demo class history</button></section>`;
    view.onclick = (e) => { if (e.target.closest('[data-act="seed"]')) { seedDemoHistory(); render(view); } };
    return;
  }
  view.innerHTML = `${header('Class Report')}
  <section class="pad">
    <div class="stats">
      <div class="stat"><b>${c.median}</b><span>median words / min</span></div>
      <div class="stat"><b>${Math.round(c.avgAcc * 100)}%</b><span>avg accuracy</span></div>
      <div class="stat"><b>${c.per.filter(p => p.status === 'needs help').length}</b><span>need help</span></div>
    </div>
    <div class="card">
      <div class="card-label">Students (tap for details)</div>
      <div class="rows">${c.per.map(p => `
        <button class="srow" data-sid="${p.st.id}">
          <span class="avatar" style="--c:${p.st.color}">${esc(p.st.name[0])}</span>
          <span class="srow-name">${esc(p.st.name)}</span>
          <span class="srow-spark ${p.status.replace(' ', '-')}">${sparkline(p.rs.map(r => r.wcpm))}</span>
          <span class="srow-num">${p.last ? p.last.wcpm : '–'}</span>
          <span class="status ${p.status.replace(' ', '-')}">${p.status}</span>
        </button>`).join('')}</div>
    </div>
    ${c.tricky.length ? `<div class="card"><div class="card-label">Words the class struggles with</div>
      <div class="chips">${c.tricky.map(t => `<span class="chip">${esc(t.word)} <small>×${t.count}</small></span>`).join('')}</div></div>` : ''}
    <div class="card insight">
      <div class="card-label">What should I reteach this week?</div>
      ${S.insight ? `<p>${esc(S.insight.summary)}</p>
        <ul>${(S.insight.reteach || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        ${(S.insight.attention || []).length ? `<div class="small"><b>One-to-one help:</b> ${(S.insight.attention).map(esc).join('; ')}</div>` : ''}`
        : `<button class="btn big primary" data-act="insight">✨ Ask Gemma</button>`}
    </div>
    <div class="card sync">
      <div class="card-label">Weekly sync to the district</div>
      <p class="small">Sends scores only: no photos, no voices. About <b>${formatBytes(new Blob([JSON.stringify(c.per.map(p => [p.st.id, p.last?.wcpm, p.last?.accuracy]))]).size + 120)}</b>.</p>
      <p class="small muted">${lastSync ? `Last sync: ${new Date(lastSync.at).toLocaleString()} · ${formatBytes(lastSync.bytes)}` : 'Never synced'}</p>
      <button class="btn big" data-act="sync">📡 Sync now</button>
    </div>
  </section>`;
  view.onclick = async (e) => {
    const sid = e.target.closest('[data-sid]')?.dataset.sid;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (sid) { S.view = 'student'; S.studentId = sid; return render(view); }
    if (act === 'insight') {
      const stats = {
        students: c.per.filter(p => p.last).map(p => ({ name: p.st.name, wcpm: p.last.wcpm, accuracy: Math.round(p.last.accuracy * 100), trend: p.trend, status: p.status })),
        class_median_wcpm: c.median, tricky_words: c.tricky,
        answer_sheets: store.state.sheets.length ? { graded: store.state.sheets.length, average_percent: Math.round(c.sheetsAvg * 100) } : null
      };
      try { S.insight = await withBusy('Looking at the whole class…', { stats }, () => ai('class_insight', { stats })); render(view); }
      catch (err) { showError(err); }
    }
    if (act === 'sync') {
      if (!store.state.settings.online) return toast('No network right now. The summary will be sent at the next sync.', 'warn');
      try { const b = await syncNow(); toast(`Synced: ${formatBytes(b)} sent.`, 'ok'); render(view); }
      catch (err) { showError(err); }
    }
  };
}

function student(view) {
  const st = store.student(S.studentId);
  const c = computeStats();
  const p = c.per.find(x => x.st.id === S.studentId);
  const errs = new Map();
  p.rs.forEach(r => r.errors?.forEach(e => e.expected && errs.set(e.expected, (errs.get(e.expected) || 0) + 1)));
  const orals = store.state.orals.filter(o => o.studentId === st.id);
  const rep = S.parent[st.id];
  view.innerHTML = `${header(st.name, { back: 'report:class' })}
  <section class="pad">
    <div class="who big"><span class="avatar xl" style="--c:${st.color}">${esc(st.name[0])}</span><div><b>${esc(st.name)}</b><br><span class="status ${p.status.replace(' ', '-')}">${p.status}</span></div></div>
    <div class="card"><div class="card-label">Reading speed (words correct / min)</div>
      <div class="big-spark">${sparkline(p.rs.map(r => r.wcpm), { w: 320, h: 90 })}</div>
      <div class="small muted">${p.rs.length} readings · ${p.trend >= 0 ? '+' : ''}${p.trend} since the first one</div>
    </div>
    ${errs.size ? `<div class="card"><div class="card-label">Words to practise</div><div class="chips">${[...errs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => `<button class="chip big" data-word="${esc(w)}">${esc(w)}</button>`).join('')}</div></div>` : ''}
    ${orals.length ? `<div class="card"><div class="card-label">Oral exams</div>${orals.map(o => `<p><b>${o.score}/10</b> · ${esc(o.topic)}<br><span class="small">${esc(o.summary)}</span></p>`).join('')}</div>` : ''}
    <div class="card">
      <div class="card-label">Spoken report for parents</div>
      <div class="row"><select id="plang" class="select grow">${LANGS.map(([k, n]) => `<option value="${k}" ${k === (rep?.lang || 'en') ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <button class="btn primary" data-act="parent">Write report</button></div>
      ${rep ? `<p class="parent-text" lang="${rep.lang}">${esc(rep.text)}</p><button class="btn" data-act="say">🔊 Play to parent</button>` : ''}
    </div>
  </section>`;
  view.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const word = e.target.closest('[data-word]')?.dataset.word;
    if (word) speak(word, 'en', { rate: 0.7 });
    if (act === 'say') speak(rep.text, rep.lang);
    if (act === 'parent') {
      const lang = view.querySelector('#plang').value;
      const payload = {
        name: st.name, lang,
        stats: { readings: p.rs.length, latest_wcpm: p.last?.wcpm, first_wcpm: p.rs[0]?.wcpm, accuracy_percent: p.last ? Math.round(p.last.accuracy * 100) : null, practice_words: [...errs.keys()].slice(0, 4), oral_exams: orals.map(o => ({ topic: o.topic, score: o.score })) }
      };
      try {
        const text = await withBusy('Writing the report…', payload, () => ai('parent_report', payload));
        S.parent[st.id] = { lang, text: String(text).trim() };
        render(view);
      } catch (err) { showError(err); }
    }
  };
}

export function setView(v) { S.view = v; }
