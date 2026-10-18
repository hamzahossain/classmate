// Demo data: lets the whole device be shown with no model running.
// Used when DEMO=true, `npm run demo`, ?demo=1 in the URL, or when no model backend is reachable.

export const SAMPLE_PASSAGE =
  'Mina wanted to see the river after the rain. She walked past the tall mango tree and the old school gate. ' +
  'The water was brown and fast. A small boat was tied to a post, and a white bird stood on it.\n\n' +
  'Mina sat on a rock and counted the clouds. When the sun came out, the river began to shine like a mirror. ' +
  'She thought the river looked happy again.';

const SHEETS = [
  { student_name: 'Rafi', roll: '12', answer_text: 'Light is faster than sound so we see the flash first and hear the thunder later.', score: 9,
    feedback: 'Excellent! You explained that light travels faster than sound.', first_error: '' },
  { student_name: 'Mina', roll: '7', answer_text: 'Becaus the sound has to travle around the clouds and gets stuck so it is slow.', score: 3,
    feedback: 'Good try. Sound is not stuck in clouds; it simply travels much slower than light.', first_error: 'the sound has to travle around the clouds' },
  { student_name: 'Tanvir', roll: '21', answer_text: 'Becaus the sound has to travle around the clouds and get stuck so it come slow.', score: 3,
    feedback: 'Think about speed: light is much faster than sound.', first_error: 'the sound has to travle around the clouds' },
  { student_name: 'Ayesha', roll: '3', answer_text: 'Because light travels very fast and sound travels slower, so the sound comes after.', score: 8,
    feedback: 'Well done. Add that both start at the same time in the storm.', first_error: '' }
];

const ORAL_QUESTIONS = [
  'Can you tell me what happens to water when the sun heats it?',
  'Good. Where does the water vapour go after it rises?',
  'What do we call it when the vapour turns back into tiny drops in the clouds?',
  'Is evaporation the same as boiling? How are they different?',
  'Why does it rain more in some seasons?',
  'Last one: why is the water cycle important for farmers?'
];
const ORAL_ANSWERS = [
  ['The water goes up into the sky because it gets hot.', 'correct', 'Knows heated water rises as vapour.'],
  ['It goes up and makes clouds.', 'correct', 'Links vapour to cloud formation.'],
  ['Um... rain?', 'partial', 'Knows the outcome but not the word condensation.'],
  ['Yes it is the same, it bubbles.', 'incorrect', 'Confuses evaporation with boiling.'],
  ['Because of the monsoon wind brings clouds.', 'partial', 'Has a partial idea about seasonal winds.'],
  ['Because plants need water to grow.', 'correct', 'Connects rain to crops.']
];

const BRIDGE = {
  bn: { heard: 'নদীটা কেন চকচক করছিল?', answer: 'সূর্য বের হলে আলো পানিতে পড়ে, তাই নদী আয়নার মতো চকচক করছিল।' },
  hi: { heard: 'नदी क्यों चमक रही थी?', answer: 'जब सूरज निकला, तो उसकी रोशनी पानी पर पड़ी, इसलिए नदी शीशे की तरह चमकने लगी।' },
  ur: { heard: 'دریا کیوں چمک رہا تھا؟', answer: 'جب سورج نکلا تو اس کی روشنی پانی پر پڑی، اس لیے دریا آئینے کی طرح چمکنے لگا۔' },
  sw: { heard: 'Kwa nini mto ulikuwa ukung\'aa?', answer: 'Jua lilipotoka, mwanga wake uliangaza maji, kwa hiyo mto ulianza kung\'aa kama kioo.' },
  es: { heard: '¿Por qué brillaba el río?', answer: 'Cuando salió el sol, su luz cayó sobre el agua, y por eso el río brilló como un espejo.' },
  fr: { heard: 'Pourquoi la rivière brillait-elle ?', answer: 'Quand le soleil est sorti, sa lumière a touché l\'eau, alors la rivière a brillé comme un miroir.' }
};

function words(text) { return String(text || '').split(/\s+/).filter(Boolean); }
const strip = (w) => w.replace(/[^\p{L}\p{N}']/gu, '');

// Make a realistic imperfect reading of the expected text.
function fakeReading(expected, seconds) {
  let w = words(expected).map(strip).filter(Boolean);
  // a struggling young reader manages ~1.4 words per second
  if (seconds) w = w.slice(0, Math.max(8, Math.round(seconds * 1.4 / 0.85)));
  if (!w.length) return 'the the river';
  const out = [];
  const swaps = { thought: 'though', through: 'though', counted: 'county', mirror: 'mirr', walked: 'walk', tied: 'tide', brown: 'brow' };
  let skipped = false, swapped = false, repeated = false;
  const stopAt = Math.max(4, Math.round(w.length * 0.85));
  for (let i = 0; i < Math.min(w.length, stopAt); i++) {
    const word = w[i];
    if (!skipped && i > 3 && word.length <= 4 && i % 5 === 0) { skipped = true; continue; }
    const low = word.toLowerCase();
    if (!swapped && swaps[low]) { out.push(swaps[low]); swapped = true; continue; }
    out.push(word.toLowerCase());
    if (!repeated && i === 2) { out.push(word.toLowerCase()); repeated = true; }
  }
  if (!swapped && out.length > 6) out[6] = out[6].slice(0, Math.max(2, out[6].length - 2));
  return out.join(' ');
}

let sheetCounter = 0;

export function mock(task, p = {}) {
  switch (task) {
    case 'ocr':
      return p.mock_kind === 'science'
        ? 'Lightning and thunder happen at the same time in a storm. We see lightning first because light travels about a million times faster than sound. Count the seconds between the flash and the thunder to know how far away the storm is.'
        : SAMPLE_PASSAGE;
    case 'transcribe':
      return fakeReading(p.mock_hint || SAMPLE_PASSAGE, p.mock_seconds);
    case 'feedback': {
      const e = p.errors || [];
      const practice = e.map(x => x.expected).filter(Boolean).slice(0, 3);
      return {
        feedback: e.length
          ? `Great effort, ${p.studentName || 'friend'}! You read most words clearly. Let's practise ${practice.slice(0, 2).join(' and ') || 'a few words'} together.`
          : `Wonderful reading, ${p.studentName || 'friend'}! Every word was correct.`,
        practice_words: practice,
        question: 'What did Mina see standing on the boat?'
      };
    }
    case 'check_answer':
      return { heard: 'A white bird was on the boat.', verdict: 'correct', note: 'Recalled a specific detail from the passage.' };
    case 'grade': {
      const i = Number.isInteger(p.index) ? p.index : sheetCounter++;
      const s = { ...SHEETS[i % SHEETS.length] };
      s.score = Math.round((s.score / 10) * (p.maxMarks || 10));
      return s;
    }
    case 'explain_copy':
      return p.shared?.length
        ? { explanation: `Both answers share the same unusual misspellings (${p.shared.slice(0, 3).join(', ')}) and the same wrong idea, which is more telling than sharing a correct fact. Worth a quiet conversation with both students.`, level: 'high' }
        : { explanation: 'The answers overlap mostly on correct textbook facts, which many students would naturally share. Not suspicious on its own.', level: 'low' };
    case 'make_test':
      return {
        title: 'The River After the Rain',
        mcq: [
          { q: 'When did Mina want to see the river?', options: ['Before school', 'After the rain', 'At night', 'In winter'], answer: 1 },
          { q: 'What colour was the water?', options: ['Blue', 'Green', 'Brown', 'Clear'], answer: 2 },
          { q: 'What stood on the boat?', options: ['A cat', 'A white bird', 'A boy', 'A goat'], answer: 1 },
          { q: 'What did Mina count?', options: ['Boats', 'Birds', 'Clouds', 'Trees'], answer: 2 },
          { q: 'What did the river shine like?', options: ['A mirror', 'A star', 'A lamp', 'Gold'], answer: 0 }
        ].slice(0, p.mcq ?? 5),
        short: [
          { q: 'Name two things Mina walked past.', answer: 'The tall mango tree and the old school gate.' },
          { q: 'Why did the river begin to shine?', answer: 'Because the sun came out.' },
          { q: 'How do you think Mina felt at the end? Why?', answer: 'Happy, because the river looked happy again.' }
        ].slice(0, p.short ?? 2)
      };
    case 'class_insight': {
      const words = (p.stats?.tricky_words || []).slice(0, 3).map(w => w.word || w);
      const low = (p.stats?.students || []).filter(s => s.status === 'needs help').slice(0, 3);
      return {
        summary: 'Most of the class reads steadily and accuracy is improving week on week. A small group is still decoding word by word and needs short daily practice.',
        reteach: [
          words.length ? `Sound out the tricky words: ${words.join(', ')}` : 'Practise multi-syllable words',
          'Past tense endings (-ed) read as one smooth word',
          'Re-reading a sentence after a mistake instead of skipping'
        ],
        attention: low.length ? low.map(s => `${s.name}: reading speed below the class`) : ['No student is far behind this week.']
      };
    }
    case 'parent_report':
      return p.lang === 'bn'
        ? `${p.name} এখন আগের চেয়ে অনেক ভালো পড়তে পারে। বাড়িতে প্রতিদিন দশ মিনিট জোরে জোরে পড়া অনুশীলন করলে আরও উন্নতি হবে। ${p.name} খুব চেষ্টা করছে, তাকে উৎসাহ দিন।`
        : `${p.name} is reading more smoothly than last month. Ten minutes of reading aloud at home each day will help with longer words. ${p.name} is trying hard, so please keep encouraging them.`;
    case 'explain':
      return 'Mina goes to look at the river after it rains. The river is fast and brown, and she sees a boat and a bird. When the sun comes out, the river shines and looks happy.';
    case 'oral_start':
      return { question: ORAL_QUESTIONS[0] };
    case 'oral_turn': {
      const t = Math.max(1, p.turn || 1);
      const [heard, assessment, note] = ORAL_ANSWERS[(t - 1) % ORAL_ANSWERS.length];
      const done = t >= (p.maxTurns || 4);
      return { heard, assessment, note, next_question: done ? '' : ORAL_QUESTIONS[t % ORAL_QUESTIONS.length], done };
    }
    case 'oral_summary':
      return {
        score: 6,
        summary: 'The child understands that the sun heats water and that vapour forms clouds and rain. They do not yet know the term condensation and confuse evaporation with boiling.',
        strengths: ['Explains evaporation in their own words', 'Connects rain to farming'],
        gaps: ['Word "condensation"', 'Evaporation vs boiling'],
        breakdown: 'Question 4: said evaporation and boiling are the same because "it bubbles".'
      };
    case 'bridge': {
      const b = BRIDGE[p.lang] || { heard: 'Why was the river shining?', answer: 'When the sun came out, its light fell on the water, so the river shone like a mirror.' };
      return { ...b, heard_english: 'Why was the river shining?', answer_english: 'When the sun came out, its light fell on the water, so the river shone like a mirror.' };
    }
    default:
      throw new Error('Unknown task: ' + task);
  }
}
