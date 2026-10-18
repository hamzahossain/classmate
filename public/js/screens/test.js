// MAKE A TEST: textbook page -> multiple-choice and short-answer questions.
import { store } from '../store.js';
import { ai } from '../api.js';
import { esc, header, captureButtons, capture, withBusy, showError, toast } from '../ui.js';

const S = { test: null, showAnswers: false, opts: { mcq: 5, short: 2, difficulty: 'mixed' } };

export function render(view) {
  return S.test ? showTest(view) : setup(view);
}

function seg(name, values, current) {
  return `<div class="seg" data-seg="${name}">${values.map(v => `<button class="${String(v) === String(current) ? 'on' : ''}" data-v="${v}">${v}</button>`).join('')}</div>`;
}

function setup(view) {
  const p = store.state.passage;
  const o = S.opts;
  view.innerHTML = `${header('Make a Test')}
  <section class="pad">
    <div class="card">
      <div class="card-label">Source page</div>
      ${p?.text ? `<p class="preview">${esc(p.text.slice(0, 160))}…</p>` : '<p class="muted">No page yet. Scan one below.</p>'}
    </div>
    ${captureButtons('test')}
    <label class="field-label">Multiple choice</label>${seg('mcq', [3, 5, 8], o.mcq)}
    <label class="field-label">Short answer</label>${seg('short', [0, 2, 3], o.short)}
    <label class="field-label">Difficulty</label>${seg('difficulty', ['easy', 'mixed', 'hard'], o.difficulty)}
    <button class="btn big primary" data-act="make" ${p?.text ? '' : 'disabled'}>Make the test</button>
  </section>`;
  view.onclick = async (e) => {
    const segEl = e.target.closest('[data-seg]'), v = e.target.closest('[data-v]')?.dataset.v;
    if (segEl && v) { const k = segEl.dataset.seg; S.opts[k] = k === 'difficulty' ? v : Number(v); return render(view); }
    const cap = e.target.closest('[data-cap]')?.dataset.cap;
    if (cap) {
      try {
        const [img] = await capture(cap);
        if (!img) return;
        const text = await withBusy('Reading the page…', { image: img.base64 }, () => ai('ocr', { image: img.base64, mock_kind: 'story' }));
        store.update(s => s.passage = { text: text.trim(), start: 0 });
        render(view);
      } catch (err) { showError(err); }
    }
    if (e.target.closest('[data-act="make"]')) {
      const payload = { passage: store.state.passage.text, ...S.opts };
      try {
        S.test = await withBusy('Writing questions…', payload, () => ai('make_test', payload));
        if (!S.test?.mcq) throw new Error('The model did not return a test. Try again.');
        S.showAnswers = false; render(view);
      } catch (err) { showError(err); }
    }
  };
}

function testHtml(t, answers) {
  return `<h2>${esc(t.title || 'Class test')}</h2>
  <ol class="test-list">${(t.mcq || []).map(q => `<li><p>${esc(q.q)}</p><ol type="A" class="opts">${(q.options || []).map((o, i) => `<li class="${answers && i === q.answer ? 'right' : ''}">${esc(o)}</li>`).join('')}</ol></li>`).join('')}
  ${(t.short || []).map(q => `<li><p>${esc(q.q)}</p>${answers ? `<p class="model">${esc(q.answer)}</p>` : '<div class="lines"></div>'}</li>`).join('')}</ol>`;
}

function showTest(view) {
  view.innerHTML = `${header('Your test', { right: '<button class="icon-btn" data-act="new" aria-label="New test">↺</button>' })}
  <section class="pad test-paper">
    ${testHtml(S.test, S.showAnswers)}
    <div class="row sticky-actions">
      <button class="btn" data-act="answers">${S.showAnswers ? 'Hide' : 'Show'} answers</button>
      <button class="btn big primary grow" data-act="print">🖨️ Print</button>
    </div>
  </section>`;
  view.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'answers') { S.showAnswers = !S.showAnswers; render(view); }
    if (act === 'new') { S.test = null; render(view); }
    if (act === 'print') {
      const w = window.open('', '_blank');
      if (!w) return toast('Allow pop-ups to print.', 'warn');
      w.document.write(`<!doctype html><title>${esc(S.test.title)}</title><style>body{font:16px/1.5 Georgia,serif;max-width:720px;margin:32px auto;padding:0 16px}li{margin:10px 0}.lines{height:56px;border-bottom:1px solid #999}.right{font-weight:bold}.model{color:#555;font-style:italic}</style>
        <p>Name: ____________________ &nbsp; Roll: ______</p>${testHtml(S.test, false)}<script>print()<\/script>`);
      w.document.close();
    }
  };
}
