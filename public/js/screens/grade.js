// GRADE ANSWERS: photos of handwritten answer sheets -> Gemma reads + grades each one,
// the teacher approves, then plain code checks the class for copying.
import { store } from '../store.js';
import { ai, enqueue, onQueue, tier } from '../api.js';
import { findCopying } from '../copycheck.js';
import { esc, header, captureButtons, capture, withBusy, showError, toast } from '../ui.js';

const S = { step: 'setup', detail: null, explain: {} };
const images = new Map(); // sheet id -> photo (kept in memory, never uploaded by Base/Pro)

const SAMPLE = {
  question: 'Why do we see lightning before we hear thunder?',
  modelAnswer: 'Light travels much faster than sound, so the flash reaches us before the sound of the thunder.',
  maxMarks: 10
};

export function render(view, params = {}) {
  if (params.step) S.step = params.step;
  if (!store.state.exam.question) store.update(s => s.exam = { ...SAMPLE, math: false });
  ({ setup, scan, sheet, copy }[S.step] || setup)(view);
}

function setup(view) {
  const ex = store.state.exam;
  view.innerHTML = `${header('Grade Answers')}
  <section class="pad">
    <label class="field-label" for="q">Question</label>
    <textarea id="q" class="textarea" rows="2">${esc(ex.question)}</textarea>
    <label class="field-label" for="ma">Model answer</label>
    <textarea id="ma" class="textarea" rows="3">${esc(ex.modelAnswer)}</textarea>
    <div class="row">
      <label class="field-label inline">Marks
        <select id="mx" class="select">${[5, 10, 20].map(n => `<option ${n === ex.maxMarks ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <label class="toggle"><input type="checkbox" id="math" ${ex.math ? 'checked' : ''}><span></span>Maths: find the wrong step</label>
    </div>
    <button class="btn big primary" data-act="start">Start scanning answer sheets</button>
    ${store.state.sheets.length ? `<button class="btn link" data-act="resume">Continue current batch (${store.state.sheets.length} sheets)</button>` : ''}
  </section>`;
  view.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const question = view.querySelector('#q').value.trim();
    const modelAnswer = view.querySelector('#ma').value.trim();
    if (!question || !modelAnswer) return toast('Add the question and the model answer.', 'warn');
    const changed = question !== store.state.exam.question;
    store.update(s => {
      s.exam = { question, modelAnswer, maxMarks: Number(view.querySelector('#mx').value), math: view.querySelector('#math').checked };
      if (changed && act === 'start') s.sheets = [];
    });
    S.step = 'scan'; render(view);
  };
}

function scoreClass(sh) {
  const r = sh.score / sh.max;
  return r >= 0.75 ? 'good' : r >= 0.45 ? 'ok' : 'low';
}

function scan(view) {
  const sheets = store.state.sheets;
  const ex = store.state.exam;
  const queued = store.state.queue.filter(q => q.type === 'grade').length;
  view.innerHTML = `${header('Grade Answers', { back: 'grade:setup' })}
  <section class="pad">
    <div class="card slim"><div class="card-label">Question</div><p>${esc(ex.question)}</p></div>
    ${captureButtons('grade')}
    <p class="small muted center">Tip: "Pick a file" accepts several photos at once.</p>
    ${queued ? `<div class="banner warn">⏳ ${queued} sheet${queued > 1 ? 's' : ''} saved offline, waiting for network.</div>` : ''}
    <div class="sheet-list">
      ${sheets.length ? sheets.map((sh, i) => `
        <button class="sheet" data-sheet="${i}">
          <span class="avatar">${esc((sh.student_name || '?')[0])}</span>
          <span class="sheet-main"><b>${esc(sh.student_name || 'Sheet ' + (i + 1))}</b>${sh.roll ? ` <span class="muted">· roll ${esc(sh.roll)}</span>` : ''}<br><span class="small muted ellipsis">${esc(sh.answer_text)}</span></span>
          <span class="score ${scoreClass(sh)}">${sh.score}/${sh.max}${sh.approved ? ' ✓' : ''}</span>
        </button>`).join('') : '<p class="empty">No sheets yet. Scan the first answer sheet.</p>'}
    </div>
    <div class="row sticky-actions">
      <button class="btn" data-act="clear" ${sheets.length ? '' : 'disabled'}>Clear</button>
      <button class="btn big primary grow" data-act="copy" ${sheets.length >= 2 ? '' : 'disabled'}>🔍 Check for copying</button>
    </div>
  </section>`;
  view.onclick = async (e) => {
    const cap = e.target.closest('[data-cap]')?.dataset.cap;
    const act = e.target.closest('[data-act]')?.dataset.act;
    const sh = e.target.closest('[data-sheet]');
    if (sh) { S.detail = Number(sh.dataset.sheet); S.step = 'sheet'; return render(view); }
    if (act === 'copy') { S.step = 'copy'; S.explain = {}; return render(view); }
    if (act === 'clear') { store.update(s => s.sheets = []); images.clear(); return render(view); }
    if (cap) {
      try {
        const imgs = await capture(cap, { multiple: true });
        for (let k = 0; k < imgs.length; k++) {
          const job = { type: 'grade', image: imgs[k].base64, dataUrl: imgs[k].dataUrl };
          if (tier() === 'lite' && !store.state.settings.online) { enqueue(job); continue; }
          await withBusy(`Grading sheet ${k + 1} of ${imgs.length}…`, { image: imgs[k].base64 }, () => gradeSheet(job));
        }
        if (store.state.queue.some(q => q.type === 'grade') && !store.state.settings.online) toast('Saved offline. Lite will grade these when the network returns.', 'warn');
        render(view);
      } catch (err) { showError(err); render(view); }
    }
  };
}

async function gradeSheet(job) {
  const ex = store.state.exam;
  const r = await ai('grade', { image: job.image, question: ex.question, modelAnswer: ex.modelAnswer, maxMarks: ex.maxMarks, math: ex.math, index: store.state.sheets.length });
  const id = 'g' + Date.now() + Math.random().toString(16).slice(2, 5);
  images.set(id, job.dataUrl);
  const score = Math.max(0, Math.min(ex.maxMarks, Math.round(Number(r.score) || 0)));
  store.update(s => s.sheets.push({
    id, student_name: r.student_name || '', roll: r.roll || '', answer_text: r.answer_text || '',
    score, max: ex.maxMarks, feedback: r.feedback || '', first_error: r.first_error || '', approved: false, date: new Date().toISOString()
  }));
}
onQueue('grade', gradeSheet);

function sheet(view) {
  const i = S.detail, sh = store.state.sheets[i];
  if (!sh) { S.step = 'scan'; return render(view); }
  const img = images.get(sh.id);
  view.innerHTML = `${header(sh.student_name || 'Sheet ' + (i + 1), { back: 'grade:scan' })}
  <section class="pad">
    ${img ? `<img class="thumb" src="${img}" alt="Answer sheet">` : ''}
    <div class="card"><div class="card-label">What the student wrote</div><p class="handwriting">${esc(sh.answer_text)}</p>
      ${sh.first_error ? `<p class="first-error">First mistake: “${esc(sh.first_error)}”</p>` : ''}</div>
    <div class="card"><div class="card-label">Feedback</div><p>${esc(sh.feedback)}</p></div>
    <div class="score-edit">
      <button class="icon-btn big" data-act="minus" aria-label="Lower score">−</button>
      <div class="score big ${scoreClass(sh)}">${sh.score}/${sh.max}</div>
      <button class="icon-btn big" data-act="plus" aria-label="Raise score">+</button>
    </div>
    <p class="small muted center">Gemma suggests a mark. The teacher decides.</p>
    <button class="btn big ${sh.approved ? '' : 'primary'}" data-act="approve">${sh.approved ? '✓ Approved' : 'Approve mark'}</button>
  </section>`;
  view.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    store.update(s => {
      const x = s.sheets[i];
      if (act === 'minus') x.score = Math.max(0, x.score - 1);
      if (act === 'plus') x.score = Math.min(x.max, x.score + 1);
      if (act === 'approve') x.approved = !x.approved;
    });
    render(view);
  };
}

function copy(view) {
  const sheets = store.state.sheets;
  const answers = sheets.map((s, i) => ({ id: s.id, name: s.student_name || 'Sheet ' + (i + 1), text: s.answer_text }));
  const pairs = findCopying(answers, store.state.exam.modelAnswer).slice(0, 8);
  const flagged = pairs.filter(p => p.flagged).length;
  view.innerHTML = `${header('Copying check', { back: 'grade:scan' })}
  <section class="pad">
    <div class="banner ${flagged ? 'warn' : 'ok'}">${flagged ? `${flagged} pair${flagged > 1 ? 's' : ''} worth a closer look` : 'No suspicious pairs found'}</div>
    <p class="small muted">Shared <b>mistakes</b> matter more than shared correct facts. This is for teacher review only, never proof.</p>
    ${pairs.map((p, k) => `
      <div class="pair ${p.flagged ? 'flagged' : ''}">
        <div class="pair-head"><b>${esc(p.a.name)}</b> &amp; <b>${esc(p.b.name)}</b><span class="badge ${p.flagged ? 'warn' : 'ok'}">${p.flagged ? 'Review' : 'OK'}</span></div>
        <div class="meter"><div style="width:${Math.round(p.score * 100)}%"></div></div>
        <div class="small muted">${Math.round(p.similarity * 100)}% phrase overlap${p.shared.length ? ' · shared unusual words:' : ''}</div>
        ${p.shared.length ? `<div class="chips">${p.shared.slice(0, 6).map(w => `<span class="chip warn">${esc(w)}</span>`).join('')}</div>` : ''}
        <div class="pair-text"><p>“${esc(p.a.text)}”</p><p>“${esc(p.b.text)}”</p></div>
        ${S.explain[k] ? `<div class="explain ${esc(S.explain[k].level)}">${esc(S.explain[k].explanation)}</div>`
          : p.flagged ? `<button class="btn" data-explain="${k}">Ask Gemma to explain</button>` : ''}
      </div>`).join('')}
  </section>`;
  view.onclick = async (e) => {
    const k = e.target.closest('[data-explain]')?.dataset.explain;
    if (k === undefined) return;
    const p = pairs[Number(k)];
    const payload = { question: store.state.exam.question, a: { name: p.a.name, text: p.a.text }, b: { name: p.b.name, text: p.b.text }, similarity: p.similarity, shared: p.shared };
    try {
      S.explain[k] = await withBusy('Comparing the two answers…', payload, () => ai('explain_copy', payload));
      render(view);
    } catch (err) { showError(err); }
  };
}
