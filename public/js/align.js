// Reading assessment scoring. Plain code, no AI: compares what the child said
// (blind transcript from Gemma) with the page text, word by word.

export function normalize(word) {
  return String(word)
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}']/gu, '')
    .replace(/^'+|'+$/g, '');
}

// Split text into display tokens; keep the original form for display.
export function tokenize(text) {
  return String(text || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(raw => ({ raw, norm: normalize(raw) }))
    .filter(t => t.norm);
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// Same word, allowing tiny transcription spelling noise on long words only
// (so "colour"/"color" match, but "though"/"thought" stays a misreading).
function same(a, b) {
  if (a === b) return true;
  return a.length >= 7 && b.length >= 7 && lev(a, b) === 1;
}

/**
 * Align expected words with heard words.
 * Semi-global: words after the point where the child stopped are "not reached", not "missed".
 * @returns {{ words: Array<{raw, status: 'correct'|'misread'|'missed'|'notreached', said?: string}>,
 *            extras: string[], attempted: number, correct: number, errors: Array<{expected, said, type}> }}
 */
export function align(expectedTokens, heardText) {
  const E = expectedTokens;
  const H = tokenize(heardText);
  const n = E.length, m = H.length;
  // D[i][j] = cost of aligning E[0..i) with H[0..j)
  const D = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  const B = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 diag, 2 up (missed), 3 left (extra)
  for (let i = 1; i <= n; i++) { D[i][0] = i; B[i][0] = 2; }
  for (let j = 1; j <= m; j++) { D[0][j] = j; B[0][j] = 3; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = D[i - 1][j - 1] + (same(E[i - 1].norm, H[j - 1].norm) ? 0 : 1);
      const up = D[i - 1][j] + 1;
      const left = D[i][j - 1] + 1;
      if (diag <= up && diag <= left) { D[i][j] = diag; B[i][j] = 1; }
      else if (up <= left) { D[i][j] = up; B[i][j] = 2; }
      else { D[i][j] = left; B[i][j] = 3; }
    }
  }
  // The child may stop early: pick the prefix of the page that best explains everything heard.
  let end = 0, best = Infinity;
  for (let i = 0; i <= n; i++) if (D[i][m] < best) { best = D[i][m]; end = i; }

  const words = E.map(t => ({ raw: t.raw, status: 'notreached' }));
  const extras = [];
  let i = end, j = m;
  while (i > 0 || j > 0) {
    const b = B[i][j];
    if (i > 0 && j > 0 && b === 1) {
      const ok = same(E[i - 1].norm, H[j - 1].norm);
      words[i - 1] = ok ? { raw: E[i - 1].raw, status: 'correct' } : { raw: E[i - 1].raw, status: 'misread', said: H[j - 1].raw };
      i--; j--;
    } else if (i > 0 && (b === 2 || j === 0)) {
      words[i - 1] = { raw: E[i - 1].raw, status: 'missed' };
      i--;
    } else {
      extras.unshift(H[j - 1].raw);
      j--;
    }
  }
  const attempted = end;
  const correct = words.filter(w => w.status === 'correct').length;
  const errors = words
    .filter(w => w.status === 'misread' || w.status === 'missed')
    .map(w => ({ expected: normalize(w.raw), said: w.said ? normalize(w.said) : '', type: w.status }));
  return { words, extras, attempted, correct, errors };
}

// Words correct per minute: the standard oral reading fluency measure.
export function wcpm(correct, seconds) {
  if (!seconds || seconds < 1) return 0;
  return Math.round(correct / (seconds / 60));
}
