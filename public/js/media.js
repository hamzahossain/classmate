// Camera, file picker, microphone recording (to 16 kHz mono WAV) and offline text-to-speech.

const MAX_SIDE = 1280; // enough for OCR, small enough to keep requests light

// ---------- images ----------
function canvasToResult(canvas) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const base64 = dataUrl.split(',')[1];
  return { dataUrl, base64, bytes: Math.round(base64.length * 0.75) };
}

function drawScaled(src, w, h) {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(canvasToResult(drawScaled(img, img.naturalWidth, img.naturalHeight))); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image this device can read.')); };
    img.src = url;
  });
}

// Opens the OS file picker. Returns an array of image results (possibly empty).
export function pickImages({ multiple = false } = {}) {
  return pickFiles({ accept: 'image/*', multiple }).then(files => Promise.all(files.map(fileToImage)));
}

export function pickFiles({ accept, multiple = false }) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); }, { once: true });
    // if the user cancels, 'change' never fires; clean up on focus return
    window.addEventListener('focus', () => setTimeout(() => { if (!input.files?.length) { resolve([]); input.remove(); } }, 800), { once: true });
    input.click();
  });
}

// Live camera inside the device screen. Resolves with an image result, or null if cancelled.
export function openCamera(host) {
  return new Promise(async (resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'camera';
    wrap.innerHTML = `
      <video playsinline autoplay muted></video>
      <div class="camera-guide">Fit the page inside the frame</div>
      <div class="camera-bar">
        <button class="btn ghost light" data-act="cancel">Cancel</button>
        <button class="shutter" data-act="snap" aria-label="Take photo"></button>
        <button class="btn ghost light" data-act="flip">Flip</button>
      </div>`;
    host.appendChild(wrap);
    const video = wrap.querySelector('video');
    let stream = null, facing = 'environment';
    const stop = () => stream?.getTracks().forEach(t => t.stop());
    const start = async () => {
      stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 } }, audio: false });
        video.srcObject = stream;
      } catch (e) {
        wrap.querySelector('.camera-guide').textContent = cameraError(e);
      }
    };
    const finish = (val) => { stop(); wrap.remove(); resolve(val); };
    wrap.addEventListener('click', (ev) => {
      const act = ev.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') finish(null);
      if (act === 'flip') { facing = facing === 'environment' ? 'user' : 'environment'; start(); }
      if (act === 'snap' && video.videoWidth) finish(canvasToResult(drawScaled(video, video.videoWidth, video.videoHeight)));
    });
    if (!navigator.mediaDevices?.getUserMedia) {
      wrap.querySelector('.camera-guide').textContent = 'Camera needs https or localhost. Use "Pick a file" instead.';
      return;
    }
    start();
  });
}

function cameraError(e) {
  if (!window.isSecureContext) return 'Camera needs https or localhost. Use "Pick a file" instead.';
  if (e?.name === 'NotAllowedError') return 'Camera permission was denied. Allow it in the browser, or use "Pick a file".';
  if (e?.name === 'NotFoundError') return 'No camera found. Use "Pick a file" instead.';
  return 'Could not open the camera: ' + (e?.message || e);
}

// ---------- audio ----------
export const MAX_SECONDS = 25; // Gemma 4 small models take up to ~30 s of audio per clip

let sharedCtx = null;
const audioCtx = () => (sharedCtx ||= new (window.AudioContext || window.webkitAudioContext)());

export class Recorder {
  constructor({ onLevel, onTick, onAutoStop } = {}) { Object.assign(this, { onLevel, onTick, onAutoStop }); }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone needs https or localhost. Use "Pick audio file" instead.');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (e) {
      throw new Error(e?.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in the browser.' : 'Could not open the microphone: ' + (e?.message || e));
    }
    const ctx = audioCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    const src = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    src.connect(this.analyser);
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
    this.t0 = performance.now();
    const buf = new Uint8Array(this.analyser.fftSize);
    const loop = () => {
      if (!this.rec || this.rec.state !== 'recording') return;
      this.analyser.getByteTimeDomainData(buf);
      let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      const secs = (performance.now() - this.t0) / 1000;
      this.onLevel?.(Math.min(1, peak / 64));
      this.onTick?.(secs);
      if (secs >= MAX_SECONDS) { this.onAutoStop?.(); return; }
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.rec) return reject(new Error('Not recording'));
      cancelAnimationFrame(this.raf);
      const seconds = (performance.now() - this.t0) / 1000;
      this.rec.onstop = async () => {
        this.stream.getTracks().forEach(t => t.stop());
        try {
          const blob = new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' });
          const wav = await blobToWav(blob);
          resolve({ ...wav, seconds: wav.seconds || seconds });
        } catch (e) { reject(e); }
        this.rec = null;
      };
      this.rec.stop();
    });
  }

  cancel() { try { cancelAnimationFrame(this.raf); this.rec?.stop(); this.stream?.getTracks().forEach(t => t.stop()); } catch { } this.rec = null; }
}

// Any recording or audio file -> 16 kHz mono 16-bit WAV (what the model servers expect).
export async function blobToWav(blob) {
  const arr = await blob.arrayBuffer();
  const decoded = await audioCtx().decodeAudioData(arr.slice(0));
  const seconds = Math.min(decoded.duration, MAX_SECONDS + 2);
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(seconds * rate)), rate);
  const src = off.createBufferSource();
  src.buffer = decoded; src.connect(off.destination); src.start();
  const rendered = await off.startRendering();
  const pcm = rendered.getChannelData(0);
  const wavBuf = encodeWav(pcm, rate);
  const wavBlob = new Blob([wavBuf], { type: 'audio/wav' });
  return { base64: arrayBufferToBase64(wavBuf), url: URL.createObjectURL(wavBlob), bytes: wavBuf.byteLength, seconds: decoded.duration };
}

export async function pickAudio() {
  const [file] = await pickFiles({ accept: 'audio/*,.wav,.mp3,.m4a,.ogg,.webm' });
  if (!file) return null;
  return blobToWav(file);
}

function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------- text to speech (offline voices built into the OS) ----------
const BCP47 = { en: 'en-US', bn: 'bn-BD', hi: 'hi-IN', ur: 'ur-PK', ne: 'ne-NP', sw: 'sw-KE', ha: 'ha-NG', yo: 'yo-NG', am: 'am-ET', ar: 'ar-SA', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR', id: 'id-ID', ta: 'ta-IN' };

export function hasVoice(lang) {
  const code = BCP47[lang] || lang;
  return (speechSynthesis?.getVoices?.() || []).some(v => v.lang?.toLowerCase().startsWith(code.slice(0, 2).toLowerCase()));
}

export function speak(text, lang = 'en', { rate = 0.9, onBoundary, onEnd } = {}) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return { cancel() { } }; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const code = BCP47[lang] || lang;
  u.lang = code; u.rate = rate;
  const voice = speechSynthesis.getVoices().find(v => v.lang?.toLowerCase() === code.toLowerCase())
    || speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith(code.slice(0, 2).toLowerCase()));
  if (voice) u.voice = voice;
  if (onBoundary) u.onboundary = (e) => onBoundary(e.charIndex);
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
  return { cancel() { speechSynthesis.cancel(); } };
}
