# Classmate: offline classroom device (Gemma 4)

A shared classroom device that hears children read, sees their written work and grades both.
This repo is the **device simulator** (touch UI in a drawn device frame) plus the servers that run Gemma 4.

- `npm run demo`: everything works with built-in demo data, no model needed
- `npm start`: uses your real Gemma 4 model (`model.safetensors`)
- Project report with the feature list, device images and demo script: `/report.html`

```
public/            device UI (vanilla JS, no build step) + report.html + device images
server/            Node server, zero dependencies: prompts (tasks.js), backends, demo data
model_server/      Python server that loads Gemma 4 from model.safetensors
models/base/       ← Gemma 4 E2B goes here  (Classmate Base)
models/pro/        ← Gemma 4 E4B goes here  (Classmate Pro, optional)
tests/             scoring + copy-check tests (npm test)
tools/             draws the device illustrations
```

## 1. Quick start (no model)

Needs Node 18 or newer.

```bash
npm run demo
# open http://localhost:3000
```

## 2. Put your model in place

Move your `model.safetensors` into **`models/base/`**.

A `.safetensors` file holds only the weights. Next to it, the folder also needs the small config files from the same Hugging Face repo (`google/gemma-4-E2B-it`, "Files" tab):

```
models/base/
  model.safetensors              (or model-0000X-of-0000N.safetensors + model.safetensors.index.json)
  config.json
  tokenizer.json
  tokenizer_config.json          (if present)
  processor_config.json          (or preprocessor_config.json)
  chat_template.jinja / .json    (if present)
  generation_config.json         (if present)
  special_tokens_map.json        (if present)
```

If you also have **Gemma 4 E4B**, put it in **`models/pro/`** the same way. If `models/pro/` is empty, Pro runs on the E2B weights so the demo still works (the panel says so).

Check the folder before demo day; the server prints exactly what is missing:

```bash
python model_server/server.py
```

## 3. Run with the real model

```bash
# terminal 1: model server (Python 3.10+)
pip install -r model_server/requirements.txt      # torch, transformers, accelerate, pillow, numpy
python model_server/server.py --preload             # loads the model at startup (takes a while)

# terminal 2: device simulator
npm start
# open http://localhost:3000  -> the side panel should say "Gemma 4 E2B (local)"
```

- A GPU is used automatically (CUDA or Apple Silicon). On CPU, E2B works but each answer can take tens of seconds.
- If loading fails with an unknown architecture, upgrade: `pip install -U transformers`.
- Optional `.env` (copy `.env.example`): port, Gemini API key for Lite, or `LOCAL_BACKEND=openai` to use llama.cpp's `llama-server` with a GGUF instead of the Python server.

## 4. Demo checklist

1. Run with the real model the night before, and **also** check `npm run demo` works. In the side panel, "Use demo data (backup)" switches to demo data instantly if anything breaks on stage.
2. Open the page in Chrome on `http://localhost:3000`. Camera and microphone only work on `localhost` or https.
3. Allow camera and microphone when asked.
4. Click **Load demo class history** so the Class Report has three weeks of data.
5. Bring a printed paragraph and four handwritten answer sheets (two with the same spelling mistakes), or keep photos ready for "Pick a file".
6. Bring a wired headset with a mic; it makes recordings much cleaner in a noisy room.

The 3-minute demo script is in the report (`/report.html`, "How to demo it").

### Show it on a real phone

Run the simulator on your laptop, then on an Android phone connected by USB: Chrome on the laptop → `chrome://inspect` → Port forwarding → `3000 → localhost:3000`. Open `http://localhost:3000` on the phone; the drawn frame disappears and the phone *is* the device, with its real camera and mic.

## 5. How the AI is used

| Step | Done by |
|---|---|
| Page photo → text | Gemma (vision) |
| Child's voice → what they said (**without** seeing the page text) | Gemma (audio) |
| Word alignment, words correct per minute | Code (`public/js/align.js`) |
| Copying check across answer sheets | Code (`public/js/copycheck.js`) |
| Feedback, questions, grading, reports, oral exam, home language | Gemma (language) |

All prompts are in `server/tasks.js`. Recordings are converted in the browser to 16 kHz mono WAV and stop at 25 seconds (Gemma 4 takes about 30 seconds of audio per clip).

## Tests

```bash
npm test
```
