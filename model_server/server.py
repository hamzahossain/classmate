"""
Classmate local model server.

Loads Gemma 4 from a Hugging Face model folder (the folder that holds model.safetensors)
and serves one endpoint the Node simulator calls:

    POST /generate  {model: "base"|"pro", system, text, images: [b64 jpeg], audio: [b64 wav], max_new_tokens}
    GET  /health

Folders (override with BASE_MODEL_DIR / PRO_MODEL_DIR):
    models/base/   -> Gemma 4 E2B   (Classmate Base)
    models/pro/    -> Gemma 4 E4B   (Classmate Pro)   [optional: falls back to base]

Run:
    pip install -r model_server/requirements.txt
    python model_server/server.py            # loads a model on the first request
    python model_server/server.py --preload  # loads base (and pro) at startup
"""
import base64
import io
import json
import os
import re
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = {
    "base": os.environ.get("BASE_MODEL_DIR", os.path.join(ROOT, "models", "base")),
    "pro": os.environ.get("PRO_MODEL_DIR", os.path.join(ROOT, "models", "pro")),
}
LABELS = {"base": "Gemma 4 E2B (local)", "pro": "Gemma 4 E4B (local)"}
PORT = int(os.environ.get("MODEL_PORT", "8008"))

_cache = {}           # model dir -> (processor, model)
_load_lock = threading.Lock()
_gen_lock = threading.Lock()   # one generation at a time: it's a single device


def inspect_dir(d):
    """Report which of the files transformers needs are present in a model folder."""
    if not os.path.isdir(d):
        return {"ok": False, "dir": d, "missing": ["folder does not exist"]}
    files = set(os.listdir(d))
    missing = []
    if not any(f.endswith(".safetensors") for f in files):
        missing.append("model.safetensors (the weights)")
    if "config.json" not in files:
        missing.append("config.json")
    if not ({"tokenizer.json", "tokenizer.model"} & files):
        missing.append("tokenizer.json")
    if not ({"processor_config.json", "preprocessor_config.json"} & files):
        missing.append("processor_config.json or preprocessor_config.json")
    return {"ok": not missing, "dir": d, "missing": missing}


def resolve(tier):
    """Pro falls back to the base folder when no E4B weights are present."""
    info = inspect_dir(DIRS[tier])
    if tier == "pro" and not info["ok"]:
        base = inspect_dir(DIRS["base"])
        if base["ok"]:
            return DIRS["base"], "Gemma 4 E2B weights (no E4B in models/pro)"
    return DIRS[tier], LABELS[tier]


def pick_device():
    import torch
    if torch.cuda.is_available():
        return "cuda", torch.bfloat16
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps", torch.bfloat16
    return "cpu", torch.bfloat16 if os.environ.get("CPU_FLOAT32") != "1" else torch.float32


def load(tier):
    d, _ = resolve(tier)
    with _load_lock:
        if d in _cache:
            return _cache[d]
        info = inspect_dir(d)
        if not info["ok"]:
            raise RuntimeError(f"Model folder {d} is incomplete. Missing: {', '.join(info['missing'])}. See README.")
        import torch
        import transformers
        from transformers import AutoProcessor

        device, dtype = pick_device()
        print(f"[model] loading {d} on {device} ({dtype}) ...", flush=True)
        t0 = time.time()
        processor = AutoProcessor.from_pretrained(d)
        model, errors = None, []
        # Class names differ between transformers versions; try the multimodal ones first.
        for name in ("AutoModelForMultimodalLM", "AutoModelForImageTextToText", "AutoModelForCausalLM"):
            cls = getattr(transformers, name, None)
            if cls is None:
                continue
            for dtype_kw in ("dtype", "torch_dtype"):
                try:
                    kwargs = {dtype_kw: dtype}
                    if device == "cuda":
                        kwargs["device_map"] = "auto"
                    model = cls.from_pretrained(d, **kwargs)
                    break
                except Exception as e:  # noqa: BLE001
                    errors.append(f"{name}/{dtype_kw}: {e}")
            if model is not None:
                break
        if model is None:
            raise RuntimeError("Could not load the model. Upgrade transformers (pip install -U transformers). " + " | ".join(errors[-2:]))
        if device != "cuda":
            model = model.to(device)
        model.eval()
        print(f"[model] ready in {time.time() - t0:.1f}s", flush=True)
        _cache[d] = (processor, model)
        return _cache[d]


def wav_to_array(b64):
    """16-bit PCM WAV (any rate, any channels) -> float32 mono at 16 kHz."""
    raw = base64.b64decode(b64)
    with wave.open(io.BytesIO(raw)) as w:
        sr, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        frames = w.readframes(w.getnframes())
    if width != 2:
        raise ValueError("Audio must be 16-bit PCM WAV")
    x = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    if sr != 16000 and len(x):
        n = int(len(x) * 16000 / sr)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)
    return x


def generate(req):
    import torch
    from PIL import Image

    tier = "pro" if req.get("model") == "pro" else "base"
    processor, model = load(tier)

    content = []
    for img in req.get("images") or []:
        content.append({"type": "image", "image": Image.open(io.BytesIO(base64.b64decode(img))).convert("RGB")})
    for a in req.get("audio") or []:
        content.append({"type": "audio", "audio": wav_to_array(a)})
    content.append({"type": "text", "text": req.get("text", "")})
    messages = []
    if req.get("system"):
        messages.append({"role": "system", "content": [{"type": "text", "text": req["system"]}]})
    messages.append({"role": "user", "content": content})

    inputs = processor.apply_chat_template(
        messages, add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt"
    )
    inputs = inputs.to(model.device)
    for k, v in list(inputs.items()):
        if hasattr(v, "dtype") and torch.is_floating_point(v):
            inputs[k] = v.to(model.dtype)
    n_in = inputs["input_ids"].shape[-1]

    with _gen_lock, torch.inference_mode():
        out = model.generate(**inputs, max_new_tokens=int(req.get("max_new_tokens", 400)), do_sample=False)
    text = processor.decode(out[0][n_in:], skip_special_tokens=True)
    text = re.sub(r"<think(?:ing)?>[\s\S]*?</think(?:ing)?>", "", text).strip()
    return text


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # quieter logs
        sys.stderr.write("[http] " + fmt % args + "\n")

    def do_GET(self):
        if self.path.startswith("/health"):
            models = {}
            for tier in ("base", "pro"):
                d, label = resolve(tier)
                info = inspect_dir(d)
                models[tier] = {"ok": info["ok"], "dir": d, "label": label, "missing": info["missing"], "loaded": d in _cache}
            return self._send(200, {"ok": True, "models": models})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/generate"):
            return self._send(404, {"error": "not found"})
        try:
            length = int(self.headers.get("content-length", 0))
            req = json.loads(self.rfile.read(length) or b"{}")
            t0 = time.time()
            text = generate(req)
            print(f"[gen] {req.get('model')} {time.time() - t0:.1f}s -> {text[:80]!r}", flush=True)
            self._send(200, {"text": text, "seconds": round(time.time() - t0, 2)})
        except Exception as e:  # noqa: BLE001
            print(f"[error] {e}", flush=True)
            self._send(500, {"error": str(e)})


def main():
    for tier in ("base", "pro"):
        d, label = resolve(tier)
        info = inspect_dir(d)
        status = "ready" if info["ok"] else "missing: " + ", ".join(info["missing"])
        print(f"  {tier:4s} -> {d}  [{label}]  {status}")
    if "--preload" in sys.argv:
        load("base")
        if resolve("pro")[0] != resolve("base")[0]:
            load("pro")
    print(f"\n  Model server on http://127.0.0.1:{PORT}\n", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
