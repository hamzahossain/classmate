// READ ALOUD: teacher photographs a page, marks where to start, a child reads,
// Gemma transcribes blind, code scores every word, Gemma writes kind feedback.
import { store } from '../store.js';
import { ai, enqueue, onQueue, tier, usingMock } from '../api.js';
import { tokenize, align, wcpm } from '../align.js';
import { Recorder, pickAudio, speak, MAX_SECONDS } from '../media.js';
import { esc, header, captureButtons, capture, withBusy, showError, toast, studentGrid, go } from '../ui.js';

const S = { step: 'page', image: null, studentId: null, audio: null, result: null, editing: false, answer: null };

const passage = () => store.state.passage;
const tokens = () => tokenize(passage()?.text || '');

export function render(view, params = {}) {
  if (params.step) S.step = params.step;
  if (S.step !== 'page' && !passage()) S.step = 'page';
  const steps = { page, mark, student, record, result };
  (steps[S.step] || page)(view);
}

function stepper(n) {
  const labels = ['Page', 'Start', 'Student', 'Read', 'Result'];
  return `<ol class="stepper">${labels.map((l, i) => `<li class="${i < n ? 'done' : i === n ? 'now' : ''}">${l}</li>`).join('')}</ol>`;
}

// ---------- 1. page ----------
function page(view) {
  const p = passage();
  view.innerHTML = `${header('Read Aloud')}${stepper(0)}
  <section class="pad">
    ${p ? `<div class="card">
        <div class="card-label">Today's page</div>
        <p class="preview">${esc(p.text.slice(0, 180))}${p.text.length > 180 ? '…' : ''}</p>
        <button class="btn big primary" data-act="use">Use this page</button>
      </div>
      <div class="divider"><span>or scan a new page</span></div>` : `<p class="lead">Take a photo of the paragraph the class is reading today.</p>`}
    ${captureButtons('read')}
    <button class="btn link" data-act="type">Type or paste the text instead</button>
  </section>`;
  view.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const cap = e.target.closest('[data-cap]')?.dataset.cap;
    if (act === 'use') { S.step = 'mark'; render(view); }
    if (act === 'type') { store.update(s => s.passage = { text: '', start: 0 }); S.editing = true; S.step = 'mark'; render(view); }
    if (cap) {
      try {
        const [img] = await capture(cap);
        if (!img) return;
        S.image = img.dataUrl;
        const text = await withBusy('Reading the page…', { image: img.base64 }, () => ai('ocr', { image: img.base64, mock_kind: 'story' }));
        if (!text?.trim()) return toast('No text found on that photo. Try again with better light.', 'warn');
        store.update(s => s.passage = { text: text.trim(), start: 0 });
        S.editing = false; S.step = 'mark'; render(view);
      } catch (err) { showError(err); }
    }
  };
}

// ---------- 2. mark where to start ----------
function mark(view) {
  const p = passage();
  const tk = tokens();
  view.innerHTML = `${header('Read Aloud', { back: 'read:page' })}${stepper(1)}
  <section class="pad">
    ${S.image ? `<img class="thumb" src="${S.image}" alt="Scanned page">` : ''}
    ${S.editing ? `
      <label class="field-label" for="ptext">Page text</label>
      <textarea id="ptext" class="textarea" rows="9" placeholder="Paste or type the paragraph…">${esc(p.text)}</textarea>
      <button class="btn big primary" data-act="save">Save text</button>`
    : `<p class="hint">👆 Tap the word where the student should <b>start reading</b>.</p>
      <div class="words selectable">${tk.map((t, i) => `<button class="w ${i < p.start ? 'before' : ''} ${i === p.start ? 'start' : ''}" data-i="${i}">${esc(t.raw)}</button>`).join(' ')}</div>
      <div class="row">
        <button class="btn" data-act="edit">✏️ Edit text</button>
        <button class="btn big primary grow" data-act="next">Next: who is reading?</button>
      </div>`}
  </section>`;
  view.onclick = (e) => {
    const w = e.target.closest('[data-i]');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (w) { store.update(s => s.passage.start = Number(w.dataset.i)); render(view); }
    if (act === 'edit') { S.editing = true; render(view); }
    if (act === 'save') {
      const text = view.querySelector('#ptext').value.trim();
      if (!text) return toast('Add some text first.', 'warn');
      store.update(s => s.passage = { text, start: 0 });
      S.editing = false; render(view);
    }
    if (act === 'next') { S.step = 'student'; render(view); }
  };
}

// ---------- 3. student ----------
function student(view) {
  view.innerHTML = `${header('Read Aloud', { back: 'read:mark' })}${stepper(2)}
  <section class="pad"><p class="lead">Who is reading?</p>${studentGrid(S.studentId)}</section>`;
  view.onclick = (e) => {
    const b = e.target.closest('[data-student]');
    if (b) { S.studentId = b.dataset.student; S.step = 'record'; render(view); }
  };
}

// ---------- 4. record ----------
let rec = null;
function record(view) {
  const st = store.student(S.studentId) || store.state.students[0];
  const p = passage();
  const tk = tokens();
  view.innerHTML = `${header('Read Aloud', { back: 'read:student' })}${stepper(3)}
  <section class="pad record">
    <div class="who"><span class="avatar" style="--c:${st.color}">${esc(st.name[0])}</span><b>${esc(st.name)}</b>, start reading at <span class="flag">▶ ${esc(tk[p.start]?.raw || '')}</span></div>
    <div class="reading-text">${tk.slice(p.start).map((t, i) => `<span class="${i === 0 ? 'start' : ''}">${esc(t.raw)}</span>`).join(' ')}</div>
    <div class="mic-zone">
      <div class="level"><div class="level-bar" id="lvl"></div></div>
      <button class="mic" id="mic" aria-label="Start recording"><span class="mic-ico">🎙️</span></button>
      <div class="timer" id="timer">Tap the mic, then read</div>
      <button class="btn link" data-act="file">Pick an audio file instead</button>
    </div>
  </section>`;
  const mic = view.querySelector('#mic'), timer = view.querySelector('#timer'), lvl = view.querySelector('#lvl');
  view.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (e.target.closest('#mic')) {
      if (rec) return stopAndGrade();
      rec = new Recorder({
        onLevel: (v) => lvl.style.width = Math.round(v * 100) + '%',
        onTick: (s) => timer.textContent = `Recording… ${Math.floor(s)}s / ${MAX_SECONDS}s`,
        onAutoStop: () => stopAndGrade()
      });
      try {
        await rec.start();
        mic.classList.add('on'); mic.setAttribute('aria-label', 'Stop recording');
        mic.innerHTML = '<span class="stop-ico"></span>';
      } catch (err) { rec = null; showError(err); }
    }
    if (act === 'file') {
      try { const a = await pickAudio(); if (a) await handleAudio(a, view); } catch (err) { showError(err); }
    }
  };
  async function stopAndGrade() {
    const r = rec; rec = null;
    if (!r) return;
    mic.classList.remove('on'); timer.textContent = 'Processing…';
    try { await handleAudio(await r.stop(), view); } catch (err) { showError(err); render(view); }
  }
}

async function handleAudio(audio, view) {
  S.audio = audio;
  const p = passage();
  const job = { type: 'read', studentId: S.studentId, text: p.text, start: p.start, audio: { base64: audio.base64, seconds: audio.seconds } };
  if (tier() === 'lite' && !store.state.settings.online) {
    enqueue(job);
    toast(`Saved ${store.student(S.studentId)?.name}'s reading. It will be graded when the network returns.`, 'warn');
    S.step = 'student'; render(view);
    return;
  }
  try {
    S.result = await withBusy('Listening to the reading…', { audio: audio.base64 }, () => gradeReading(job));
    S.answer = null; S.step = 'result'; render(view);
  } catch (err) { showError(err); render(view); }
}

// Shared by the live flow and the Lite offline queue.
async function gradeReading(job, { quiet = false } = {}) {
  const tk = tokenize(job.text).slice(job.start);
  const expectedText = tk.map(t => t.raw).join(' ');
  // Blind transcription: the page text is NOT sent to the model. (mock_hint only exists for demo data.)
  const heard = await ai('transcribe', { audio: job.audio.base64, ...(usingMock() ? { mock_hint: expectedText, mock_seconds: job.audio.seconds } : {}) });
  const a = align(tk, heard);
  const speed = wcpm(a.correct, job.audio.seconds);
  const st = store.student(job.studentId);
  let fb = { feedback: '', practice_words: [], question: '' };
  try {
    fb = await ai('feedback', {
      studentName: st?.name, passage: expectedText, correct: a.correct, attempted: a.attempted, wcpm: speed,
      errors: a.errors.slice(0, 12)
    });
  } catch (err) { if (!quiet) console.warn('feedback failed', err); }
  const reading = {
    id: 'r' + Date.now(), studentId: job.studentId, date: new Date().toISOString(), seconds: Math.round(job.audio.seconds * 10) / 10,
    wcpm: speed, accuracy: a.attempted ? a.correct / a.attempted : 0, attempted: a.attempted, correct: a.correct, errors: a.errors, late: !!quiet
  };
  store.update(s => s.readings.push(reading));
  return { ...a, heard, wcpm: speed, fb, reading, expectedText };
}

onQueue('read', (job) => gradeReading(job, { quiet: true }));

// ---------- 5. result ----------
function result(view) {
  const r = S.result;
  const st = store.student(S.studentId);
  const pct = Math.round((r.reading.accuracy || 0) * 100);
  view.innerHTML = `${header('Reading result', { back: 'read:student' })}${stepper(4)}
  <section class="pad">
    <div class="who"><span class="avatar" style="--c:${st.color}">${esc(st.name[0])}</span><b>${esc(st.name)}</b><span class="muted">· ${r.reading.seconds}s</span></div>
    <div class="stats">
      <div class="stat"><b>${r.wcpm}</b><span>words correct / min</span></div>
      <div class="stat"><b>${pct}%</b><span>accuracy</span></div>
      <div class="stat"><b>${r.correct}/${r.attempted}</b><span>words read</span></div>
    </div>
    <div class="words graded">${r.words.map(w => `<span class="w ${w.status}" ${w.said ? `title="said: ${esc(w.said)}"` : ''}>${esc(w.raw)}${w.said ? `<small>${esc(w.said)}</small>` : ''}</span>`).join(' ')}</div>
    <div class="legend"><span class="w correct">correct</span><span class="w misread">misread</span><span class="w missed">skipped</span><span class="w notreached">not reached</span></div>
    ${r.extras.length ? `<p class="small muted">Extra words heard: ${r.extras.map(x => `<span class="chip">${esc(x)}</span>`).join(' ')}</p>` : ''}
    <details class="heard"><summary>What Gemma heard</summary><p>${esc(r.heard || '(nothing)')}</p>${S.audio?.url ? `<audio controls src="${S.audio.url}"></audio>` : ''}</details>
    ${r.fb.feedback ? `<div class="card feedback">
      <div class="card-label">Feedback for ${esc(st.name)}</div>
      <p>${esc(r.fb.feedback)}</p>
      <button class="btn" data-act="say">🔊 Read it to ${esc(st.name)}</button>
    </div>` : ''}
    ${r.fb.practice_words?.length ? `<div class="card"><div class="card-label">Practice words (tap to hear)</div>
      <div class="chips">${r.fb.practice_words.map(w => `<button class="chip big" data-word="${esc(w)}">${esc(w)}</button>`).join('')}</div></div>` : ''}
    ${r.fb.question ? `<div class="card question">
      <div class="card-label">Did ${esc(st.name)} understand it?</div>
      <p class="q">${esc(r.fb.question)}</p>
      ${S.answer ? `<div class="verdict ${esc(S.answer.verdict)}"><b>${esc(S.answer.verdict)}</b> · “${esc(S.answer.heard)}”<br><span class="small">${esc(S.answer.note)}</span></div>` : ''}
      <div class="row">
        <button class="btn" data-act="ask">🔊 Ask</button>
        <button class="btn primary grow" data-act="answer" id="ansbtn">🎙️ Record answer</button>
      </div>
    </div>` : ''}
    <div class="row sticky-actions">
      <button class="btn big" data-nav="home">Done</button>
      <button class="btn big primary grow" data-act="next">Next student ›</button>
    </div>
  </section>`;
  let ansRec = null;
  view.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const word = e.target.closest('[data-word]')?.dataset.word;
    if (word) speak(word, 'en', { rate: 0.7 });
    if (act === 'say') speak(r.fb.feedback, 'en');
    if (act === 'ask') speak(r.fb.question, 'en');
    if (act === 'next') { S.step = 'student'; S.studentId = null; render(view); }
    if (act === 'answer') {
      const btn = view.querySelector('#ansbtn');
      if (!ansRec) {
        ansRec = new Recorder({ onAutoStop: () => btn.click() });
        try { await ansRec.start(); btn.textContent = '⏹ Stop'; btn.classList.add('rec'); } catch (err) { ansRec = null; showError(err); }
      } else {
        const rr = ansRec; ansRec = null;
        try {
          const audio = await rr.stop();
          S.answer = await withBusy('Checking the answer…', { audio: audio.base64 }, () =>
            ai('check_answer', { audio: audio.base64, passage: r.expectedText, question: r.fb.question }));
          render(view);
        } catch (err) { showError(err); render(view); }
      }
    }
  };
}

export function reset() { Object.assign(S, { step: 'page', studentId: null, result: null, audio: null, answer: null }); }
export const goStep = (step) => go('read', { step });
