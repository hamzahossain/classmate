// HOME LANGUAGE BRIDGE (Pro only): a child asks about today's lesson in the language they
// speak at home, and hears the answer in that language, grounded in the lesson page.
import { store } from '../store.js';
import { ai, tier } from '../api.js';
import { Recorder, pickAudio, speak, hasVoice, MAX_SECONDS } from '../media.js';
import { esc, header, withBusy, showError, toast, locked, captureButtons, capture } from '../ui.js';

const LANGS = [['bn', 'বাংলা Bangla'], ['hi', 'हिन्दी Hindi'], ['ur', 'اردو Urdu'], ['ne', 'नेपाली Nepali'], ['sw', 'Kiswahili'], ['ha', 'Hausa'], ['ar', 'العربية Arabic'], ['es', 'Español'], ['fr', 'Français']];
const S = { lang: null, answers: [] };
let rec = null;

export function render(view) {
  if (tier() !== 'pro') {
    view.innerHTML = locked('Home Language', 'Understanding a child\'s spoken question in one language and answering in another, from a lesson written in a third, is speech translation plus reasoning. Gemma 4 E4B in Pro handles this far more reliably than E2B.');
    view.onclick = null;
    return;
  }
  S.lang ||= store.state.settings.homeLang || 'bn';
  const p = store.state.passage;
  view.innerHTML = `${header('Home Language', { right: '<span class="pro-tag">PRO</span>' })}
  <section class="pad">
    <label class="field-label" for="hl">Child's home language</label>
    <select id="hl" class="select">${LANGS.map(([k, n]) => `<option value="${k}" ${k === S.lang ? 'selected' : ''}>${n}</option>`).join('')}</select>
    ${p?.text ? `<div class="card slim"><div class="card-label">Today's lesson</div><p class="preview">${esc(p.text.slice(0, 140))}…</p></div>`
      : `<p class="lead">First scan the lesson page.</p>${captureButtons('bridge')}`}
    ${S.answers.map(a => `
      <div class="bubble child"><span class="bubble-who">Child asked</span><span lang="${a.lang}">${esc(a.heard)}</span><span class="note">${esc(a.heard_english)}</span></div>
      <div class="bubble device"><span class="bubble-who">Classmate</span><span class="native" lang="${a.lang}">${esc(a.answer)}</span>
        <span class="note">${esc(a.answer_english)}</span>
        <button class="btn small" data-say="${S.answers.indexOf(a)}">🔊 Play</button></div>`).join('')}
  </section>
  ${p?.text ? `<div class="mic-dock">
    <div class="level"><div class="level-bar" id="lvl"></div></div>
    <button class="mic" id="mic" aria-label="Record question"><span class="mic-ico">🎙️</span></button>
    <div class="timer" id="timer">Tap the mic and ask a question</div>
    <button class="btn link" data-act="file">Pick an audio file instead</button>
  </div>` : ''}`;
  view.querySelector('#hl').onchange = (e) => { S.lang = e.target.value; store.update(s => s.settings.homeLang = S.lang); };
  const mic = view.querySelector('#mic'), timer = view.querySelector('#timer'), lvl = view.querySelector('#lvl');
  view.onclick = async (e) => {
    const say = e.target.closest('[data-say]')?.dataset.say;
    const cap = e.target.closest('[data-cap]')?.dataset.cap;
    if (say !== undefined) {
      const a = S.answers[Number(say)];
      if (!hasVoice(a.lang)) toast('This device has no offline voice for that language; showing text only may be best.', 'warn');
      speak(a.answer, a.lang);
    }
    if (cap) {
      try {
        const [img] = await capture(cap); if (!img) return;
        const text = await withBusy('Reading the page…', { image: img.base64 }, () => ai('ocr', { image: img.base64, mock_kind: 'story' }));
        store.update(s => s.passage = { text: String(text).trim(), start: 0 }); render(view);
      } catch (err) { showError(err); }
    }
    if (e.target.closest('[data-act="file"]')) { try { const a = await pickAudio(); if (a) await ask(a, view); } catch (err) { showError(err); } }
    if (e.target.closest('#mic')) {
      if (rec) { const r = rec; rec = null; timer.textContent = 'Thinking…'; try { await ask(await r.stop(), view); } catch (err) { showError(err); render(view); } return; }
      rec = new Recorder({ onLevel: v => lvl.style.width = Math.round(v * 100) + '%', onTick: s => timer.textContent = `Listening… ${Math.floor(s)}s / ${MAX_SECONDS}s`, onAutoStop: () => mic.click() });
      try { await rec.start(); mic.classList.add('on'); mic.innerHTML = '<span class="stop-ico"></span>'; } catch (err) { rec = null; showError(err); }
    }
  };
}

async function ask(audio, view) {
  const payload = { audio: audio.base64, lang: S.lang, source: store.state.passage.text };
  const r = await withBusy('Understanding the question…', payload, () => ai('bridge', payload));
  S.answers.push({ lang: S.lang, heard: r.heard || '', heard_english: r.heard_english || '', answer: r.answer || '', answer_english: r.answer_english || '' });
  render(view);
  const pad = view.querySelector('.pad'); pad.scrollTop = pad.scrollHeight;
  speak(r.answer || '', S.lang);
}
