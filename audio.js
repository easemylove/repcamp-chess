// Свой чиптюн: зимний луп + звуки. Всё кодом на WebAudio.
let ac, master, musicBus, sfxBus, noiseBuf;
export const S = { music: true, sfx: true, started: false };

export function initAudio() {
  if (ac) { ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain(); master.gain.value = .55; master.connect(ac.destination);
  musicBus = ac.createGain(); musicBus.gain.value = S.music ? .5 : 0; musicBus.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = S.sfx ? .8 : 0; sfxBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startMusic();
}
export function setMusic(on) { S.music = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? .5 : 0, ac.currentTime, .1); }
export function setSfx(on) { S.sfx = on; if (sfxBus) sfxBus.gain.setTargetAtTime(on ? .8 : 0, ac.currentTime, .05); }

const hz = n => 440 * Math.pow(2, (n - 69) / 12);
function tone(bus, type, n, t, dur, vol, slide = 0, attack = .005) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(hz(n), t);
  if (slide) o.frequency.exponentialRampToValueAtTime(hz(n + slide), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + .02);
}
function noise(bus, t, dur, vol, f = 6000, q = 1, type = 'bandpass') {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.random() * .5); s.stop(t + dur + .02);
}

// ---------- музыка ----------
// Тональность ре минор → фа мажор, 96 bpm. Аккорды по тактам, мелодия в 16-х (0 = пауза).
const BPM = 96, STEP = 60 / BPM / 4;
const CH = [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52], [50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];
const MEL_A = [
  [74, 0, 72, 0, 69, 0, 0, 72, 74, 0, 77, 0, 76, 0, 74, 0],
  [74, 0, 0, 0, 70, 0, 72, 0, 74, 0, 0, 0, 0, 0, 0, 0],
  [72, 0, 76, 0, 79, 0, 0, 76, 77, 0, 76, 0, 72, 0, 0, 0],
  [73, 0, 0, 0, 76, 0, 0, 0, 81, 0, 79, 0, 76, 0, 73, 0],
  [74, 0, 72, 0, 69, 0, 0, 72, 74, 0, 77, 0, 81, 0, 79, 0],
  [77, 0, 0, 0, 74, 0, 70, 0, 74, 0, 0, 77, 0, 0, 0, 0],
  [79, 0, 77, 0, 74, 0, 70, 0, 74, 0, 72, 0, 70, 0, 0, 0],
  [69, 0, 0, 0, 0, 0, 73, 0, 76, 0, 0, 0, 81, 0, 0, 0],
];
let musicT = 0, step = 0, timer;
function startMusic() {
  musicT = ac.currentTime + .1; step = 0;
  clearInterval(timer);
  timer = setInterval(schedule, 40);
}
function schedule() {
  while (musicT < ac.currentTime + .2) {
    const bar = Math.floor(step / 16) % 8, s = step % 16, ch = CH[bar];
    const loop = Math.floor(step / 128);
    // бас
    if (s % 4 === 0) tone(musicBus, 'triangle', ch[0] - 12 + (s === 8 ? 7 : 0), musicT, STEP * 3.5, .35);
    // арпеджио
    if (s % 2 === 0) tone(musicBus, 'square', ch[(s / 2) % 3] + 12, musicT, STEP * 1.6, .045);
    // мелодия (во втором проходе — на октаву выше и колокольчиком)
    const n = MEL_A[bar][s];
    if (n && loop % 2 === 0) tone(musicBus, 'square', n, musicT, STEP * 2.6, .07);
    if (n && loop % 2 === 1) { tone(musicBus, 'sine', n + 12, musicT, STEP * 6, .12); tone(musicBus, 'sine', n + 24, musicT, STEP * 3, .03); }
    // бубенцы и «хруст»
    if (s % 4 === 2) noise(musicBus, musicT, .05, .06, 9000, 2);
    if (s === 0 || s === 8) noise(musicBus, musicT, .12, .12, 180, 1, 'lowpass');
    if (s % 8 === 4) noise(musicBus, musicT, .09, .1, 2500, 1.2);
    musicT += STEP; step++;
  }
}

// ---------- звуки ----------
export function sfx(name, k = 1) {
  if (!ac || !S.sfx) return;
  const t = ac.currentTime;
  switch (name) {
    case 'step': noise(sfxBus, t, .07, .18 * k, 1800 + Math.random() * 800, 1.5); break;
    case 'blip': tone(sfxBus, 'square', 84, t, .06, .1); break;
    case 'select': tone(sfxBus, 'square', 79, t, .05, .1); tone(sfxBus, 'square', 86, t + .05, .07, .1); break;
    case 'deny': tone(sfxBus, 'square', 50, t, .12, .12, -3); break;
    case 'move': noise(sfxBus, t, .1, .25, 900, 1); tone(sfxBus, 'triangle', 55, t, .1, .2, -5); break;
    case 'whoosh': noise(sfxBus, t, .35, .3, 1200, .7); break;
    case 'snowball': noise(sfxBus, t, .25, .5, 600, .8, 'lowpass'); tone(sfxBus, 'triangle', 60, t, .12, .2, -12); break;
    case 'bonk': tone(sfxBus, 'square', 64, t, .12, .2, -12); noise(sfxBus, t, .08, .3, 3000, 1); break;
    case 'bricks': for (let i = 0; i < 9; i++) { const d = t + i * .045 + Math.random() * .03; tone(sfxBus, 'square', 80 + Math.random() * 14, d, .04, .07); noise(sfxBus, d, .03, .12, 4000, 3); } break;
    case 'ring': for (let i = 0; i < 6; i++) tone(sfxBus, 'square', i % 2 ? 93 : 88, t + i * .07, .07, .08); break;
    case 'mega': tone(sfxBus, 'sawtooth', 62, t, .5, .12, 5); tone(sfxBus, 'sawtooth', 69, t, .5, .08, 5); break;
    case 'stomp': noise(sfxBus, t, .3, .7, 160, 1, 'lowpass'); tone(sfxBus, 'sine', 40, t, .3, .5, -10); break;
    case 'splash': noise(sfxBus, t, .4, .35, 2200, .6); break;
    case 'neigh': tone(sfxBus, 'sawtooth', 76, t, .45, .09, -9); tone(sfxBus, 'square', 79, t + .05, .3, .05, -6); break;
    case 'pillow': noise(sfxBus, t, .2, .4, 500, .7, 'lowpass'); break;
    case 'check': tone(sfxBus, 'square', 76, t, .1, .14); tone(sfxBus, 'square', 72, t + .12, .18, .14); break;
    case 'win': [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => tone(sfxBus, 'square', n, t + i * .11, .2, .11)); break;
    case 'lose': [72, 67, 64, 60].forEach((n, i) => tone(sfxBus, 'triangle', n, t + i * .2, .3, .2)); break;
    case 'pop': tone(sfxBus, 'square', 72, t, .08, .12, 12); break;
    case 'talk': tone(sfxBus, 'square', 70 + Math.random() * 10, t, .045, .045); break;
    case 'promo': [79, 83, 86, 91].forEach((n, i) => tone(sfxBus, 'sine', n, t + i * .07, .25, .12)); break;
  }
}
