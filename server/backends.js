// Model backends. Every backend takes the same request and returns plain text:
//   { tier, system, text, images: [base64 jpeg], audio: [base64 wav 16 kHz mono], maxTokens }

const TIMEOUT_MS = 10 * 60 * 1000; // CPU inference can be slow; don't give up early

async function postJson(url, body, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const raw = await res.text();
    let data; try { data = JSON.parse(raw); } catch { data = { raw }; }
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}: ${data?.error?.message || data?.error || raw.slice(0, 300)}`);
    return data;
  } finally { clearTimeout(timer); }
}

// 1) Python server that loads model.safetensors with Hugging Face transformers.
export async function callPython(cfg, req) {
  const data = await postJson(cfg.PYTHON_MODEL_URL + '/generate', {
    model: req.tier === 'pro' ? 'pro' : 'base',
    system: req.system,
    text: req.text,
    images: req.images || [],
    audio: req.audio || [],
    max_new_tokens: req.maxTokens || 400
  });
  return data.text;
}

// 2) OpenAI-compatible server, e.g. llama.cpp `llama-server -hf ggml-org/gemma-4-E2B-it-GGUF`.
export async function callOpenAI(cfg, req) {
  const base = req.tier === 'pro' ? cfg.OPENAI_COMPAT_URL_PRO : cfg.OPENAI_COMPAT_URL_BASE;
  const content = [];
  for (const img of req.images || []) content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + img } });
  for (const a of req.audio || []) content.push({ type: 'input_audio', input_audio: { data: a, format: 'wav' } });
  content.push({ type: 'text', text: req.text });
  const messages = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push({ role: 'user', content });
  const data = await postJson(base.replace(/\/$/, '') + '/v1/chat/completions', {
    model: 'gemma', messages, temperature: 0, max_tokens: req.maxTokens || 400
  });
  return data.choices?.[0]?.message?.content ?? '';
}

// 3) Gemini API (Lite tier). Gemma models on the API don't take a separate system
//    instruction, so it is folded into the user text.
export async function callGemini(cfg, req) {
  const parts = [];
  for (const img of req.images || []) parts.push({ inline_data: { mime_type: 'image/jpeg', data: img } });
  for (const a of req.audio || []) parts.push({ inline_data: { mime_type: 'audio/wav', data: a } });
  parts.push({ text: (req.system ? req.system + '\n\n' : '') + req.text });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.LITE_MODEL)}:generateContent`;
  const data = await postJson(url, {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0, maxOutputTokens: Math.max(256, req.maxTokens || 400) }
  }, { 'x-goog-api-key': cfg.GEMINI_API_KEY });
  const out = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') ?? '';
  if (!out) throw new Error('Gemini API returned no text (' + (data.candidates?.[0]?.finishReason || 'no candidates') + ')');
  return out;
}

// Health checks so the UI can show which backend each tier really uses.
export async function pythonHealth(cfg) {
  try {
    const res = await fetch(cfg.PYTHON_MODEL_URL + '/health', { signal: AbortSignal.timeout(1500) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function openaiHealth(url) {
  try {
    const res = await fetch(url.replace(/\/$/, '') + '/health', { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch { return false; }
}
