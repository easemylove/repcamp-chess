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
// Три трека: menu (84 bpm, 16 тактов), game (96 bpm, 18 тактов), night (108 bpm, 16 тактов).
// Каждый — набор тактов [аккорд, мелодия в 16-х (0 = пауза)] и функция play, которую зовёт планировщик.
const mk = (chords, mels) => chords.map((c, i) => ({ c, m: mels[i] }));

// ---- game: часть A (прежний материал, ре минор → фа мажор) ----
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
// часть B: соль минор → ми-бемоль → си-бемоль → фа, в конце доминанта (ля)
const CH_B = [[55, 58, 62], [51, 55, 58], [46, 50, 53], [53, 57, 60], [55, 58, 62], [51, 55, 58], [48, 52, 55], [45, 49, 52]];
const MEL_B = [
  [70, 0, 0, 67, 0, 0, 70, 0, 74, 0, 0, 0, 72, 0, 70, 0],
  [67, 0, 0, 0, 70, 0, 0, 0, 75, 0, 74, 0, 70, 0, 0, 0],
  [74, 0, 0, 72, 0, 0, 70, 0, 77, 0, 0, 0, 74, 0, 0, 0],
  [72, 0, 0, 0, 69, 0, 72, 0, 77, 0, 76, 0, 72, 0, 0, 0],
  [70, 0, 74, 0, 77, 0, 0, 74, 70, 0, 0, 0, 67, 0, 0, 0],
  [75, 0, 0, 74, 0, 0, 70, 0, 67, 0, 70, 0, 74, 0, 0, 0],
  [72, 0, 76, 0, 79, 0, 0, 0, 76, 0, 72, 0, 67, 0, 0, 0],
  [69, 0, 73, 0, 76, 0, 0, 0, 81, 0, 0, 0, 0, 0, 0, 0],
];
// связка из двух тактов: нисходящая гамма и ля-доминанта, чтобы вернуться в ре минор
const CH_F = [[46, 50, 53], [45, 49, 52]];
const MEL_F = [
  [77, 0, 76, 0, 74, 0, 72, 0, 70, 0, 69, 0, 67, 0, 0, 0],
  [73, 0, 0, 0, 69, 0, 0, 0, 76, 0, 0, 0, 73, 0, 0, 0],
];
const GAME_BARS = [...mk(CH, MEL_A), ...mk(CH_B, MEL_B), ...mk(CH_F, MEL_F)];

function playGame(bus, bi, s, t, cyc, SD) {
  const { c, m } = GAME_BARS[bi], n = m[s];
  if (bi < 8) { // A — как раньше
    if (s % 4 === 0) tone(bus, 'triangle', c[0] - 12 + (s === 8 ? 7 : 0), t, SD * 3.5, .35);
    if (s % 2 === 0) tone(bus, 'square', c[(s / 2) % 3] + 12, t, SD * 1.6, .045);
    if (n && cyc % 2 === 0) tone(bus, 'square', n, t, SD * 2.6, .07);
    if (n && cyc % 2 === 1) { tone(bus, 'sine', n + 12, t, SD * 6, .12); tone(bus, 'sine', n + 24, t, SD * 3, .03); }
    if (s % 4 === 2) noise(bus, t, .05, .06, 9000, 2);
    if (s === 0 || s === 8) noise(bus, t, .12, .12, 180, 1, 'lowpass');
    if (s % 8 === 4) noise(bus, t, .09, .1, 2500, 1.2);
  } else if (bi < 16) { // B — шагающий бас, треугольная арпа вверх-вниз, мягкая мелодия
    if (s % 8 === 0) tone(bus, 'triangle', c[0] - 12, t, SD * 7, .34);
    if (s === 6 || s === 14) tone(bus, 'triangle', c[0] - 12 + 7, t, SD * 1.8, .2);
    if (s % 2 === 0) tone(bus, 'triangle', c[[0, 1, 2, 1][(s / 2) % 4]] + 12, t, SD * 1.8, .08);
    if (s % 4 === 2) tone(bus, 'square', c[2] + 12, t, SD * .8, .02);
    if (n && cyc % 2 === 0) { tone(bus, 'triangle', n, t, SD * 3, .17); tone(bus, 'square', n, t, SD * 1.4, .03); }
    if (n && cyc % 2 === 1) { tone(bus, 'sine', n + 12, t, SD * 5, .1); tone(bus, 'sine', n, t, SD * 4, .08); }
    if (s % 4 === 2) noise(bus, t, .04, .05, 9000, 2);
    if (s === 0 || s === 10) noise(bus, t, .12, .12, 180, 1, 'lowpass');
    if (s === 4 || s === 12) noise(bus, t, .09, .09, 2500, 1.2);
  } else { // связка: арпа как в A, мелодия колокольчиком, в последнем такте — нарастающая дробь
    if (s % 4 === 0) tone(bus, 'triangle', c[0] - 12, t, SD * 3.5, .35);
    if (s % 2 === 0) tone(bus, 'square', c[(s / 2) % 3] + 12, t, SD * 1.6, .045);
    if (n) { tone(bus, 'sine', n + 12, t, SD * 4, .12); tone(bus, 'triangle', n, t, SD * 2.5, .09); }
    if (s % 4 === 2) noise(bus, t, .05, .06, 9000, 2);
    if (bi === 17 && s >= 8) noise(bus, t, .06, .05 + (s - 8) * .012, 3000, 1.2);
    if (s === 0) noise(bus, t, .12, .12, 180, 1, 'lowpass');
  }
}

// ---- menu: уютная колыбельная, до мажор / ля минор, колокольчики ----
const C_ = [48, 52, 55], Am_ = [45, 48, 52], F_ = [53, 57, 60], G_ = [55, 59, 62], Em_ = [52, 55, 59], Dm_ = [50, 53, 57];
const MENU_BARS = mk(
  [C_, Am_, F_, G_, C_, Am_, F_, G_, F_, Em_, Dm_, G_, Am_, F_, G_, C_],
  [
    [76, 0, 0, 0, 79, 0, 0, 0, 76, 0, 72, 0, 0, 0, 0, 0],
    [72, 0, 0, 0, 76, 0, 0, 0, 81, 0, 0, 0, 79, 0, 76, 0],
    [77, 0, 0, 0, 76, 0, 0, 0, 72, 0, 0, 0, 69, 0, 0, 0],
    [74, 0, 0, 0, 79, 0, 0, 0, 77, 0, 74, 0, 71, 0, 0, 0],
    [76, 0, 0, 72, 0, 0, 79, 0, 0, 0, 84, 0, 0, 0, 79, 0],
    [81, 0, 0, 0, 79, 0, 76, 0, 72, 0, 0, 0, 76, 0, 0, 0],
    [77, 0, 0, 0, 81, 0, 0, 0, 79, 0, 77, 0, 76, 0, 0, 0],
    [74, 0, 0, 0, 0, 0, 71, 0, 67, 0, 0, 0, 0, 0, 0, 0],
    [81, 0, 0, 0, 77, 0, 0, 0, 72, 0, 0, 0, 77, 0, 0, 0],
    [79, 0, 0, 0, 76, 0, 0, 0, 71, 0, 0, 0, 76, 0, 74, 0],
    [77, 0, 0, 0, 74, 0, 0, 0, 69, 0, 0, 0, 74, 0, 77, 0],
    [79, 0, 0, 0, 74, 0, 71, 0, 74, 0, 0, 0, 0, 0, 0, 0],
    [72, 0, 76, 0, 81, 0, 0, 0, 84, 0, 0, 0, 81, 0, 0, 0],
    [84, 0, 81, 0, 77, 0, 0, 0, 81, 0, 0, 0, 77, 0, 72, 0],
    [79, 0, 77, 0, 74, 0, 71, 0, 74, 0, 0, 0, 77, 0, 0, 0],
    [76, 0, 0, 0, 72, 0, 0, 0, 67, 0, 0, 0, 0, 0, 0, 0],
  ]);

function playMenu(bus, bi, s, t, cyc, SD) {
  const { c, m } = MENU_BARS[bi], n = m[s];
  if (s === 0) for (const p of c) tone(bus, 'sine', p, t, SD * 16, .045, 0, .25); // тёплая подушка
  if (s === 0) tone(bus, 'triangle', c[0] - 12, t, SD * 7, .26);
  if (s === 8) tone(bus, 'triangle', c[0] - 12 + 7, t, SD * 5, .16);
  if (n) { // колокольчик: основной тон + обертоны
    tone(bus, 'sine', n, t, SD * 7, .1);
    tone(bus, 'sine', n + 12, t, SD * 3.5, .03);
    tone(bus, 'sine', n + 19, t, SD * 1.6, .012);
  }
  if (s % 4 === 2) tone(bus, 'sine', c[(s >> 2) % 3] + 24 + (cyc % 2 ? 0 : 0), t, SD * 2, .022); // шкатулка
  if (s === 0 || s === 8) noise(bus, t, .07, .025, 9000, 2, 'highpass'); // бубенцы
}

// ---- night: тёмный, редкий, 108 bpm, ре минор ----
const Dm2 = [50, 53, 57], Bb2 = [46, 50, 53], Gm2 = [43, 46, 50], A2 = [45, 49, 52], Eb2 = [51, 55, 58];
const NIGHT_BARS = mk(
  [Dm2, Dm2, Bb2, Bb2, Gm2, Gm2, A2, A2, Bb2, Gm2, Eb2, A2, Bb2, Gm2, Eb2, A2],
  [
    [0, 0, 0, 0, 69, 0, 0, 0, 0, 0, 65, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 62, 0, 0, 0, 65, 0, 0, 0],
    [0, 0, 70, 0, 0, 0, 0, 0, 0, 0, 69, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 65, 0, 0, 0, 0, 0, 0, 0, 62, 0, 0, 0],
    [67, 0, 0, 0, 0, 0, 70, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 69, 0, 0, 0, 67, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 73, 0, 0, 0, 0, 0, 76, 0, 0, 0, 0, 0, 73, 0],
    [0, 0, 0, 0, 69, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [74, 0, 0, 0, 0, 0, 72, 0, 0, 0, 0, 0, 70, 0, 0, 0],
    [0, 0, 0, 0, 70, 0, 0, 0, 67, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 75, 0, 0, 0, 0, 0, 74, 0, 0, 0, 70, 0, 0, 0],
    [0, 0, 0, 0, 73, 0, 0, 0, 0, 0, 76, 0, 0, 0, 0, 0],
    [77, 0, 0, 0, 0, 0, 74, 0, 0, 0, 0, 0, 70, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 67, 0, 0, 0, 70, 0, 0, 0, 0, 0],
    [75, 0, 0, 0, 0, 0, 74, 0, 0, 0, 70, 0, 0, 0, 67, 0],
    [73, 0, 0, 0, 0, 0, 69, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ]);

function playNight(bus, bi, s, t, cyc, SD) {
  const { c, m } = NIGHT_BARS[bi], n = m[s];
  if (s === 0) { // низкий дрон: основной тон и квинта, дышит на весь такт
    tone(bus, 'sine', c[0] - 12, t, SD * 17, .2, 0, .3);
    tone(bus, 'sine', c[0] - 5, t, SD * 17, .05, 0, .4);
  }
  if (s === 0) { noise(bus, t, .12, .22, 120, 1, 'lowpass'); tone(bus, 'sine', 43, t, .16, .26, -12); } // сердцебиение
  if (s === 3) { noise(bus, t, .09, .1, 120, 1, 'lowpass'); tone(bus, 'sine', 43, t, .12, .13, -12); }
  if (n) { // редкие щипки
    const up = cyc % 2 ? 12 : 0;
    tone(bus, 'triangle', n + up, t, SD * 4, .12);
    tone(bus, 'sine', n + 12 + up, t, SD * 2.5, .04);
  }
  if (s % 8 === 6) noise(bus, t, .04, .03, 7000, 2); // сухой тик
  if (Math.random() < .1) noise(bus, t, .02, .03, 5000, 1, 'highpass'); // потрескивание свечи
}

const TRACKS = {
  menu: { bpm: 84, bars: MENU_BARS, play: playMenu },
  game: { bpm: 96, bars: GAME_BARS, play: playGame },
  night: { bpm: 108, bars: NIGHT_BARS, play: playNight },
};
let wantTrack = 'menu', curName = null, cur = null, trackBus = null;
let musicT = 0, step = 0, timer;

export function setTrack(name) {
  if (!TRACKS[name] || name === wantTrack) return;
  wantTrack = name; // переключится на границе ближайшего такта
}
function switchTrack() {
  // кроссфейд: старая шина гаснет, новая нарастает, ~0.3 с
  const old = trackBus;
  trackBus = ac.createGain(); trackBus.connect(musicBus);
  trackBus.gain.setValueAtTime(0, musicT);
  trackBus.gain.linearRampToValueAtTime(1, musicT + .3);
  if (old) {
    old.gain.cancelScheduledValues(musicT); old.gain.setValueAtTime(old.gain.value, musicT);
    old.gain.linearRampToValueAtTime(0, musicT + .3);
    setTimeout(() => { try { old.disconnect(); } catch (e) {} }, 2500);
  }
  cur = TRACKS[wantTrack]; curName = wantTrack; step = 0;
}
function startMusic() {
  musicT = ac.currentTime + .1; step = 0;
  cur = null; curName = null; trackBus = null;
  clearInterval(timer);
  timer = setInterval(schedule, 40);
}
function schedule() {
  while (musicT < ac.currentTime + .2) {
    if (!cur || (step % 16 === 0 && wantTrack !== curName)) switchTrack();
    const SD = 60 / cur.bpm / 4, n = cur.bars.length;
    const bi = Math.floor(step / 16) % n, s = step % 16, cyc = Math.floor(step / (16 * n));
    cur.play(trackBus, bi, s, musicT, cyc, SD);
    musicT += SD; step++;
  }
}

// ---------- голоса автора ----------
const VOICES = ['sudaa', 'skaifom', 'chessikaif', 'oi'];
const vBuf = {}, vState = {}; // state: 'loading' | 'ok' | 'fail'
export function hasVoice(name) { return !!vBuf[name]; }
export function preloadVoices(names = VOICES) {
  if (!ac) return;
  for (const n of names) {
    if (!VOICES.includes(n) || vState[n]) continue;
    vState[n] = 'loading';
    fetch(`assets/voice/${n}.mp3`)
      .then(res => res.ok ? res.arrayBuffer() : Promise.reject())
      .then(ab => new Promise((ok, no) => ac.decodeAudioData(ab, ok, no)))
      .then(buf => { vBuf[n] = buf; vState[n] = 'ok'; })
      .catch(() => { vState[n] = 'fail'; });
  }
}
// Играет, если файл уже декодирован (true). Иначе запускает ленивую загрузку один раз и возвращает false.
export function voice(name) {
  try {
    if (!ac || !S.sfx || !VOICES.includes(name)) return false;
    const b = vBuf[name];
    if (!b) { preloadVoices([name]); return false; }
    const src = ac.createBufferSource(); src.buffer = b;
    const g = ac.createGain(); g.gain.value = 1;
    src.connect(g); g.connect(sfxBus); src.start();
    return true;
  } catch (e) { return false; }
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
    case 'tick': tone(sfxBus, 'square', 96, t, .02, .03); noise(sfxBus, t, .015, .06 * k, 3500, 4); break;
    case 'flag': [76, 71, 64].forEach((n, i) => { tone(sfxBus, 'triangle', n, t + i * .15, .2, .2); tone(sfxBus, 'square', n, t + i * .15, .1, .04); }); break;
    case 'promo': [79, 83, 86, 91].forEach((n, i) => tone(sfxBus, 'sine', n, t + i * .07, .25, .12)); break;
  }
}
