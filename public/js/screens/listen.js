// READ TO ME: any page read aloud with word highlighting (offline OS voices),
// plus "Explain simply" in the child's language. Works with headphones on the audio jack.
import { store } from '../store.js';
import { ai } from '../api.js';
import { esc, header, captureButtons, capture, withBusy, showError, toast } from '../ui.js';
import { speak, hasVoice } from '../media.js';

const S = { rate: 0.85, explain: null, lang: 'en', playing: null };
const LANGS = [['en', 'English'], ['bn', 'বাংলা'], ['hi', 'हिन्दी'], ['ur', 'اردو'], ['sw', 'Kiswahili'], ['es', 'Español'], ['fr', 'Français']];

export function render(view) {
  const p = store.state.passage;
  view.innerHTML = `${header('Read to Me', { right: '<span class="jack" title="Headphones supported">🎧</span>' })}
  <section class="pad">
    ${p?.text ? `<div class="reading-text listen" id="ltext">${wordsHtml(p.text)}</div>
      <div class="player">
        <button class="btn big primary grow" data-act="play">▶ Read aloud</button>
        <button class="btn big" data-act="stop">■</button>
      </div>
      <div class="seg" data-seg="rate">${[['0.6', 'Slow'], ['0.85', 'Normal'], ['1', 'Fast']].map(([v, l]) => `<button class="${Number(v) === S.rate ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="card">
        <div class="card-label">Explain it simply</div>
        <div class="row"><select id="elang" class="select grow">${LANGS.map(([k, n]) => `<option value="${k}" ${k === S.lang ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <button class="btn primary" data-act="explain">Explain</button></div>
        ${S.explain ? `<p class="parent-text">${esc(S.explain.text)}</p><button class="btn" data-act="sayx">🔊 Listen</button>` : ''}
      </div>
      <div class="divider"><span>or a different page</span></div>`
    : '<p class="lead">Take a photo of any page and the device will read it aloud.</p>'}
    ${captureButtons('listen')}
  </section>`;
  view.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const cap = e.target.closest('[data-cap]')?.dataset.cap;
    const v = e.target.closest('[data-seg] [data-v]')?.dataset.v;
    if (v) { S.rate = Number(v); return render(view); }
    if (act === 'play') play(view);
    if (act === 'stop') { S.playing?.cancel(); clearHi(view); }
    if (act === 'explain') {
      S.lang = view.querySelector('#elang').value;
      const payload = { passage: p.text, lang: S.lang };
      try { S.explain = { text: String(await withBusy('Explaining…', payload, () => ai('explain', payload))).trim(), lang: S.lang }; render(view); }
      catch (err) { showError(err); }
    }
    if (act === 'sayx') {
      if (!hasVoice(S.explain.lang)) toast('No offline voice for this language on this device; it may read in a fallback voice.', 'warn');
      speak(S.explain.text, S.explain.lang, { rate: S.rate });
    }
    if (cap) {
      try {
        const [img] = await capture(cap);
        if (!img) return;
        const text = await withBusy('Reading the page…', { image: img.base64 }, () => ai('ocr', { image: img.base64, mock_kind: 'story' }));
        store.update(s => s.passage = { text: String(text).trim(), start: 0 });
        S.explain = null; render(view);
      } catch (err) { showError(err); }
    }
  };
}

function wordsHtml(text) {
  let pos = 0;
  return text.split(/(\s+)/).map(part => {
    const start = pos; pos += part.length;
    return /\s/.test(part) || !part ? esc(part) : `<span data-c="${start}">${esc(part)}</span>`;
  }).join('');
}

function clearHi(view) { view.querySelectorAll('#ltext .hi').forEach(x => x.classList.remove('hi')); }

function play(view) {
  const text = store.state.passage.text;
  const spans = [...view.querySelectorAll('#ltext [data-c]')];
  S.playing = speak(text, 'en', {
    rate: S.rate,
    onBoundary: (ci) => {
      clearHi(view);
      let cur = spans[0];
      for (const s of spans) { if (Number(s.dataset.c) <= ci) cur = s; else break; }
      cur?.classList.add('hi');
      cur?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    onEnd: () => clearHi(view)
  });
}
