// Copying detection across a class's answers to the same question. Plain code, no AI.
// Signal 1: shared word sequences (3-word phrases).
// Signal 2 (the strong one): shared UNUSUAL words, i.e. words that are not in the model
// answer and that almost nobody else used. Two students sharing the same correct fact
// is normal; two students sharing the same odd misspelling or wrong idea is not.
import { normalize } from './align.js';

const STOP = new Set(('a an the and or but so because is are was were be been it its this that these those to of in on at by for from with as ' +
  'we us our you your he she they them his her their i me my do does did not no yes can could will would should has have had ' +
  'there here then than when what why how which who also very more most much many some any into out up down over under about').split(' '));

const words = (t) => String(t || '').split(/\s+/).map(normalize).filter(Boolean);

function trigrams(ws) {
  const s = new Set();
  for (let i = 0; i + 2 < ws.length; i++) s.add(ws[i] + ' ' + ws[i + 1] + ' ' + ws[i + 2]);
  return s;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * @param {Array<{id, name, text}>} answers
 * @param {string} modelAnswer
 * @returns {Array<{a, b, similarity, shared: string[], score, flagged: boolean}>} sorted, most suspicious first
 */
export function findCopying(answers, modelAnswer = '') {
  const modelWords = new Set(words(modelAnswer));
  const toks = answers.map(a => words(a.text));
  // how many answers use each word
  const df = new Map();
  toks.forEach(ws => new Set(ws).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const rareLimit = Math.max(2, Math.floor(answers.length * 0.25));
  const grams = toks.map(trigrams);

  const pairs = [];
  for (let i = 0; i < answers.length; i++) {
    for (let j = i + 1; j < answers.length; j++) {
      const similarity = jaccard(grams[i], grams[j]);
      const setJ = new Set(toks[j]);
      const shared = [...new Set(toks[i])].filter(w =>
        setJ.has(w) && w.length >= 3 && !STOP.has(w) && !modelWords.has(w) && (df.get(w) || 0) <= rareLimit);
      const score = Math.min(1, similarity * 0.7 + Math.min(shared.length, 5) * 0.08);
      pairs.push({ a: answers[i], b: answers[j], similarity, shared, score, flagged: similarity >= 0.45 || shared.length >= 3 });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}
