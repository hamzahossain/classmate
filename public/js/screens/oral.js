// ORAL EXAM (Pro only): an adaptive spoken exam. Gemma 4 E4B listens to each answer,
// judges it, and picks the next question: follow-up, easier or harder.
import { store } from '../store.js';
import { ai, tier } from '../api.js';
import { Recorder, pickAudio, speak, MAX_SECONDS } from '../media.js';
import { esc, header, withBusy, showError, toast, studentGrid, locked } from '../ui.js';

const S = { step: 'setup', studentId: null, topic: 'The water cycle', useSource: false, maxTurns: 4, question: '', history: [], summary: null };
let rec = null;

export function render(view) {
  if (tier() !== 'pro') {
    view.innerHTML = locked('Oral Exam', 'The examiner has to understand hesitant children\'s speech, judge half-right answers and choose the next question in real time. That chain needs the larger <b>Gemma 4 E4B</b> model in Pro; on E2B the first misheard answer derails the whole exam.');
    view.onclick = null;
    return;
  }
  ({ setup, exam, summary }[S.step] || setup)(view);
}

function setup(view) {
  const hasPage = !!store.state.passage?.text;
  view.innerHTML = `${header('Oral Exam', { right: '<span class="pro-tag">PRO</span>' })}
  <section class="pad">
    <label class="field-label" for="topic">Topic</label>
    <input id="topic" class="input" value="${esc(S.topic)}">
    ${hasPage ? `<label class="toggle"><input type="checkbox" id="src" ${S.useSource ? 'checked' : ''}><span></span>Ask about today's page</label>` : ''}
    <label class="field-label">Questions</label>
    <div class="seg" data-seg="turns">${[3, 4, 6].map(n => `<button class="${n === S.maxTurns ? 'on' : ''}" data-v="${n}">${n}</button>`).join('')}</div>
    <p class="lead">Who is taking the exam?</p>
    ${studentGrid(S.studentId)}
    <button class="btn big primary" data-act="begin" ${S.studentId ? '' : 'disabled'}>Begin exam</button>
  </section>`;
  view.onclick = async (e) => {
    const v = e.target.closest('[data-seg] [data-v]')?.dataset.v;
    const sid = e.target.closest('[data-student]')?.dataset.student;
    const keep = () => { S.topic = view.querySelector('#topic').value.trim() || S.topic; S.useSource = !!view.querySelector('#src')?.checked; };
    if (v) { keep(); S.maxTurns = Number(v); return render(view); }
    if (sid) { keep(); S.studentId = sid; return render(view); }
    if (e.target.closest('[data-act="begin"]')) {
      keep();
      const payload = { topic: S.topic, source: S.useSource ? store.state.passage.text : '' };
      try {
        const r = await withBusy('Preparing the first question…', payload, () => ai('oral_start', payload));
        S.question = r.question; S.history = []; S.summary = null; S.step = 'exam';
        render(view); speak(S.question, 'en');
      } catch (err) { showError(err); }
    }
  };
}

function exam(view) {
  const st = store.student(S.studentId);
  const turn = S.history.length + 1;
  view.innerHTML = `${header('Oral Exam', { back: 'oral:setup', right: `<span class="small">Q${turn} of ${S.maxTurns}</span>` })}
  <section class="pad chat">
    ${S.history.map((h, i) => `
      <div class="bubble device"><span class="bubble-who">Classmate</span>${esc(h.question)}</div>
      <div class="bubble child"><span class="bubble-who">${esc(st.name)}</span>${esc(h.heard || '(no answer)')}
        <span class="assess ${esc(h.assessment)}">${esc(h.assessment)}</span><span class="note">${esc(h.note)}</span></div>`).join('')}
    <div class="bubble device current"><span class="bubble-who">Classmate</span>${esc(S.question)} <button class="icon-btn small" data-act="repeat" aria-label="Repeat question">🔊</button></div>
  </section>
  <div class="mic-dock">
    <div class="level"><div class="level-bar" id="lvl"></div></div>
    <button class="mic" id="mic" aria-label="Record answer"><span class="mic-ico">🎙️</span></button>
    <div class="timer" id="timer">${esc(st.name)}, tap the mic and answer</div>
    <button class="btn link" data-act="file">Pick an audio file instead</button>
  </div>`;
  const chat = view.querySelector('.chat'); chat.scrollTop = chat.scrollHeight;
  const mic = view.querySelector('#mic'), timer = view.querySelector('#timer'), lvl = view.querySelector('#lvl');
  view.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'repeat') speak(S.question, 'en');
    if (act === 'file') { try { const a = await pickAudio(); if (a) await answer(a, view); } catch (err) { showError(err); } }
    if (e.target.closest('#mic')) {
      if (rec) return finish();
      rec = new Recorder({ onLevel: v => lvl.style.width = Math.round(v * 100) + '%', onTick: s => timer.textContent = `Listening… ${Math.floor(s)}s / ${MAX_SECONDS}s`, onAutoStop: () => finish() });
      try { await rec.start(); mic.classList.add('on'); mic.innerHTML = '<span class="stop-ico"></span>'; }
      catch (err) { rec = null; showError(err); }
    }
  };
  async function finish() {
    const r = rec; rec = null; if (!r) return;
    timer.textContent = 'Thinking…';
    try { await answer(await r.stop(), view); } catch (err) { showError(err); render(view); }
  }
}

async function answer(audio, view) {
  const turn = S.history.length + 1;
  const payload = { audio: audio.base64, topic: S.topic, source: S.useSource ? store.state.passage?.text : '', history: S.history, question: S.question, turn, maxTurns: S.maxTurns };
  const r = await withBusy('Listening and choosing the next question…', payload, () => ai('oral_turn', payload));
  S.history.push({ question: S.question, heard: r.heard || '', assessment: r.assessment || 'unclear', note: r.note || '' });
  if (r.done || turn >= S.maxTurns || !r.next_question) {
    const p2 = { topic: S.topic, history: S.history };
    S.summary = await withBusy('Writing the exam summary…', p2, () => ai('oral_summary', p2));
    store.update(s => s.orals.push({ id: 'o' + Date.now(), studentId: S.studentId, date: new Date().toISOString(), topic: S.topic, score: Number(S.summary.score) || 0, summary: S.summary.summary, history: S.history }));
    S.step = 'summary'; render(view);
    return;
  }
  S.question = r.next_question;
  render(view);
  speak(S.question, 'en');
}

function summary(view) {
  const st = store.student(S.studentId);
  const sm = S.summary;
  const score = Math.max(0, Math.min(10, Number(sm.score) || 0));
  view.innerHTML = `${header('Exam summary', { back: 'oral:setup' })}
  <section class="pad">
    <div class="who big"><span class="avatar xl" style="--c:${st.color}">${esc(st.name[0])}</span><div><b>${esc(st.name)}</b><br><span class="muted">${esc(S.topic)}</span></div>
      <div class="ring" style="--p:${score * 10}"><b>${score}</b><small>/10</small></div></div>
    <div class="card"><p>${esc(sm.summary)}</p></div>
    <div class="two-col">
      <div class="card good"><div class="card-label">Strengths</div><ul>${(sm.strengths || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="card warnish"><div class="card-label">Gaps</div><ul>${(sm.gaps || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </div>
    ${sm.breakdown ? `<div class="card"><div class="card-label">Where understanding broke down</div><p>${esc(sm.breakdown)}</p></div>` : ''}
    <details class="heard"><summary>Full exam transcript</summary>${S.history.map((h, i) => `<p><b>Q${i + 1}.</b> ${esc(h.question)}<br><i>${esc(h.heard)}</i> <span class="assess ${esc(h.assessment)}">${esc(h.assessment)}</span></p>`).join('')}</details>
    <div class="row sticky-actions"><button class="btn big" data-nav="home">Done</button><button class="btn big primary grow" data-act="again">Next student</button></div>
  </section>`;
  view.onclick = (e) => {
    if (e.target.closest('[data-act="again"]')) { S.step = 'setup'; S.studentId = null; render(view); toast('Saved to the Class Report.', 'ok'); }
  };
}

export function setStep(step) { S.step = step; }
