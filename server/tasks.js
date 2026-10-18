// Prompts for every AI task the device performs.
// Rule of the project: Gemma does the reading, listening and language work.
// Scoring, word alignment, copy detection and storage are plain code (see public/js).

const LANG_NAMES = {
  en: 'English', bn: 'Bangla (Bengali)', hi: 'Hindi', ur: 'Urdu', ne: 'Nepali',
  sw: 'Swahili', ha: 'Hausa', yo: 'Yoruba', am: 'Amharic', ar: 'Arabic',
  fr: 'French', es: 'Spanish', pt: 'Portuguese', id: 'Indonesian', ta: 'Tamil'
};
export const langName = (code) => LANG_NAMES[code] || code || 'English';

const JSON_RULE = 'Reply with JSON only. No markdown, no code fences, no extra text.';

export const TASKS = {
  // Page photo -> text. Used by Read Aloud, Make a Test, Read to Me.
  ocr: (p) => ({
    system: 'You are a careful OCR engine for a classroom device.',
    text:
      'Transcribe all of the readable text in this image exactly as printed or written. ' +
      'Keep the original spelling, even if it is wrong. Keep paragraph breaks as blank lines. ' +
      'Ignore page numbers, headers and decorations. Output only the text.',
    images: [p.image],
    maxTokens: 700,
    json: false
  }),

  // Child's recording -> what they actually said.
  // IMPORTANT: the expected page text is deliberately NOT given to the model.
  // If the model knows what the child should have said, it "hears" the correct
  // reading and hides the child's mistakes. Comparison happens in code (align.js).
  transcribe: (p) => ({
    system: 'You are a verbatim speech transcriber for a children\'s reading assessment.',
    text:
      'Transcribe exactly the words spoken in this recording. Be strictly verbatim: ' +
      'keep repeated words, false starts, skipped words and mispronounced words as they sound. ' +
      'Do not correct grammar, do not complete sentences, do not guess missing words. ' +
      'If nothing is spoken, output an empty line. Output only the transcript.',
    audio: [p.audio],
    maxTokens: 400,
    json: false
  }),

  // Alignment result -> short, kind feedback for the child + practice words + a question.
  feedback: (p) => ({
    system: 'You are a warm, encouraging reading teacher for primary school children.',
    text:
      `A child (${p.studentName || 'the student'}) read this passage aloud:\n"""${p.passage}"""\n\n` +
      `Reading result computed by the device: ${p.correct} of ${p.attempted} words correct, ` +
      `${p.wcpm} words correct per minute.\n` +
      `Mistakes (expected -> what the child said): ${p.errors?.length ? p.errors.map(e => `${e.expected} -> ${e.said || '(skipped)'}`).join('; ') : 'none'}.\n\n` +
      'Write feedback for the child. ' + JSON_RULE + '\n' +
      'Schema: {"feedback": "one or two short, kind sentences a 7-year-old understands, praising effort and naming one thing to practice", ' +
      '"practice_words": ["up to 3 words from the passage worth practicing"], ' +
      '"question": "one simple comprehension question about the passage"}',
    maxTokens: 300,
    json: true
  }),

  // Spoken answer to the comprehension question -> judged.
  check_answer: (p) => ({
    system: 'You check children\'s spoken answers kindly and fairly.',
    text:
      `Passage:\n"""${p.passage}"""\nQuestion: ${p.question}\n\n` +
      'The recording is the child\'s spoken answer. Listen, then judge it against the passage. ' + JSON_RULE + '\n' +
      'Schema: {"heard": "what the child said", "verdict": "correct" | "partly" | "incorrect" | "unclear", ' +
      '"note": "one short sentence for the teacher"}',
    audio: [p.audio],
    maxTokens: 220,
    json: true
  }),

  // Photo of a handwritten answer sheet -> name, answer text, score, feedback.
  grade: (p) => ({
    system: 'You are a fair, careful exam grader for a primary school teacher. The teacher makes the final decision.',
    text:
      `Question: ${p.question}\nModel answer: ${p.modelAnswer}\nMaximum marks: ${p.maxMarks}\n` +
      (p.rubric ? `Marking notes from the teacher: ${p.rubric}\n` : '') +
      (p.math ? 'This is a maths answer: check each step of the working and find the first step that is wrong.\n' : '') +
      '\nThe image is a student\'s handwritten answer sheet. First read it exactly as written, keeping spelling mistakes. ' +
      'Then grade it against the model answer. Give credit for correct ideas even if the wording or spelling is weak. ' + JSON_RULE + '\n' +
      'Schema: {"student_name": "name written on the sheet or empty", "roll": "roll number on the sheet or empty", ' +
      '"answer_text": "the student\'s answer exactly as written", "score": number, ' +
      '"feedback": "one or two sentences for the student", ' +
      '"first_error": "the first wrong step or sentence, or empty if none"}',
    images: [p.image],
    maxTokens: 450,
    json: true
  }),

  // Two similar answers (found by code) -> explanation for the teacher.
  explain_copy: (p) => ({
    system: 'You help a teacher review possible copying. Never accuse; describe the evidence neutrally.',
    text:
      `Question: ${p.question}\nAnswer A (${p.a.name}): ${p.a.text}\nAnswer B (${p.b.name}): ${p.b.text}\n` +
      `The device found ${Math.round(p.similarity * 100)}% phrase overlap and these shared unusual words: ${p.shared.join(', ') || 'none'}.\n\n` +
      'Explain in two sentences what is suspicious or not suspicious about these two answers, ' +
      'paying attention to shared mistakes rather than shared correct facts. ' + JSON_RULE + '\n' +
      'Schema: {"explanation": "two neutral sentences", "level": "low" | "medium" | "high"}',
    maxTokens: 200,
    json: true
  }),

  // Page text -> a test.
  make_test: (p) => ({
    system: 'You write clear, age-appropriate test questions for primary school teachers.',
    text:
      `Source text:\n"""${p.passage}"""\n\nWrite ${p.mcq} multiple-choice questions and ${p.short} short-answer questions, ` +
      `difficulty: ${p.difficulty}. Use only facts from the source text. Each multiple-choice question has 4 options and exactly one correct option. ` +
      JSON_RULE + '\n' +
      'Schema: {"title": "short test title", "mcq": [{"q": "...", "options": ["...","...","...","..."], "answer": 0}], ' +
      '"short": [{"q": "...", "answer": "model answer"}]}',
    maxTokens: 1100,
    json: true
  }),

  // Class statistics (computed by code) -> what to reteach.
  class_insight: (p) => ({
    system: 'You are an experienced primary school teaching coach.',
    text:
      `Class reading and grading data computed by the device:\n${JSON.stringify(p.stats)}\n\n` +
      'Give the teacher a short, practical summary. ' + JSON_RULE + '\n' +
      'Schema: {"summary": "two sentences about how the class is doing", ' +
      '"reteach": ["up to 3 concrete things to reteach this week"], ' +
      '"attention": ["names of up to 3 students who need one-to-one help, with a reason"]}',
    maxTokens: 400,
    json: true
  }),

  // Per-student stats -> a short report a parent can listen to.
  parent_report: (p) => ({
    system: 'You write short, kind progress reports for parents who may not read well. They will be read aloud.',
    text:
      `Student: ${p.name}\nData: ${JSON.stringify(p.stats)}\n\n` +
      `Write a spoken progress report in ${langName(p.lang)}: three short sentences, simple words, ` +
      'one strength, one thing to practise at home, and one encouraging line. No numbers except words-per-minute if useful. ' +
      'Output only the report text.',
    maxTokens: 260,
    json: false
  }),

  // Page text -> simple explanation (Read to Me "Explain simply").
  explain: (p) => ({
    system: 'You explain school texts to young children in very simple language.',
    text:
      `Text:\n"""${p.passage}"""\n\nExplain what this text is about in ${langName(p.lang)}, in 3 short sentences a 7-year-old understands. Output only the explanation.`,
    maxTokens: 250,
    json: false
  }),

  // ---------------- PRO ONLY ----------------
  // Oral examiner: first question.
  oral_start: (p) => ({
    system: 'You are a patient oral examiner for a primary school child. You ask one short question at a time.',
    text:
      `Topic: ${p.topic}\n` + (p.source ? `Source material:\n"""${p.source}"""\n` : '') +
      'Ask the first question: an easy, open question that lets the child show what they know. ' + JSON_RULE + '\n' +
      'Schema: {"question": "one short spoken question"}',
    maxTokens: 120,
    json: true
  }),

  // Oral examiner: listen to the answer, judge it, choose the next question adaptively.
  oral_turn: (p) => ({
    system: 'You are a patient, adaptive oral examiner for a primary school child. You ask one short question at a time.',
    text:
      `Topic: ${p.topic}\n` + (p.source ? `Source material:\n"""${p.source}"""\n` : '') +
      `Conversation so far:\n${(p.history || []).map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.heard} [${h.assessment}]`).join('\n') || '(none)'}\n` +
      `Current question: ${p.question}\n` +
      `This is question ${p.turn} of at most ${p.maxTurns}.\n\n` +
      'The recording is the child\'s spoken answer to the current question. ' +
      'Transcribe it, judge it, then choose the next question: a follow-up if the answer was partly right, ' +
      'an easier question if the child is lost, a harder one if the child is confident. ' +
      `Set "done" to true if this was question ${p.maxTurns} or the child has clearly shown their level. ` + JSON_RULE + '\n' +
      'Schema: {"heard": "verbatim transcript of the answer", "assessment": "correct" | "partial" | "incorrect" | "unclear", ' +
      '"note": "what this answer shows, one short sentence", "next_question": "one short spoken question or empty", "done": false}',
    audio: [p.audio],
    maxTokens: 320,
    json: true
  }),

  // Oral examiner: final summary for the teacher.
  oral_summary: (p) => ({
    system: 'You summarise oral exams for teachers, fairly and concretely.',
    text:
      `Topic: ${p.topic}\nExam transcript:\n` +
      (p.history || []).map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.heard} [${h.assessment}: ${h.note}]`).join('\n') +
      '\n\n' + JSON_RULE + '\n' +
      'Schema: {"score": number from 0 to 10, "summary": "two sentences on what the child understands", ' +
      '"strengths": ["up to 3"], "gaps": ["up to 3"], "breakdown": "the moment where understanding broke down, or empty"}',
    maxTokens: 400,
    json: true
  }),

  // Home-language bridge: child asks in their home language, answer comes back in it.
  bridge: (p) => ({
    system: 'You help children who speak a different language at home understand their school lessons.',
    text:
      `Lesson text (in the language of instruction):\n"""${p.source}"""\n\n` +
      `The recording is a child asking a question in ${langName(p.lang)}. ` +
      `Answer the question in ${langName(p.lang)} using the lesson text, in 2 or 3 simple sentences. ` + JSON_RULE + '\n' +
      `Schema: {"heard": "the child's question as spoken", "heard_english": "the question in English", ` +
      `"answer": "the answer in ${langName(p.lang)}", "answer_english": "the same answer in English for the teacher"}`,
    audio: [p.audio],
    maxTokens: 450,
    json: true
  })
};

export const PRO_ONLY = new Set(['oral_start', 'oral_turn', 'oral_summary', 'bridge']);

// Pull a JSON object out of model output (handles code fences, thinking text, trailing junk).
export function parseJson(text) {
  if (typeof text !== 'string') throw new Error('Model returned no text');
  let t = stripThinking(text).replace(/```(?:json)?/gi, '').trim();
  const start = t.search(/[{[]/);
  if (start < 0) throw new Error('Model did not return JSON: ' + t.slice(0, 160));
  const open = t[start], close = open === '{' ? '}' : ']';
  // find the matching close bracket, respecting strings
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) { end = i; break; } }
  }
  let candidate = end > 0 ? t.slice(start, end + 1) : t.slice(start);
  try { return JSON.parse(candidate); } catch { /* try a light repair */ }
  candidate = candidate.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
  if (end < 0) candidate += open === '{' ? '"}' : ']';
  return JSON.parse(candidate);
}

export function stripThinking(text) {
  return String(text)
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/<\|?(?:start|end)_of_turn\|?>/g, '')
    .trim();
}
