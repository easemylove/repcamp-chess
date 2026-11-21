// Rep Camp Chess — партия, режимы, камера, сценки, интерфейс.
import * as THREE from 'three';
import { Retro, mat, C } from './gfx.js?v=1795256270';
import { buildWorld, BT } from './world.js?v=1795256270';
import { makePiece } from './figures.js?v=1795256270';
import { initAudio, sfx, setMusic, setSfx } from './audio.js?v=1795256270';
import * as AU from './audio.js?v=1795256270';
import { CHAPTERS, preparePuzzle } from './story.js?v=1795256270';

const $ = s => document.querySelector(s);
const Chess = window.Chess;

// ---------- настройки ----------
const LS = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
let saved = {}; try { saved = JSON.parse(LS.get('rcSet') || '{}'); } catch (_) {}
const SET = Object.assign({ gfx: 'ps1', crt: false, scenes: true, music: true, sfx: true, sharp: 240, flip: true, mini: true, coach: true }, saved);
if (saved.scenes === undefined) SET.scenes = 'some';
const saveSet = () => LS.set('rcSet', JSON.stringify(SET));

// ---------- рендер ----------
const retro = new Retro($('#c'));
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, 1, .1, 200);
const camL = new THREE.PointLight('#dfe6ff', 9, 0, 1.1);   // мягкая подсветка от камеры: тёмные орги не сливаются
const world = buildWorld(scene); scene.add(camL);
function applySet() {
  retro.sharp = SET.sharp; retro.setMode(SET.gfx); retro.crt = SET.crt; retro.resize();
  setMusic(SET.music); setSfx(SET.sfx);
}
applySet();
addEventListener('resize', () => retro.resize());

// ---------- твины ----------
const tweens = []; let skip = false;
const ease = { io: x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2, out: x => 1 - (1 - x) * (1 - x), in: x => x * x, lin: x => x };
function tween(dur, fn, e = ease.io) { return new Promise(res => { const tw = { t: 0, dur, fn, e, res }; if (skip || dur <= 0) { fn(1); res(); return; } tweens.push(tw); }); }
const wait = s => tween(s, () => {});
function updTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; tw.t = skip ? tw.dur : tw.t + dt;
    const k = Math.min(1, tw.t / tw.dur); tw.fn(tw.e(k));
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
}

// ---------- частицы ----------
const parts = []; const pbox = new THREE.BoxGeometry(1, 1, 1);
function particle(pos, vel, color, size = .1, life = 1.4, grav = 9, basic = false) {
  const m = new THREE.Mesh(pbox, basic ? new THREE.MeshBasicMaterial({ color }) : mat(color));
  m.position.copy(pos); m.scale.setScalar(size); scene.add(m);
  parts.push({ m, v: vel.clone(), life, max: life, grav, size, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0) });
}
function updParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    p.v.y -= p.grav * dt; p.m.position.addScaledVector(p.v, dt);
    const floor = Math.abs(p.m.position.x) < 4.8 && Math.abs(p.m.position.z) < 4.8 ? BT : 0;
    if (p.m.position.y < floor + p.size / 2) { p.m.position.y = floor + p.size / 2; p.v.y *= -.35; p.v.x *= .6; p.v.z *= .6; p.spin.multiplyScalar(.5); }
    p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt;
    if (p.life < .4) p.m.scale.setScalar(p.size * Math.max(0, p.life / .4));
    if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); }
  }
}
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rr = (a, b) => a + Math.random() * (b - a);
function burst(fig) {
  const c = fig.root.position.clone(); c.y += .4 * fig.scale;
  for (let i = 0; i < 18; i++) particle(c.clone().add(V(rr(-.2, .2), rr(0, .5), rr(-.2, .2))), V(rr(-2.2, 2.2), rr(2, 4.5), rr(-2.2, 2.2)), fig.colors[i % fig.colors.length], rr(.07, .14), rr(1.2, 1.9));
  sfx('bricks');
}
function puff(pos, n = 10, color = '#ffffff', spd = 1.6) { for (let i = 0; i < n; i++) particle(pos.clone(), V(rr(-spd, spd), rr(.5, 2), rr(-spd, spd)), color, rr(.05, .1), rr(.5, .9), 3); }
function stars(pos, n = 8) { const cols = [C.limonad, C.malina, '#ffffff', C.myata]; for (let i = 0; i < n; i++) particle(pos.clone(), V(rr(-2, 2), rr(1, 3), rr(-2, 2)), cols[i % 4], rr(.06, .1), rr(.6, 1.1), 2, true); }

// ---------- координаты ----------
const sqPos = sq => V(sq.charCodeAt(0) - 97 - 3.5, BT, 3.5 - (+sq[1] - 1));
const sqAt = p => { const f = Math.floor(p.x + 4), r = Math.floor(4 - p.z); return f >= 0 && f < 8 && r >= 0 && r < 8 ? 'abcdefgh'[f] + (r + 1) : null; };

// ---------- партия ----------
let game = new Chess();
let figs = {};               // клетка → фигура
let grave = [];              // взятые на скамейке
const spectators = [];
let seedN = 1;
function clearFigs() { for (const f of Object.values(figs)) scene.remove(f.root); for (const f of grave) scene.remove(f.root); figs = {}; grave = []; }
function spawn(type, color, sq) { const f = makePiece(type, color, seedN++); f.sq = sq; f.root.position.copy(sqPos(sq)); scene.add(f.root); figs[sq] = f; return f; }
function rebuild() {
  clearFigs(); seedN = 1;
  const b = game.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = b[r][f]; if (p) spawn(p.type, p.color, 'abcdefgh'[f] + (8 - r)); }
  for (const m of game.history({ verbose: true })) if (m.captured) toGrave(makePiece(m.captured, m.color === 'w' ? 'b' : 'w', seedN++), true);
  markLast(); markCheck();
}
function toGrave(f, instant) {
  const mine = grave.filter(g => g.color === f.color).length;
  const side = f.color === 'w' ? 1 : -1;
  const p = V(side * (6.2 + Math.floor(mine / 8) * .8), 0, (-3.5 + (mine % 8)) * side);
  f.root.position.copy(p); f.root.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
  f.stand.rotation.set(0, 0, 0); f.stand.scale.setScalar(f.scale * .85); f.stand.position.set(0, 0, 0); f.posing = false; f.holdR = false; f.walk = 0;
  if (f.p.body) { f.p.body.rotation.set(0, 0, 0); f.p.body.scale.set(1, 1, 1); }
  f.root.visible = true; scene.add(f.root); grave.push(f);
  if (!instant) { f.stand.scale.setScalar(.01); tween(.35, k => f.stand.scale.setScalar(f.scale * .85 * k), ease.out); sfx('pop'); }
}

// ---------- метки на доске ----------
const markG = new THREE.Group(); scene.add(markG);
const flat = (w, d, color, op = 1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, .02, d), new THREE.MeshBasicMaterial({ color, transparent: op < 1, opacity: op, depthWrite: op >= 1 })); return m; };
function frame(color, s = .92, th = .08) { const g = new THREE.Group(); for (const [w, d, x, z] of [[s, th, 0, -s / 2], [s, th, 0, s / 2], [th, s, -s / 2, 0], [th, s, s / 2, 0]]) { const m = flat(w, d, color); m.position.set(x, 0, z); g.add(m); } return g; }
const lastM = [flat(.96, .96, C.limonad, .35), flat(.96, .96, C.limonad, .35)]; lastM.forEach(m => { m.visible = false; scene.add(m); });
const selM = frame(C.limonad); selM.visible = false; scene.add(selM);
const checkM = frame(C.malina, .96, .12); checkM.visible = false; scene.add(checkM);
const hintM = frame(C.myata, .96, .12); hintM.visible = false; scene.add(hintM);
let moveMarks = [];
function showMoves(list) {
  miniLegal = list;
  for (const m of moveMarks) markG.remove(m); moveMarks = [];
  for (const mv of list) {
    const cap = mv.flags.includes('c') || mv.flags.includes('e');
    const m = cap ? frame(C.malina, .8, .07) : flat(.22, .22, C.myata);
    m.position.copy(sqPos(mv.to)); m.position.y += .015; markG.add(m); moveMarks.push(m);
  }
}
function markLast() {
  const h = game.history({ verbose: true }); const l = h[h.length - 1];
  lastM.forEach(m => m.visible = !!l);
  if (l) { lastM[0].position.copy(sqPos(l.from)); lastM[1].position.copy(sqPos(l.to)); lastM.forEach(m => m.position.y += .006); }
}
function kingSq(color) { for (const [sq, f] of Object.entries(figs)) if (f.type === 'k' && f.color === color) return sq; }
function markCheck() {
  checkM.visible = game.in_check();
  if (checkM.visible) { checkM.position.copy(sqPos(kingSq(game.turn()))); checkM.position.y += .02; }
}

// ---------- камера ----------
const orbit = { th: 0, ph: .78, dist: 11, tx: 0, ty: .2, tz: .4 };
const goal = { ...orbit };
let auto = false, top = false;
const cine = { k: 0, pos: V(), look: V() };
function setView(name) {
  top = false;
  const ph0 = retro.aspect < 1 ? 1.0 : .78;
  if (name === 'w') Object.assign(goal, { th: 0, ph: ph0, dist: 11 });
  if (name === 'b') Object.assign(goal, { th: Math.PI, ph: ph0, dist: 11 });
  if (name === 'side') Object.assign(goal, { th: goal.th + Math.PI / 2, ph: .5, dist: 10 });
  if (name === 'top') { top = true; Object.assign(goal, { th: (mode === 'hot' ? game.turn() : mySide) === 'b' ? Math.PI : 0, ph: 1.5, dist: 11.5 }); }
  // доворачиваем угол кратчайшим путём
  while (goal.th - orbit.th > Math.PI) goal.th -= Math.PI * 2;
  while (goal.th - orbit.th < -Math.PI) goal.th += Math.PI * 2;
}
let panK = 0;
function updCam(dt) {
  const portrait = retro.aspect < 1;
  cam.fov = portrait ? 66 : 50; cam.aspect = retro.aspect; cam.updateProjectionMatrix();
  if (auto) goal.th += dt * .07;
  const k = 1 - Math.exp(-dt * 6);
  for (const key of ['th', 'ph', 'dist', 'tx', 'ty', 'tz']) orbit[key] += (goal[key] - orbit[key]) * k;
  const hf = 2 * Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect);
  const need = (top ? 4.6 : 5.6) / Math.tan(hf / 2);
  const d = Math.max(orbit.dist, auto ? orbit.dist : need * (top ? 1 : (portrait ? .74 : .85)));
  const ph = Math.min(orbit.ph, 1.52);
  const p = V(orbit.tx + Math.sin(orbit.th) * Math.cos(ph) * d, orbit.ty + Math.sin(ph) * d, orbit.tz + Math.cos(orbit.th) * Math.cos(ph) * d);
  const look = V(orbit.tx, orbit.ty, orbit.tz);
  // на телефоне под схемой — сдвигаем доску выше
  panK += ((portrait && SET.mini && !auto ? (top ? 2.4 : 2.0) : 0) - panK) * k;
  const pan = V(Math.sin(orbit.th), 0, Math.cos(orbit.th)).multiplyScalar(panK); p.add(pan); look.add(pan);
  if (cine.k > 0) { p.lerp(cine.pos, cine.k); look.lerp(cine.look, cine.k); }
  cam.position.copy(p); cam.up.set(top && cine.k < .5 ? -Math.sin(orbit.th) : 0, top && cine.k < .5 ? 0 : 1, top && cine.k < .5 ? -Math.cos(orbit.th) : 0);
  cam.lookAt(look); camL.position.copy(cam.position);
}
function viewForTurn() { if (mode === 'hot' && SET.flip) setView(game.turn()); }

// ---------- движения фигур ----------
function face(f, target) { const d = target.clone().sub(f.root.position); return Math.atan2(d.x, d.z); }
function turnTo(f, ang, dur = .18) { const a0 = f.root.rotation.y; let d = ang - a0; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return tween(dur, k => f.root.rotation.y = a0 + d * k); }
async function walk(f, to, opts = {}) {
  const from = f.root.position.clone(); const dist = from.distanceTo(to);
  if (dist < .01) return;
  await turnTo(f, face(f, to));
  f.walk = 1;
  const dur = opts.dur || Math.min(1.5, .3 + dist * (f.type === 'n' ? .16 : .22));
  const hop = f.type === 'n' ? .9 : 0;
  let lastStep = 0;
  await tween(dur, k => {
    f.root.position.lerpVectors(from, to, k); f.root.position.y = from.y + Math.sin(k * Math.PI) * hop;
    if (k - lastStep > .18) { lastStep = k; sfx('step', .7); }
  }, ease.lin);
  f.walk = 0;
  if (!opts.keepFacing) await turnTo(f, f.color === 'w' ? Math.PI : 0, .2);
}

// ---------- сценки взятий ----------
const WORDS = { p: ['ПЛЮХ', 'СНЕЖОК'], n: ['ИГОГО', 'ВЖУХ'], b: ['ДЗЫНЬ', 'ОП'], r: ['БАМ', 'ТЫДЫЩ'], q: ['ЧЕСС И КАЙФ', 'ВОТ ТАК'], k: ['ПОДУШКОЙ', 'ХРЯСЬ'] };
const CRY = ['СЮДАА', 'С КАЙФОМ!'];   // фирменное: победа и взятие
const pickOne = a => a[(Math.random() * a.length) | 0];
// записанные голосом Андрея фразы: положить mp3 в assets/voice/ и вписать имя сюда (sudaa, skaifom, chessikaif, oi)
const VOICES = [];
function voiceFor(t) { const v = /СЮДА/.test(t) ? 'sudaa' : /КАЙФОМ/.test(t) ? 'skaifom' : /ЧЕСС И КАЙФ/.test(t) ? 'chessikaif' : /^ОЙ/.test(t) ? 'oi' : null; if (v && VOICES.includes(v) && AU.voice) AU.voice(v); }
function pop(text, color = C.malina) { voiceFor(text); const e = $('#pop'); e.textContent = text; e.style.color = color; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); }
async function cineTo(pos, look, dur = .5) { const p0 = cine.k > 0 ? cine.pos.clone() : cam.position.clone(), l0 = cine.k > 0 ? cine.look.clone() : V(orbit.tx, orbit.ty, orbit.tz); const k0 = cine.k; await tween(dur, k => { cine.pos.lerpVectors(p0, pos, k); cine.look.lerpVectors(l0, look, k); cine.k = k0 + (1 - k0) * k; }); }
async function cineOut(dur = .6) { const k0 = cine.k; await tween(dur, k => cine.k = k0 * (1 - k)); }

async function captureScene(att, vic, toPos) {
  const vp = vic.root.position.clone(); const ap = att.root.position.clone();
  const dir = vp.clone().sub(ap).setY(0).normalize();
  const side = V(-dir.z, 0, dir.x); if (side.dot(cam.position.clone().sub(vp)) < 0) side.negate();
  const mid = ap.clone().lerp(vp, .6);
  const camPos = mid.clone().addScaledVector(side, 3.1).addScaledVector(dir, -.8).add(V(0, 1.5, 0));
  const near = vp.clone().addScaledVector(dir, att.type === 'r' ? -1.1 : -.8);
  const stand = ap.distanceTo(vp) > 1.2 ? near : ap;
  const lookAt = stand.clone().lerp(vp, .5).add(V(0, .55, 0));
  await Promise.all([cineTo(camPos, lookAt, .55), att.type === 'r' ? turnTo(att, face(att, vp)) : walk(att, stand, { keepFacing: true })]);
  await turnTo(att, face(att, vp), .12);
  vic.posing = true; await turnTo(vic, face(vic, att.root.position), .15);
  const W = att.color === 'w'; const p = att.p;
  pop(Math.random() < .45 ? pickOne(CRY) : pickOne(WORDS[att.type]), W ? C.malina : C.myata);
  const head = () => vic.root.position.clone().add(V(0, .75 * vic.scale, 0));
  const fallBack = (ax = -1.45) => tween(.35, k => { vic.stand.rotation.x = ax * k; }, ease.in);

  const variant = chooseVariant();
  if (variant !== 'own') await genericScene(variant, att, vic, dir);
  else if (att.type === 'p') {
    att.posing = true; att.holdR = true;
    await tween(.25, k => p.armR.rotation.x = -2.8 * k);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(.08, 0), mat('#ffffff')); scene.add(ball);
    const s = att.root.position.clone().add(V(0, .9 * att.scale, 0)), e = head(); sfx('whoosh');
    tween(.12, k => p.armR.rotation.x = -2.8 + 2.4 * k);
    await tween(.38, k => { ball.position.lerpVectors(s, e, k); ball.position.y += Math.sin(k * Math.PI) * .5; }, ease.lin);
    scene.remove(ball); sfx('snowball'); puff(e, 14);
    await fallBack(); await wait(.12);
  } else if (att.type === 'n') {
    sfx('neigh');
    await tween(.3, k => p.horse.rotation.x = -.6 * Math.sin(k * Math.PI / 2));
    await tween(.15, k => p.horse.rotation.x = -.6 * (1 - k));
    sfx('bonk'); puff(vp.clone().add(V(0, .1, 0)), 8);
    const v0 = vic.root.position.clone();
    await tween(.7, k => { vic.root.position.copy(v0).addScaledVector(dir, k * 2.5); vic.root.position.y = v0.y + Math.sin(k * Math.PI) * 2.2; vic.stand.rotation.x = k * 9; }, ease.lin);
    stars(vic.root.position.clone().add(V(0, .4, 0)), 10);
  } else if (att.type === 'b') {
    att.posing = true; att.holdR = true;
    if (W) {
      await tween(.2, k => p.armR.rotation.x = -.9 - .6 * k);
      sfx('splash');
      for (let i = 0; i < 16; i++) particle(att.root.position.clone().add(V(0, .9, 0)).addScaledVector(dir, .2), dir.clone().multiplyScalar(rr(2, 3.2)).add(V(rr(-.4, .4), rr(1, 2), rr(-.4, .4))), i % 2 ? '#c2433b' : '#ffb35c', .06, .8, 6);
      await wait(.25);
      await tween(.6, k => { vic.root.rotation.y += .5; vic.stand.scale.y = vic.scale * (1 - .8 * k); });
    } else {
      await tween(.25, k => p.armR.rotation.x = -.9 - 1.9 * k);
      sfx('ring'); stars(att.root.position.clone().add(V(0, 1.6, 0)), 6);
      await tween(.35, k => vic.root.rotation.y = face(vic, att.root.position) + Math.sin(k * 30) * .15 * (1 - k));
      await fallBack(1.45);
    }
  } else if (att.type === 'r') {
    const s0 = att.root.position.clone();
    sfx('whoosh');
    await tween(.5, k => { att.root.position.lerpVectors(s0, vp, k); att.root.position.y = s0.y + Math.sin(k * Math.PI) * 2; }, ease.lin);
    sfx('stomp');
    vic.stand.scale.set(vic.scale * 1.4, vic.scale * .12, vic.scale * 1.4);
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28; particle(vp.clone().add(V(0, .1, 0)), V(Math.cos(a) * 2.5, rr(.5, 1.2), Math.sin(a) * 2.5), '#ffffff', .08, .7, 4); }
    await wait(.15);
    vic.root.visible = false; burst(vic); vic.root.visible = true;
  } else if (att.type === 'q') {
    att.posing = true; att.holdR = true;
    if (W) { await tween(.25, k => p.armR.rotation.x = -2.6 - .4 * Math.sin(k * Math.PI)); stars(att.root.position.clone().add(V(0, 1.7, 0)), 12); sfx('promo'); }
    else { sfx('mega'); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.3, .04, 4, 12), new THREE.MeshBasicMaterial({ color: W ? C.limonad : C.malina })); scene.add(ring);
    const s = att.root.position.clone().add(V(0, .8, 0)); ring.lookAt(s.clone().add(dir));
    const v0 = vic.root.position.clone();
    await tween(.4, k => { ring.position.copy(s).addScaledVector(dir, k * att.root.position.distanceTo(vp)); ring.scale.setScalar(1 + k * 2); });
    scene.remove(ring);
    await tween(.45, k => { vic.root.position.copy(v0).addScaledVector(dir, k * 1.4); vic.stand.rotation.x = -1.4 * k; }, ease.out);
  } else if (att.type === 'k') {
    att.posing = true; att.holdR = true;
    const pil = new THREE.Mesh(new THREE.BoxGeometry(.3, .12, .2), mat('#ffffff')); pil.position.set(0, -.08, .1); p.handR.add(pil);
    await tween(.3, k => p.armR.rotation.x = -2.7 * k);
    sfx('pillow');
    await tween(.14, k => p.armR.rotation.x = -2.7 + 3.2 * k, ease.in);
    for (let i = 0; i < 18; i++) particle(head(), V(rr(-1.5, 1.5), rr(.5, 2.5), rr(-1.5, 1.5)), '#ffffff', rr(.03, .06), rr(1, 1.6), 1.2);
    await tween(.35, k => vic.stand.rotation.z = 1.5 * k, ease.in);
    p.handR.remove(pil);
  }
  if (vic.root.visible && (att.type !== 'r' || variant !== 'own')) { vic.root.visible = false; burst(vic); }
  vic.root.visible = false;
  await wait(.45);
  att.posing = false; att.holdR = false;
  if (p.armR) p.armR.rotation.x = att.baseArm.R; if (p.horse) p.horse.rotation.x = 0;
  vic.posing = false;
  await walk(att, toPos);
  toGrave(vic);
  await cineOut(.55);
}

// общие сценки — для разнообразия, любая фигура может так взять
let lastVar = '';
function chooseVariant() { const opts = ['own', 'own', 'dance', 'cannon', 'slip']; let v; do { v = pickOne(opts); } while (v === lastVar && v !== 'own'); lastVar = v; return v; }
async function genericScene(v, att, vic, dir) {
  const p = att.p; att.posing = true; att.holdR = true;
  if (v === 'dance') {            // батл: крутанулся — соперник повторил и упал
    sfx('promo'); const a0 = att.root.rotation.y, y0 = att.root.position.y;
    await tween(.8, k => { att.root.rotation.y = a0 + k * Math.PI * 4; att.root.position.y = y0 + Math.abs(Math.sin(k * Math.PI * 4)) * .3; }, ease.lin);
    att.root.rotation.y = a0; att.root.position.y = y0;
    const b0 = vic.root.rotation.y; await tween(.5, k => vic.root.rotation.y = b0 + k * Math.PI * 2.5, ease.in);
    await tween(.3, k => vic.stand.rotation.z = 1.5 * k, ease.in);
  } else if (v === 'cannon') {    // хлопушка: конфетти — и соперник улетает вверх
    if (p.armL) await tween(.25, k => { p.armL.rotation.x = -2.8 * k; p.armR.rotation.x = -2.8 * k; });
    sfx('pop'); stars(vic.root.position.clone().add(V(0, .6, 0)), 22);
    const v0 = vic.root.position.clone(); await tween(.7, k => { vic.root.position.y = v0.y + Math.sin(k * Math.PI / 2) * 2.6; vic.root.rotation.y += .4; }, ease.out);
  } else {                         // гололёд: показал пальцем — соперник уехал и упал
    if (p.armR) await tween(.2, k => p.armR.rotation.x = -1.6 * k);
    sfx('whoosh'); const v0 = vic.root.position.clone();
    await tween(.5, k => { vic.root.position.copy(v0).addScaledVector(dir, k * 1.3); vic.stand.rotation.x = -.5 * k; }, ease.out);
    await tween(.25, k => vic.stand.rotation.x = -.5 - k, ease.in); puff(vic.root.position.clone().add(V(0, .1, 0)), 10);
  }
  if (p.armL) p.armL.rotation.x = att.baseArm.L;
}

async function quickCapture(att, vic, toPos) {
  await walk(att, vic.root.position.clone().lerp(att.root.position, .45), { keepFacing: true });
  vic.root.visible = false; burst(vic); pop(pickOne(CRY), att.color === 'w' ? C.malina : C.myata); await walk(att, toPos); toGrave(vic);
}

// ---------- ход ----------
let busy = false; let chain = Promise.resolve();
function queueMove(mv) { chain = chain.then(() => doMove(mv)).catch(e => console.error(e)); return chain; }
async function doMove(mvIn) {
  const fenBefore = game.fen(), mover = game.turn();
  const coachIt = coachFor(mover);
  const preP = coachIt ? (hintCache && hintCache.fen === fenBefore ? Promise.resolve(hintCache.r) : analyse(fenBefore)) : null;
  const mv = game.move(mvIn); if (!mv) return null;
  if (clk && game.history().length > 1) clk[mover] += clk.inc;
  hintMove = null; hintM.visible = false; hanging = []; coachHide();
  if (coachIt) { mv._fen = fenBefore; mv._pre = preP; mv._post = analyse(game.fen()); }
  busy = true; selected = null; showMoves([]); selM.visible = false; checkM.visible = false;
  const f = figs[mv.from]; delete figs[mv.from];
  let vicSq = null; if (mv.flags.includes('e')) vicSq = mv.to[0] + mv.from[1]; else if (mv.captured) vicSq = mv.to;
  const vic = vicSq ? figs[vicSq] : null; if (vicSq) delete figs[vicSq];
  const to = sqPos(mv.to);
  sfx('move');
  if (vic) {
    const full = SET.scenes === true || SET.scenes === 'all' || (SET.scenes === 'some' && (fullShown < 4 || VAL[vic.type] >= 3 || mv.san.includes('+')));
    if (full) fullShown++;
    inCut = full; if (full) await captureScene(f, vic, to); else await quickCapture(f, vic, to); inCut = false; skip = false;
  }
  else if (mv.flags.includes('k') || mv.flags.includes('q')) {
    const r = mv.color === 'w' ? '1' : '8'; const rf = mv.flags.includes('k') ? 'h' + r : 'a' + r, rt = mv.flags.includes('k') ? 'f' + r : 'd' + r;
    const rook = figs[rf]; delete figs[rf];
    await walk(f, to); await walk(rook, sqPos(rt)); rook.sq = rt; figs[rt] = rook; pop('РОКИРОВКА', C.limonad);
  } else await walk(f, to);
  f.sq = mv.to; figs[mv.to] = f;
  if (mv.promotion) {
    stars(to.clone().add(V(0, .6, 0)), 14); sfx('promo');
    scene.remove(f.root); delete figs[mv.to];
    const nf = spawn(mv.promotion, mv.color, mv.to); nf.stand.scale.setScalar(.01);
    await tween(.4, k => nf.stand.scale.setScalar(nf.scale * k), ease.out);
    pop('ПРЕВРАЩЕНИЕ', C.limonad);
  }
  markLast(); markCheck();
  if (game.in_check() && !game.in_checkmate()) { sfx('check'); pop('ШАХ!', C.malina); const k = figs[kingSq(game.turn())]; const a = k.root.rotation.y; await tween(.4, t => k.root.rotation.y = a + Math.sin(t * 25) * .2 * (1 - t), ease.lin); }
  busy = false;
  afterMove(mv);
  return mv;
}

// ---------- режимы ----------
let mode = 'title';           // title | ai | hot | online | story
let mySide = 'w', level = 1, inCut = false;
const LEVELS = [
  { name: 'начинашка', skill: 0, depth: 2, rnd: .12 },
  { name: 'продолжашка', skill: 5, depth: 6, rnd: .03 },
  { name: 'кайфарик-про', skill: 12, depth: 10, rnd: 0 },
  { name: 'гроссорг', skill: 20, depth: 14, rnd: 0, time: 1500 },
];
const SIDE = { w: 'лагерь', b: 'орги' };

// Stockfish в воркере
let engine, engCb;
function eng() {
  if (engine) return engine;
  engine = new Worker('stockfish.js?v=1795256270');
  engine.onmessage = e => { const l = String(e.data); if (engCb && l.startsWith('bestmove')) { const c = engCb; engCb = null; c(l.split(/\s+/)[1]); } };
  engine.postMessage('uci'); engine.postMessage('isready');
  return engine;
}
function bestMove(fen, L) {
  return new Promise(res => {
    const legal = new Chess(fen).moves({ verbose: true });
    if (L.rnd && Math.random() < L.rnd) { const caps = legal.filter(m => m.captured); const pool = caps.length && Math.random() < .6 ? caps : legal; const m = pool[(Math.random() * pool.length) | 0]; return setTimeout(() => res(m.from + m.to + (m.promotion || '')), 300); }
    eng(); engCb = res;
    engine.postMessage('setoption name Skill Level value ' + L.skill);
    engine.postMessage('position fen ' + fen);
    engine.postMessage(`go depth ${L.depth}` + (L.time ? ` movetime ${L.time}` : ''));
  });
}
async function aiTurn() {
  if (game.game_over()) return;
  status(`${SIDE[game.turn()]} думают…`);
  const t0 = performance.now();
  const uci = await bestMove(game.fen(), LEVELS[level]);
  const left = 700 - (performance.now() - t0); if (left > 0) await new Promise(r => setTimeout(r, left));
  if (!uci || mode === 'title') return;
  await queueMove({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
}

async function afterMove(mv) {
  if (ended) return;
  updHud();
  if (mv._post && !game.game_over()) {
    busy = true; const r = await coachReview(mv); busy = false;
    if (r === 'undo') { game.undo(); rebuild(); updHud(); viewForTurn(); refreshHanging(); coachSay('вернули. подумай ещё раз — время есть'); return; }
  } else if (mv._post && game.in_checkmate()) coachSay('мат! сюдаа!');
  if (game.game_over()) return endGame();
  if (mode === 'ai' && game.turn() !== mySide) aiTurn();
  if (mode === 'hot') viewForTurn();
  if (mode === 'story') storyAfter(mv);
  refreshHanging(); saveGame();
}

// ---------- тренер для начинашек ----------
// Свой воркер Stockfish (не мешает ходам компа): оценка до и после хода, зевки, висящие фигуры, подсказка.
let coachW = null, coachCb = null, coachChain = Promise.resolve(), hanging = [], hintCache = null;
const NAME_ACC = { p: 'пешку', n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя', k: 'короля' };
const NAME_INS = { p: 'пешкой', n: 'конём', b: 'слоном', r: 'ладьёй', q: 'ферзём', k: 'королём' };
const NAME = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' };
function coachEng() {
  if (coachW) return coachW;
  coachW = new Worker('stockfish.js?v=1795256270'); let last = { cp: 0, mate: null, pv: [] };
  coachW.onmessage = e => {
    const l = String(e.data);
    if (l.startsWith('info') && l.includes(' pv ') && !l.includes('bound')) { const mm = l.match(/ score (cp|mate) (-?\d+)/); if (mm) last = { cp: mm[1] === 'cp' ? +mm[2] : 0, mate: mm[1] === 'mate' ? +mm[2] : null, pv: l.split(' pv ')[1].trim().split(/\s+/) }; }
    else if (l.startsWith('bestmove') && coachCb) { const c = coachCb; coachCb = null; c({ ...last, best: l.split(/\s+/)[1] }); last = { cp: 0, mate: null, pv: [] }; }
  };
  coachW.postMessage('uci'); coachW.postMessage('isready');
  return coachW;
}
function analyse(fen, depth = 10) {
  const job = () => new Promise(res => {
    const t = new Chess(fen);
    if (t.in_checkmate()) return res({ cpW: t.turn() === 'w' ? -10000 : 10000, best: null, pv: [], mate: 0 });
    if (t.game_over()) return res({ cpW: 0, best: null, pv: [], mate: null });
    coachEng();
    coachCb = r => { const sg = t.turn() === 'w' ? 1 : -1; const cpW = r.mate !== null ? sg * Math.sign(r.mate || -1) * (10000 - Math.abs(r.mate) * 10) : sg * r.cp; res({ ...r, cpW, best: r.best && r.best !== '(none)' ? r.best : null }); };
    coachW.postMessage('setoption name Skill Level value 20'); coachW.postMessage('position fen ' + fen); coachW.postMessage('go depth ' + depth);
  });
  const p = coachChain.then(job); coachChain = p.catch(() => {}); return p;
}
const wp = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-3000, Math.min(3000, cp)))) - 1);
function coachFor(color) {
  if (!SET.coach) return false;
  if (mode === 'ai') return color === mySide;
  if (mode === 'hot') return true;
  if (mode === 'story') return !!(story && story.ch.kind === 'game' && color === 'w');
  return false;
}
const uciObj = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
function sanOf(fen, u) { try { const t = new Chess(fen); const m = t.move(uciObj(u)); return m ? m.san : u; } catch (_) { return u; } }
function reasonAfter(post, mover) {
  if (post.mate !== null && post.mate !== undefined && post.mate > 0) return `теперь у соперника мат в ${post.mate}.`;
  if (!post.best) return '';
  const t = new Chess(game.fen()); const m = t.move(uciObj(post.best));
  if (m && m.captured) return `соперник забирает ${NAME_ACC[m.captured]} — ${m.san}.`;
  if (m) return `соперник отвечает ${m.san}, и позиция поплыла.`;
  return '';
}
async function coachReview(mv) {
  let pre, post; try { [pre, post] = await Promise.all([mv._pre, mv._post]); } catch (_) { return 'go'; }
  if (!pre || !post) return 'go';
  const sg = mv.color === 'w' ? 1 : -1; const loss = wp(sg * pre.cpW) - wp(sg * post.cpW);
  const played = mv.from + mv.to + (mv.promotion || ''), isBest = pre.best && (pre.best === played || pre.best === mv.from + mv.to);
  const bestSan = pre.best ? sanOf(mv._fen, pre.best) : null;
  const who = mode === 'hot' ? SIDE[mv.color] + ', ' : '';
  const opening = game.history().length <= 10;   // в дебюте движок на малой глубине придирается к нормальным ходам
  if (loss >= (opening ? 22 : 15) && !isBest) {
    sfx('deny');
    const ans = await coachAsk(`${who}ой. ${mv.san} — зевок. ${reasonAfter(post, mv.color)}${bestSan ? ` лучше было ${bestSan}.` : ''}`, ['вернуть ход', 'играю дальше']);
    return ans === 0 ? 'undo' : 'go';
  }
  if (loss >= 12 && !isBest && !opening) coachSay(`${who}${mv.san} — так себе. ${reasonAfter(post, mv.color)}${bestSan ? ` сильнее было ${bestSan}.` : ''}`, 6500);
  else if (isBest && (mv.captured || mv.san.includes('+') || Math.random() < .3)) coachSay(pickOne(['с кайфом! лучший ход', 'сюдаа! это ход движка', 'с кайфом! так и надо', 'чесс и кайф. сильнее не найти']), 3500);
  else if (loss < 3 && mv.captured && Math.random() < .5) coachSay(pickOne(['с кайфом!', 'сюдаа!']), 2500);
  return 'go';
}
// фигуры, которые сейчас висят у того, кто ходит: под боем и без защиты (или бьёт кто-то дешевле)
function hangingFor(color) {
  if (game.in_check()) return [];
  const fen = game.fen().split(' '); const opp = color === 'w' ? 'b' : 'w';
  const oppFen = [fen[0], opp, '-', '-', '0', '1'].join(' ');
  let oppMoves; try { const t = new Chess(); if (!t.load(oppFen)) return []; oppMoves = t.moves({ verbose: true }).filter(m => m.captured); } catch (_) { return []; }
  const out = [];
  const b = game.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = b[r][f]; if (!p || p.color !== color || p.type === 'k') continue;
    const sq = 'abcdefgh'[f] + (8 - r);
    const att = oppMoves.filter(m => m.to === sq); if (!att.length) continue;
    const cheaper = att.some(m => (VAL[m.piece] || 0) < VAL[p.type]);
    let defended = false;
    try { const t = new Chess(); t.load([fen[0], color, '-', '-', '0', '1'].join(' ')); t.remove(sq); t.put({ type: 'p', color: opp }, sq); defended = t.moves({ verbose: true }).some(m => m.to === sq && m.captured); } catch (_) {}
    if (cheaper || !defended) out.push(sq);
  }
  return out;
}
function refreshHanging() {
  hanging = [];
  if (game.game_over() || !coachFor(game.turn()) || !canMoveNow()) return;
  hanging = hangingFor(game.turn());
  if (hanging.length) { const list = hanging.map(sq => `${NAME[game.get(sq).type]} ${sq}`).join(', '); status(`висит: ${list}`); }
}
function canMoveNow() { return mode === 'hot' || (mode === 'ai' && game.turn() === mySide) || (mode === 'story' && game.turn() === 'w'); }
let coachTimer = null;
function coachSay(text, ms = 4000, who = 'тренер') { const el = $('#coach'); $('#coachWho').textContent = who; $('#coachT').textContent = text; $('#coachB').innerHTML = ''; el.classList.add('on'); clearTimeout(coachTimer); coachTimer = setTimeout(() => el.classList.remove('on'), ms); }
function coachHide() { clearTimeout(coachTimer); $('#coach').classList.remove('on'); }
function coachAsk(text, buttons, who = 'тренер') {
  return new Promise(res => {
    clearTimeout(coachTimer); const el = $('#coach'); $('#coachWho').textContent = who; $('#coachT').textContent = text; const bx = $('#coachB'); bx.innerHTML = '';
    buttons.forEach((t, i) => { const b = document.createElement('button'); b.textContent = t; b.onclick = e => { e.stopPropagation(); sfx('blip'); el.classList.remove('on'); res(i); }; bx.appendChild(b); });
    el.classList.add('on');
  });
}
async function giveHint() {
  if (!canTouch() || !coachFor(game.turn())) return;
  const fen = game.fen(); coachSay('тренер думает…', 8000);
  const r = await analyse(fen, 12); if (game.fen() !== fen) return;
  hintCache = { fen, r };
  if (!r.best) return coachHide();
  hintMove = uciObj(r.best);
  hintM.visible = true; hintM.position.copy(sqPos(hintMove.to)); hintM.position.y += .025;
  selected = hintMove.from; selM.visible = true; selM.position.copy(sqPos(selected)); selM.position.y += .02; showMoves(game.moves({ square: selected, verbose: true }));
  const pc = game.get(hintMove.from);
  coachSay(`попробуй ${NAME_INS[pc.type]}: ${sanOf(fen, r.best)}`, 6000);
}

function canTouch() {
  if (busy || inCut || ended) return false;
  if (mode === 'hot') return true;
  if (mode === 'ai' || mode === 'online') return game.turn() === mySide;
  if (mode === 'story') return story && story.active && game.turn() === 'w';
  return false;
}

// фразы победы: мешок без повторов (пока не прозвучат все, ни одна не повторится, и не две подряд)
const WIN = {
  w: [['СЮДАА!', 'партия за лагерем. орги идут мыть посуду'], ['С КАЙФОМ!', 'мат, и никто не душнил'], ['СЮДААА!', 'король оргов ушёл в баню думать о жизни'],
      ['ЧЕСС И КАЙФ', 'красиво. номинируем на Rep Awards'], ['ЗАБРАЛИ!', 'чистый мат, даже судья хлопает'], ['СЮДАА, СЮДАА', 'орги уже просят реванш на весенней смене'],
      ['С КАЙФОМ!', 'глинтвейн сегодня за счёт оргов'], ['ВОТ ТАК', 'мат быстрее, чем остыл глинтвейн'], ['КАЙФАРИКИ!', 'эту партию будут пересказывать у костра'],
      ['СЮДАА!', 'двигаешь фигурки как продолжашка со стажем'], ['С КАЙФОМ И С МАТОМ', 'орги ушли совещаться в столовую'], ['ПОБЕДА', 'запишем в протокол и в легенды лагеря']],
  b: [['СЮДАА!', 'орги победили. лагерь отправляется на зарядку'], ['С КАЙФОМ!', 'опыт оргов не пропьёшь даже глинтвейном'], ['ОРГИ ЗНАЮТ', 'кайфарики, это был урок. лекция завтра в 11'],
      ['СЮДААА!', 'мат. кто проиграл, тот моет кружки'], ['ЧЕСС И КАЙФ', 'орги забирают партию и последний пряник'], ['ЗАБРАЛИ!', 'орги сегодня в форме. реванш после бани'],
      ['С КАЙФОМ!', 'главный орг доволен, бейдж сияет'], ['ВОТ ТАК', 'организаторы тоже умеют двигать фигурки'], ['СЮДАА!', 'штаб оргов празднует. тихо, без музлота'],
      ['ПОБЕДА ОРГОВ', 'расписание на завтра не меняется']],
};
function fromBag(key, list) {
  let st = null; try { st = JSON.parse(LS.get('rcBag_' + key) || 'null'); } catch (_) {}
  if (!st || !Array.isArray(st.left) || !st.left.length || st.n !== list.length) {
    const idx = [...list.keys()]; for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
    if (st && idx[0] === st.last && idx.length > 1) [idx[0], idx[1]] = [idx[1], idx[0]];
    st = { left: idx, last: st ? st.last : -1, n: list.length };
  }
  const i = st.left.shift(); st.last = i; LS.set('rcBag_' + key, JSON.stringify(st)); return list[i];
}
let ended = false;
async function endGame(o = {}) {
  if (ended) return; ended = true; clearSave(); coachHide();
  const w = o.winner || (game.in_checkmate() ? (game.turn() === 'w' ? 'b' : 'w') : null);
  let title, sub;
  if (w) {
    const [cry, line] = fromBag(w, WIN[w]);
    title = o.reason === 'resign' ? 'СДАЛИСЬ' : o.reason === 'flag' ? 'ВРЕМЯ ВЫШЛО' : 'МАТ'; sub = line;
    pop(cry, w === 'w' ? C.malina : C.myata);
  }
  else if (o.reason === 'agreed') { title = 'НИЧЬЯ'; sub = pickOne(['по рукам. все в баню', 'ничья по согласию. пошли к костру', 'мир, дружба, глинтвейн']); }
  else if (game.in_stalemate()) { title = 'ПАТ'; sub = 'ничья. все в баню'; }
  else { title = 'НИЧЬЯ'; sub = 'мир, дружба, глинтвейн'; }
  if (w) {
    const k = figs[kingSq(w === 'w' ? 'b' : 'w')];
    if (k) { k.posing = true; await tween(.6, t => k.stand.rotation.x = -1.45 * t, ease.in); burst(k); }
    for (const f of Object.values(figs)) if (f.color === w) { const y0 = f.root.position.y; tween(1.6, t => f.root.position.y = y0 + Math.abs(Math.sin(t * Math.PI * 4)) * .35, ease.lin); }
    stars(V(0, 2, 0), 30);
  }
  const iWon = mode === 'hot' || !w ? null : (w === (mode === 'story' ? 'w' : mySide));
  sfx(iWon === false ? 'lose' : 'win');
  updHud();
  if (mode === 'story') { ended = false; return storyEnd(w === 'w'); }
  if (mode === 'online' && conn) conn.send({ t: 'over' });
  setTimeout(() => showEnd(title, sub), 900);
}

// ---------- ввод ----------
let selected = null;
const ray = new THREE.Raycaster();
function pick(x, y) {
  const ndc = new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  const roots = Object.values(figs).map(f => f.root);
  const cand = new Set();
  for (const h of ray.intersectObjects(roots, true)) { let o = h.object; while (o.parent && !roots.includes(o)) o = o.parent; const f = Object.values(figs).find(f => f.root === o); if (f) cand.add(f.sq); }
  const p = new THREE.Vector3(); let plane = null;
  if (ray.ray.intersectPlane(new THREE.Plane(V(0, 1, 0), -BT), p)) plane = sqAt(p);
  if (plane && figs[plane]) cand.add(plane);
  if (!cand.size) return plane;
  // из всех фигур под пальцем — та, чей «центр» ближе к точке касания
  let best = null, bd = 1e9;
  for (const sq of cand) { const f = figs[sq]; const v = sqPos(sq).add(V(0, .45 * f.scale, 0)).project(cam); const d = Math.hypot((v.x + 1) / 2 * innerWidth - x, (1 - v.y) / 2 * innerHeight - y); if (d < bd) { bd = d; best = sq; } }
  // если палец явно на пустой клетке (ход), а фигуры далеко — берём клетку
  if (plane && !figs[plane] && selected) { const v = sqPos(plane).project(cam); const d = Math.hypot((v.x + 1) / 2 * innerWidth - x, (1 - v.y) / 2 * innerHeight - y); if (d < bd) return plane; }
  return best;
}
function tap(x, y) {
  if (inCut) { skip = true; return; }
  if (!canTouch()) return;
  tapSq(pick(x, y));
}
function tapSq(sq) {
  if (inCut) { skip = true; return; }
  if (!canTouch()) return;
  if (!sq) { selected = null; showMoves([]); selM.visible = false; return; }
  if (selected) {
    const mv = game.moves({ square: selected, verbose: true }).filter(m => m.to === sq);
    if (mv.length) {
      const from = selected; selected = null; selM.visible = false; showMoves([]);
      if (mv[0].flags.includes('p')) return askPromo(game.turn()).then(pr => humanMove({ from, to: sq, promotion: pr }));
      return humanMove({ from, to: sq });
    }
  }
  const pc = game.get(sq);
  const mine = mode === 'hot' || mode === 'story' ? game.turn() : mySide;
  if (pc && pc.color === game.turn() && pc.color === mine) {
    selected = sq; selM.visible = true; selM.position.copy(sqPos(sq)); selM.position.y += .02;
    showMoves(game.moves({ square: sq, verbose: true })); sfx('select');
    const f = figs[sq]; if (f) { const y0 = f.root.position.y; tween(.25, k => f.root.position.y = y0 + Math.sin(k * Math.PI) * .25, ease.lin); }
  } else { if (selected) sfx('deny'); selected = null; selM.visible = false; showMoves([]); }
}
function humanMove(m) {
  if (mode === 'story' && story.check && !story.check(m)) return;
  if (mode === 'online' && conn) conn.send({ t: 'move', ...m, n: game.history().length, tm: clk ? clk[game.turn()] : null });
  return queueMove(m);
}
function askPromo(color) {
  return new Promise(res => {
    const box = $('#promo'); box.classList.add('on');
    box.querySelectorAll('button').forEach(b => b.onclick = () => { box.classList.remove('on'); sfx('blip'); res(b.dataset.p); });
  });
}

// жесты: тап, поворот, зум
const ptrs = new Map(); let drag = 0, pinch0 = 0;
const cv = $('#c');
cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch (_) {} ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }); drag = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } });
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  drag += Math.abs(dx) + Math.abs(dy);
  if (mode === 'title' || cine.k > .01) return;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); goal.dist = Math.min(22, Math.max(5, goal.dist * pinch0 / d)); pinch0 = d; return; }
  if (drag > 8) { goal.th -= dx * .008; goal.ph = Math.min(1.5, Math.max(.2, goal.ph + dy * .006)); top = goal.ph > 1.35; }
});
cv.addEventListener('pointerup', e => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (p && drag < 9 && ptrs.size === 0) onTap(e.clientX, e.clientY); });
cv.addEventListener('pointercancel', e => ptrs.delete(e.pointerId));
cv.addEventListener('wheel', e => { goal.dist = Math.min(22, Math.max(5, goal.dist * (1 + e.deltaY * .001))); }, { passive: true });
function onTap(x, y) { if (mode === 'title') return; if ($('#dialog').classList.contains('on')) return nextLine(); tap(x, y); }

// ---------- интерфейс ----------
function status(t) { $('#status').textContent = t || ''; }
function updHud() {
  const t = game.turn();
  $('#turn').innerHTML = `ход: <b class="${t}">${SIDE[t]}</b>`;
  const who = mode === 'ai' ? `против: ${LEVELS[level].name}` : mode === 'hot' ? 'вдвоём' : mode === 'online' ? (conn ? 'онлайн' : 'онлайн · ждём') : mode === 'story' && story ? story.ch.title : '';
  $('#who').textContent = who;
  status(game.in_check() ? 'шах!' : '');
  $('#undo').style.display = mode === 'ai' || mode === 'hot' ? '' : 'none';
  $('#pDraw').style.display = $('#pResign').style.display = ended ? 'none' : '';
  $('#hintBtn').style.display = !ended && coachFor(mode === 'ai' ? mySide : game.turn()) ? '' : 'none';
  $('#emo').classList.toggle('on', mode === 'online' && !!conn);
  const h = game.history(), n = h.length;
  $('#lastMv').textContent = !n ? '' : n % 2 ? `${(n + 1) / 2}. ${h[n - 1]}` : `${n / 2}. ${h[n - 2]} ${h[n - 1]}`;
  clockTxt = '';
}
// ---------- часы ----------
let clk = null, clockTxt = '';
function makeClock(tc) { if (!tc || tc === 'none') return null; const [m, i] = tc.split('+').map(Number); return { w: m * 60000, b: m * 60000, inc: (i || 0) * 1000, tc }; }
const fmtT = ms => { const x = Math.ceil(Math.max(0, ms) / 1000); return Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0'); };
const isPaused = () => mode !== 'online' && ($('#pause').classList.contains('on') || $('#settings').classList.contains('on') || $('#dialog').classList.contains('on') || !!$('#coachB').children.length && $('#coach').classList.contains('on'));
function tickClock(dt) {
  if (!clk || ended || mode === 'title' || game.history().length < 1 || busy || inCut || isPaused()) return renderClock();
  const c = game.turn(), before = clk[c]; clk[c] -= dt * 1000;
  if (clk[c] < 10000 && Math.ceil(before / 1000) !== Math.ceil(clk[c] / 1000)) sfx('tick');
  if (clk[c] <= 0) {
    clk[c] = 0; sfx('flag');
    if (mode === 'online' && conn) conn.send({ t: 'flag', c });
    endGame({ reason: 'flag', winner: c === 'w' ? 'b' : 'w' });
  }
  renderClock();
}
function renderClock() {
  if (!clk || mode === 'title') { if (clockTxt !== '-') { $('#clock').innerHTML = ''; clockTxt = '-'; } return; }
  const t = game.turn(), cls = c => (!ended && c === t ? 'on' : '') + (clk[c] < 20000 && !ended && c === t ? ' low' : '');
  const html = `<span class="${cls('w')}">${SIDE.w} ${fmtT(clk.w)}</span><span class="${cls('b')}">${SIDE.b} ${fmtT(clk.b)}</span>`;
  if (html !== clockTxt) { $('#clock').innerHTML = html; clockTxt = html; }
}
// ---------- сдаться и ничья ----------
function myColor() { return mode === 'hot' ? game.turn() : mode === 'story' ? 'w' : mySide; }
async function resign() {
  hideAll(); if (ended || mode === 'title') return;
  const loser = myColor();
  const a = await coachAsk(`${SIDE[loser]} сдаются? партия закончится`, ['сдаться', 'играем дальше'], 'судья');
  if (a !== 0 || ended) return;
  if (mode === 'online' && conn) conn.send({ t: 'resign', c: loser });
  endGame({ reason: 'resign', winner: loser === 'w' ? 'b' : 'w' });
}
async function offerDraw() {
  hideAll(); if (ended || mode === 'title') return;
  if (mode === 'hot') {
    const other = game.turn() === 'w' ? 'b' : 'w';
    const a = await coachAsk(`${SIDE[game.turn()]} предлагают ничью. ${SIDE[other]}, согласны?`, ['ничья', 'играем'], 'судья');
    if (a === 0) endGame({ reason: 'agreed' }); return;
  }
  if (mode === 'online') { if (!conn) return; conn.send({ t: 'drawOffer' }); coachSay('предложили ничью. ждём ответ', 6000, 'судья'); return; }
  coachSay('орги совещаются…', 8000, 'судья');
  const r = await analyse(game.fen(), 10); if (ended) return;
  const mine = myColor() === 'w' ? r.cpW : -r.cpW;
  if (game.history().length >= 20 && Math.abs(r.cpW) <= 60) { coachHide(); endGame({ reason: 'agreed' }); }
  else coachSay(mine < -60 ? 'орги отказываются: им тут нравится' : game.history().length < 20 ? 'орги отказываются: рано, двигаем фигурки дальше' : 'орги отказываются: доиграем', 4500, 'судья');
}
// ---------- сохранение партии ----------
const SAVE_KEY = 'rcSave';
function saveGame() { if (!(mode === 'ai' || mode === 'hot') || ended) return; LS.set(SAVE_KEY, JSON.stringify({ mode, pgn: game.pgn(), mySide, level, clk })); }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (_) {} }
function loadSave() { try { const x = JSON.parse(LS.get(SAVE_KEY) || 'null'); return x && x.pgn !== undefined ? x : null; } catch (_) { return null; } }
function renderContinue() {
  const sv = loadSave(), b = $('#continueBtn'); if (!sv) { b.style.display = 'none'; return; }
  const c = new Chess(); if (sv.pgn) c.load_pgn(sv.pgn); const n = c.history().length;
  if (!n) { b.style.display = 'none'; return; }
  b.style.display = ''; $('#continueInfo').textContent = (sv.mode === 'ai' ? `против: ${LEVELS[sv.level].name}` : 'вдвоём') + ` · ход ${Math.ceil(n / 2)}`;
}
function pauseOpen() {
  if (mode === 'title') return;
  if (!$('#coachB').children.length) coachHide();
  const h = game.history(); let html = '';
  for (let i = 0; i < h.length; i += 2) html += `<div><i>${i / 2 + 1}.</i>${h[i]} ${h[i + 1] || ''}</div>`;
  $('#moves').innerHTML = html; $('#pTop').textContent = top ? 'вид 3D' : 'вид сверху'; $('#pMini').textContent = 'схема доски: ' + (SET.mini ? 'да' : 'нет');
  updHud(); show('pause'); const mv = $('#moves'); mv.scrollTop = mv.scrollHeight;
}
function show(id) { document.querySelectorAll('.panel').forEach(p => p.classList.toggle('on', p.id === id)); }
function hideAll() { document.querySelectorAll('.panel').forEach(p => p.classList.remove('on')); }
function showEnd(title, sub) { $('#endT').textContent = title; $('#endS').textContent = sub; show('end'); }

function startGame(m, opts = {}) {
  mode = m; auto = false; hideAll(); $('#hud').classList.add('on'); $('#title').classList.remove('on');
  game = new Chess(opts.fen); if (opts.pgn) game.load_pgn(opts.pgn); rebuild(); world.dark = opts.dark || 0;
  ended = false; fullShown = 0; clk = opts.clk ? { ...opts.clk } : makeClock(opts.tc); clockTxt = '';
  if (AU.setTrack) AU.setTrack(opts.dark ? 'night' : 'game');
  if (m === 'ai') { mySide = opts.side || 'w'; level = opts.level ?? level; }
  Object.assign(goal, { tx: 0, ty: .2, tz: .4 });
  setView(m === 'hot' ? game.turn() : mySide);
  hintMove = null; hintM.visible = false; hanging = []; hintCache = null; coachHide();
  updHud();
  if (m === 'ai' && game.turn() !== mySide) setTimeout(aiTurn, 600);
  if ((m === 'ai' || m === 'hot') && !SET.tutDone) { SET.tutDone = true; saveSet(); setTimeout(() => say(TUTOR.concat(SET.coach ? [TUTOR_COACH] : [])), 700); }
  saveGame();
}
const TUTOR = [['тренер', 'привет! тапни свою фигуру — она подпрыгнет, а клетки, куда можно пойти, загорятся'], ['тренер', 'потом тапни нужную клетку. ходить можно и по схеме внизу, так даже точнее'], ['тренер', 'доску крути пальцем, «вид» меняет ракурс. в «паузе» — список ходов, ничья, сдаться и настройки']];
const TUTOR_COACH = ['тренер', 'если зевнёшь фигуру, я скажу и дам вернуть ход. «подсказка» покажет хороший ход. выключить меня можно в настройках'];
let fullShown = 0;
function toMenu() {
  mode = 'title'; auto = true; chain = Promise.resolve(); busy = false; inCut = false; skip = false; cine.k = 0; story = null;
  Object.assign(goal, { ph: .32, dist: 15, ty: 1 }); top = false;
  $('#hud').classList.remove('on'); $('#dialog').classList.remove('on'); coachHide(); show('menu'); renderContinue();
  if (AU.setTrack) AU.setTrack('menu');
}

// меню
const bind = (sel, fn) => $(sel).addEventListener('click', e => { e.stopPropagation(); sfx('blip'); fn(e); });
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { sfx('blip'); const go = b.dataset.go === 'menu' && mode !== 'title' ? 'pause' : b.dataset.go; if (go === 'pause') return pauseOpen(); show(go); if (go === 'story') renderStory(); }));
document.querySelectorAll('.row.tc button').forEach(b => b.addEventListener('click', () => { sfx('blip'); b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); }));
const tcOf = panel => { const b = $(`#${panel} .row.tc .sel`); return b ? b.dataset.tc : 'none'; };
document.querySelectorAll('[data-lvl]').forEach(b => b.addEventListener('click', () => { sfx('blip'); level = +b.dataset.lvl; startGame('ai', { level, side: $('#sideB').classList.contains('sel') ? 'b' : 'w', tc: tcOf('ai') }); }));
bind('#sideW', () => { $('#sideW').classList.add('sel'); $('#sideB').classList.remove('sel'); });
bind('#sideB', () => { $('#sideB').classList.add('sel'); $('#sideW').classList.remove('sel'); });
bind('#hot', () => startGame('hot', { tc: tcOf('hotset') }));
bind('#menuBtn', () => pauseOpen());
bind('#pResume', () => hideAll());
bind('#pExit', () => { if (mode === 'online' && conn) conn.send({ t: 'bye' }); if (mode === 'online') closeRelay(); toMenu(); });
bind('#pTop', () => { hideAll(); top ? setView(mode === 'hot' ? game.turn() : mySide) : setView('top'); });
bind('#pMini', () => { SET.mini = !SET.mini; saveSet(); pauseOpen(); });
bind('#pResign', () => resign());
bind('#pDraw', () => offerDraw());
bind('#continueBtn', () => { const sv = loadSave(); if (!sv) return; startGame(sv.mode, { level: sv.level, side: sv.mySide, pgn: sv.pgn, clk: sv.clk }); if (sv.mode === 'ai' && game.turn() !== mySide && !game.game_over()) setTimeout(aiTurn, 600); });
const EMO = { sudaa: 'СЮДАА', skaifom: 'С КАЙФОМ!', oi: 'ОЙ', gg: 'GG' }; let emoT = 0;
document.querySelectorAll('#emo button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); if (performance.now() - emoT < 1500 || !conn) return; emoT = performance.now(); conn.send({ t: 'emo', e: b.dataset.e }); pop(EMO[b.dataset.e], C.limonad); }));
bind('#viewBtn', () => { const seq = ['w', 'side', 'b', 'side']; viewI = (viewI + 1) % 4; setView(seq[viewI]); });
bind('#undo', () => { hideAll(); if (busy || ended) return; if (mode === 'ai') { game.undo(); if (game.turn() !== mySide) game.undo(); } else game.undo(); hintMove = null; hintM.visible = false; coachHide(); rebuild(); updHud(); viewForTurn(); refreshHanging(); });
bind('#hintBtn', () => giveHint());
bind('#again', () => { const tc = clk ? clk.tc : 'none'; if (mode === 'online') { conn && conn.send({ t: 'again', tc }); startGame('online', { tc }); return; } startGame(mode, { level, side: mySide, tc }); });
bind('#endMenu', () => toMenu());
let viewI = 0;

// настройки
function renderSet() {
  const t = (id, on, txt) => { const b = $(id); b.textContent = txt; b.classList.toggle('sel', !!on); };
  t('#sGfx', true, 'графика: ' + (SET.gfx === 'ps1' ? 'PS1 · дрожит и пикселит' : 'N64 · мягко и в тумане'));
  t('#sCrt', SET.crt, 'старый телевизор: ' + (SET.crt ? 'да' : 'нет'));
  t('#sSharp', true, 'пиксели: ' + (SET.sharp === 240 ? 'крупные' : 'помельче'));
  t('#sScenes', SET.scenes, 'сценки взятий: ' + (SET.scenes ? 'да' : 'нет'));
  t('#sCoach', SET.coach, 'тренер для начинашек: ' + (SET.coach ? 'да' : 'нет'));
  t('#sFlip', SET.flip, 'вдвоём доска поворачивается: ' + (SET.flip ? 'да' : 'нет'));
  t('#sMusic', SET.music, 'музыка: ' + (SET.music ? 'да' : 'нет'));
  t('#sSfx', SET.sfx, 'звуки: ' + (SET.sfx ? 'да' : 'нет'));
}
const tog = (id, fn) => bind(id, () => { fn(); saveSet(); applySet(); renderSet(); });
tog('#sGfx', () => SET.gfx = SET.gfx === 'ps1' ? 'n64' : 'ps1');
tog('#sCrt', () => SET.crt = !SET.crt);
tog('#sSharp', () => SET.sharp = SET.sharp === 240 ? 360 : 240);
tog('#sScenes', () => SET.scenes = !SET.scenes);
tog('#sFlip', () => SET.flip = !SET.flip);
tog('#sCoach', () => SET.coach = !SET.coach);
tog('#sMusic', () => SET.music = !SET.music);
tog('#sSfx', () => SET.sfx = !SET.sfx);
renderSet();

// ---------- онлайн (ходы через открытый ретранслятор ntfy.sh: работает через любой NAT, без регистрации) ----------
const RELAY = 'https://ntfy.sh/';
const myId = Math.random().toString(36).slice(2, 10);
let conn = null, relay = null, helloT = null;
function openRelay(topic, onMsg, onOpen, onFail) {
  closeRelay();
  let es, opened = false, lastId = null, retry = null; const seen = new Set();
  const connect = () => {
    try { es = new EventSource(RELAY + topic + '/sse' + (lastId ? '?since=' + lastId : '')); } catch (_) { onFail(); return; }
    es.onopen = () => { if (!opened) { opened = true; onOpen(); } else { status(''); if (conn) relay.send({ t: 'sync?', n: game.history().length }); } };
    es.onmessage = e => { try { const d = JSON.parse(e.data); if (d.event !== 'message' || seen.has(d.id)) return; seen.add(d.id); lastId = d.id; const m = JSON.parse(d.message); if (m.who !== myId) onMsg(m); } catch (_) {} };
    es.onerror = () => {
      es.close();
      if (!opened) return onFail();
      if (!relay) return;
      status('связь моргнула, переподключаемся…'); clearTimeout(retry); retry = setTimeout(() => relay && connect(), 1500);
    };
  };
  connect();
  relay = { topic, send: o => fetch(RELAY + topic, { method: 'POST', body: JSON.stringify({ ...o, who: myId }) }).catch(() => status('сообщение не ушло, проверь интернет')), close() { clearTimeout(retry); es && es.close(); } };
  return relay;
}
function closeRelay() { clearInterval(helloT); if (relay) relay.close(); relay = null; conn = null; }
const noNet = () => { $('#onState').textContent = 'онлайн тут не работает: страница не пускает в интернет. открой игру по ссылке easemylove.github.io/repcamp-chess'; };
function onlineMsg(d) {
  if (d.t === 'start') { clearInterval(helloT); conn = relay; startGame('online', { tc: d.tc }); mySide = 'b'; setView('b'); updHud(); pop('ПОЕХАЛИ', C.myata); }
  if (d.t === 'move') chain = chain.then(() => {
    const n = game.history().length;
    if (d.n !== undefined && d.n < n) return;                        // уже было
    if (d.n !== undefined && d.n > n) { conn && conn.send({ t: 'sync?', n }); return; }   // пропустили ход — просим всю партию
    if (clk && d.tm != null) clk[game.turn()] = d.tm;
    return doMove({ from: d.from, to: d.to, promotion: d.promotion });
  }).catch(e => console.error(e));
  if (d.t === 'sync?' && conn && game.history().length > (d.n || 0)) conn.send({ t: 'state', pgn: game.pgn(), clk });
  if (d.t === 'state') { const c = new Chess(); if (c.load_pgn(d.pgn) && c.history().length > game.history().length) { game = c; if (d.clk) clk = d.clk; rebuild(); updHud(); if (game.game_over()) endGame(); } }
  if (d.t === 'again') { startGame('online', { tc: d.tc }); updHud(); }
  if (d.t === 'emo' && EMO[d.e]) pop(EMO[d.e], C.limonad);
  if (d.t === 'resign') endGame({ reason: 'resign', winner: d.c === 'w' ? 'b' : 'w' });
  if (d.t === 'flag') { if (clk) clk[d.c] = 0; endGame({ reason: 'flag', winner: d.c === 'w' ? 'b' : 'w' }); }
  if (d.t === 'drawOffer') coachAsk('соперник предлагает ничью', ['ничья', 'играем'], 'судья').then(a => { conn && conn.send({ t: 'drawAns', ok: a === 0 }); if (a === 0) endGame({ reason: 'agreed' }); });
  if (d.t === 'drawAns') { if (d.ok) { coachHide(); endGame({ reason: 'agreed' }); } else coachSay('соперник хочет доиграть', 3500, 'судья'); }
  if (d.t === 'bye') { status('соперник вышел'); pop('СОПЕРНИК УШЁЛ', C.limonad); conn = null; updHud(); }
}
let guestId = null;
let hostTc = 'none';
function hostOnline() {
  hostTc = tcOf('online');
  const code = Math.random().toString(36).slice(2, 7);
  show('online'); $('#onState').textContent = 'открываем комнату…'; $('#onLink').value = ''; guestId = null;
  openRelay('repcamp-' + code, d => {
    if (d.t === 'hello') {
      if (!guestId) { guestId = d.who; conn = relay; mySide = 'w'; startGame('online', { tc: hostTc }); mySide = 'w'; setView('w'); updHud(); pop('ПОЕХАЛИ', C.malina); }
      if (d.who === guestId) relay.send({ t: 'start', tc: clk ? clk.tc : 'none' });
      return;
    }
    if (d.who === guestId) onlineMsg(d);
  }, () => {
    $('#onLink').value = location.origin + location.pathname + '?join=' + code;
    $('#onState').textContent = 'кинь ссылку другу. ты играешь за лагерь, игра начнётся, когда он зайдёт';
  }, noNet);
}
function joinOnline(code) {
  show('online'); $('#onState').textContent = 'подключаемся к другу…'; $('#onLink').value = '';
  let tries = 0;
  openRelay('repcamp-' + code, d => { if (d.t === 'start' && conn) return; onlineMsg(d); }, () => {
    const hello = () => { if (conn) return clearInterval(helloT); if (++tries > 20) { clearInterval(helloT); $('#onState').textContent = 'друг не отвечает. пусть откроет комнату заново и пришлёт новую ссылку'; return; } relay.send({ t: 'hello' }); };
    hello(); helloT = setInterval(hello, 2500);
  }, noNet);
}
bind('#onHost', hostOnline);
bind('#onCopy', () => { const v = $('#onLink').value; if (!v) return; if (navigator.share) navigator.share({ title: 'Rep Camp Chess', text: 'го партию: лагерь против оргов', url: v }).catch(() => {}); else navigator.clipboard.writeText(v).then(() => $('#onState').textContent = 'ссылка скопирована'); });

// ---------- сюжет ----------
let story = null;
const progress = () => +(LS.get('rcStory') || 0);
function renderStory() {
  $('#passport').innerHTML = CHAPTERS.map((ch, i) => i < progress() ? `<div class="st ok" style="--r:${(i * 37) % 21 - 10}deg" title="${ch.title}"><img src="data:image/png;base64,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" alt=""></div>` : `<div class="st">${ch.time}</div>`).join('');
  const box = $('#chapters'); box.innerHTML = '';
  CHAPTERS.forEach((ch, i) => {
    const b = document.createElement('button'); const open = i <= progress();
    b.innerHTML = `<span class="time">${ch.time}</span>${open ? ch.title : '· · ·'}${i < progress() ? ' <span class="ok">✓</span>' : ''}`;
    b.disabled = !open; b.onclick = () => { sfx('blip'); startChapter(i); };
    box.appendChild(b);
  });
}
let lines = [], lineCb = null, typing = null;
function say(arr) { return new Promise(res => { lines = arr.slice(); lineCb = res; $('#dialog').classList.add('on'); nextLine(); }); }
function nextLine() {
  if (typing) { clearInterval(typing.id); $('#dText').textContent = typing.full; typing = null; return; }
  const l = lines.shift();
  if (!l) { $('#dialog').classList.remove('on'); const c = lineCb; lineCb = null; c && c(); return; }
  const [who, text] = l; $('#dWho').textContent = who; $('#dText').textContent = '';
  let i = 0; typing = { full: text, id: setInterval(() => { i++; $('#dText').textContent = text.slice(0, i); if (i % 2) sfx('talk'); if (i >= text.length) { clearInterval(typing.id); typing = null; } }, 28) };
}
$('#dialog').addEventListener('click', e => { e.stopPropagation(); nextLine(); });

async function startChapter(i) {
  const ch = CHAPTERS[i];
  story = { i, ch, active: false };
  if (ch.kind === 'puzzle') {
    const pz = preparePuzzle(ch.puzzle, Chess);
    startGame('story', { fen: pz.fen, dark: ch.dark });
    story.pz = pz; story.step = 0;
    story.check = m => {
      const want = pz.solution[story.step]; const uci = m.from + m.to + (m.promotion || '');
      const t = new Chess(game.fen()); const r = t.move({ ...m, promotion: m.promotion || 'q' });
      if (uci === want || uci + 'q' === want || (r && t.in_checkmate())) return true;
      sfx('deny'); pop('МИМО', C.limonad); status('не то. подумай ещё'); selected = null; return false;
    };
  } else {
    startGame('story', { dark: ch.dark }); story.check = null;
  }
  updHud();
  await say(ch.intro);
  story.active = true; status(ch.goal);
  if (ch.kind === 'puzzle' && game.turn() !== 'w') story.active = false;
}
async function storyAfter(mv) {
  if (!story) return;
  if (story.ch.kind === 'game') { if (game.turn() === 'b' && !game.game_over()) { level = story.ch.level; story.active = false; await aiTurn(); story.active = true; } return; }
  if (mv.color !== 'w') return;
  story.step++;
  if (game.in_checkmate() || story.step >= story.pz.solution.length) return storyWin();
  const reply = story.pz.solution[story.step]; story.step++; story.active = false;
  await new Promise(r => setTimeout(r, 500));
  await queueMove({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
  if (story.step >= story.pz.solution.length) return storyWin();
  story.active = true; status('ещё ход');
}
function storyEnd(won) { if (won) storyWin(); else setTimeout(async () => { await say(story.ch.lose); startChapter(story.i); }, 1200); }
async function storyWin() {
  if (!story || story.done) return; story.done = true; story.active = false;
  await new Promise(r => setTimeout(r, 900));
  sfx('win'); stars(V(0, 2, 0), 24); pop(pickOne(CRY), C.malina);
  if (progress() <= story.i) LS.set('rcStory', story.i + 1);
  await say(story.ch.outro);
  if (story.i + 1 < CHAPTERS.length) { startChapter(story.i + 1); }
  else { showEnd('КУБОК СМЕНЫ', 'ты прошёл весь лагерь. весной — заново'); }
}

// ---------- зрители у костра ----------
function crowd() {
  const spots = [[-1.8, -.8], [1.6, -1.2], [-.5, 1.9], [1.9, 1.1], [-2, .9]];
  spots.forEach(([dx, dz], i) => {
    const f = makePiece('p', i % 2 ? 'b' : 'w', 100 + i); const p = V(world.fire.x + dx, 0, world.fire.z + dz);
    f.root.position.copy(p); f.root.rotation.y = Math.atan2(world.fire.x - p.x, world.fire.z - p.z); f.disc.visible = false; scene.add(f.root); spectators.push(f);
  });
  for (const [x, z] of [[-2, -11.5], [2.4, -11.8]]) { const f = makePiece('p', 'w', 200 + x); f.root.position.set(x, 0, z); f.root.rotation.y = 0; f.disc.visible = false; scene.add(f.root); spectators.push(f); }
}
crowd();

// ---------- титул ----------
function begin() {
  initAudio(); applySet(); if (AU.preloadVoices && VOICES.length) AU.preloadVoices(VOICES);
  $('#title').classList.remove('on');
  const j = new URLSearchParams(location.search).get('join');
  if (j) { history.replaceState(null, '', location.pathname); mode = 'online'; joinOnline(j); } else toMenu();
}
$('#title').addEventListener('click', begin);
addEventListener('keydown', e => {
  if (mode === 'title' && $('#title').classList.contains('on') && (e.key === 'Enter' || e.key === ' ')) begin();
  if (e.key === 'Escape' && mode !== 'title') { $('#pause').classList.contains('on') ? hideAll() : pauseOpen(); }
  if ($('#dialog').classList.contains('on') && (e.key === 'Enter' || e.key === ' ')) nextLine();
});
auto = true; Object.assign(orbit, { th: .6, ph: .32, dist: 15, ty: 1 }); Object.assign(goal, orbit);
rebuild();


// ---------- схема доски (2D, в углу) ----------
// фигуры lichess (cburnett, Colin M.L. Burnett, GPLv2+)
const PIECE_URL = {
  wp: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJjb2xvci1zY2hlbWU6bGlnaHQgb25seSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1IiB2aWV3Qm94PSIwIDAgNDUgNDUiPjxwYXRoIGZpbGw9IiNmZmYiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuNSIgZD0iTTIyLjUgOWMtMi4yMSAwLTQgMS43OS00IDQgMCAuODkuMjkgMS43MS43OCAyLjM4QzE3LjMzIDE2LjUgMTYgMTguNTkgMTYgMjFjMCAyLjAzLjk0IDMuODQgMi40MSA1LjAzLTMgMS4wNi03LjQxIDUuNTUtNy40MSAxMy40N2gyM2MwLTcuOTItNC40MS0xMi40MS03LjQxLTEzLjQ3IDEuNDctMS4xOSAyLjQxLTMgMi40MS01LjAzIDAtMi40MS0xLjMzLTQuNS0zLjI4LTUuNjIuNDktLjY3Ljc4LTEuNDkuNzgtMi4zOCAwLTIuMjEtMS43OS00LTQtNHoiLz48L3N2Zz4=', wn: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJjb2xvci1zY2hlbWU6bGlnaHQgb25seSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1IiB2aWV3Qm94PSIwIDAgNDUgNDUiPjxnIGZpbGw9Im5vbmUiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMS41Ij48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMjIgMTBjMTAuNSAxIDE2LjUgOCAxNiAyOUgxNWMwLTkgMTAtNi41IDgtMjEiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMjQgMThjLjM4IDIuOTEtNS41NSA3LjM3LTggOS0zIDItMi44MiA0LjM0LTUgNC0xLjA0Mi0uOTQgMS40MS0zLjA0IDAtMy0xIDAgLjE5IDEuMjMtMSAyLTEgMC00LjAwMyAxLTQtNCAwLTIgNi0xMiA2LTEyczEuODktMS45IDItMy41Yy0uNzMtLjk5NC0uNS0yLS41LTMgMS0xIDMgMi41IDMgMi41aDJzLjc4LTEuOTkyIDIuNS0zYzEgMCAxIDMgMSAzIi8+PHBhdGggZmlsbD0iIzAwMCIgZD0iTTkuNSAyNS41YS41LjUgMCAxIDEtMSAwIC41LjUgMCAxIDEgMSAwbTUuNDMzLTkuNzVhLjUgMS41IDMwIDEgMS0uODY2LS41LjUgMS41IDMwIDEgMSAuODY2LjUiLz48L2c+PC9zdmc+', wb: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJjb2xvci1zY2hlbWU6bGlnaHQgb25seSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1IiB2aWV3Qm94PSIwIDAgNDUgNDUiPjxnIGZpbGw9Im5vbmUiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMS41Ij48ZyBmaWxsPSIjZmZmIiBzdHJva2UtbGluZWNhcD0iYnV0dCI+PHBhdGggZD0iTTkgMzZjMy4zOS0uOTcgMTAuMTEuNDMgMTMuNS0yIDMuMzkgMi40MyAxMC4xMSAxLjAzIDEzLjUgMiAwIDAgMS42NS41NCAzIDItLjY4Ljk3LTEuNjUuOTktMyAuNS0zLjM5LS45Ny0xMC4xMS40Ni0xMy41LTEtMy4zOSAxLjQ2LTEwLjExLjAzLTEzLjUgMS0xLjM1LjQ5LTIuMzIuNDctMy0uNSAxLjM1LTEuOTQgMy0yIDMtMnoiLz48cGF0aCBkPSJNMTUgMzJjMi41IDIuNSAxMi41IDIuNSAxNSAwIC41LTEuNSAwLTIgMC0yIDAtMi41LTIuNS00LTIuNS00IDUuNS0xLjUgNi0xMS41LTUtMTUuNS0xMSA0LTEwLjUgMTQtNSAxNS41IDAgMC0yLjUgMS41LTIuNSA0IDAgMC0uNS41IDAgMnoiLz48cGF0aCBkPSJNMjUgOGEyLjUgMi41IDAgMSAxLTUgMCAyLjUgMi41IDAgMSAxIDUgMHoiLz48L2c+PHBhdGggc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIgZD0iTTE3LjUgMjZoMTBNMTUgMzBoMTVtLTcuNS0xNC41djVNMjAgMThoNSIvPjwvZz48L3N2Zz4=', wr: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJjb2xvci1zY2hlbWU6bGlnaHQgb25seSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1IiB2aWV3Qm94PSIwIDAgNDUgNDUiPjxnIGZpbGw9IiNmZmYiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMS41Ij48cGF0aCBzdHJva2UtbGluZWNhcD0iYnV0dCIgZD0iTTkgMzloMjd2LTNIOXptMy0zdi00aDIxdjR6bS0xLTIyVjloNHYyaDVWOWg1djJoNVY5aDR2NSIvPjxwYXRoIGQ9Im0zNCAxNC0zIDNIMTRsLTMtMyIvPjxwYXRoIHN0cm9rZS1saW5lY2FwPSJidXR0IiBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBkPSJNMzEgMTd2MTIuNUgxNFYxNyIvPjxwYXRoIGQ9Im0zMSAyOS41IDEuNSAyLjVoLTIwbDEuNS0yLjUiLz48cGF0aCBmaWxsPSJub25lIiBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBkPSJNMTEgMTRoMjMiLz48L2c+PC9zdmc+', wq: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJjb2xvci1zY2hlbWU6bGlnaHQgb25seSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1IiB2aWV3Qm94PSIwIDAgNDUgNDUiPjxnIGZpbGw9IiNmZmYiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMS41Ij48cGF0aCBkPSJNOCAxMmEyIDIgMCAxIDEtNCAwIDIgMiAwIDEgMSA0IDBtMTYuNS00LjVhMiAyIDAgMSAxLTQgMCAyIDIgMCAxIDEgNCAwTTQxIDEyYTIgMiAwIDEgMS00IDAgMiAyIDAgMSAxIDQgME0xNiA4LjVhMiAyIDAgMSAxLTQgMCAyIDIgMCAxIDEgNCAwTTMzIDlhMiAyIDAgMSAxLTQgMCAyIDIgMCAxIDEgNCAwIi8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9ImJ1dHQiIGQ9Ik05IDI2YzguNS0xLjUgMjEtMS41IDI3IDBsMi0xMi03IDExVjExbC01LjUgMTMuNS0zLTE1LTMgMTUtNS41LTE0VjI1TDcgMTR6Ii8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9ImJ1dHQiIGQ9Ik05IDI2YzAgMiAxLjUgMiAyLjUgNCAxIDEuNSAxIDEgLjUgMy41LTEuNSAxLTEuNSAyLjUtMS41IDIuNS0xLjUgMS41LjUgMi41LjUgMi41IDYuNSAxIDE2LjUgMSAyMyAwIDAgMCAxLjUtMSAwLTIuNSAwIDAgLjUtMS41LTEtMi41LS41LTIuNS0uNS0yIC41LTMuNSAxLTIgMi41LTIgMi41LTQtOC41LTEuNS0xOC41LTEuNS0yNyAweiIvPjxwYXRoIGZpbGw9Im5vbmUiIGQ9Ik0xMS41IDMwYzMuNS0xIDE4LjUtMSAyMiAwTTEyIDMzLjVjNi0xIDE1LTEgMjEgMCIvPjwvZz48L3N2Zz4=', wk: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJjb2xvci1zY2hlbWU6bGlnaHQgb25seSIgdmlld0JveD0iMCAwIDQ1IDQ1Ij48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuNSI+PHBhdGggc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIgZD0iTTIyLjUgMTEuNjNWNk0yMCA4aDUiLz48cGF0aCBmaWxsPSIjZmZmIiBzdHJva2UtbGluZWNhcD0iYnV0dCIgc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIgZD0iTTIyLjUgMjVzNC41LTcuNSAzLTEwLjVjMCAwLTEtMi41LTMtMi41cy0zIDIuNS0zIDIuNWMtMS41IDMgMyAxMC41IDMgMTAuNSIvPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0xMS41IDM3YzUuNSAzLjUgMTUuNSAzLjUgMjEgMHYtN3M5LTQuNSA2LTEwLjVjLTQtNi41LTEzLjUtMy41LTE2IDRWMjd2LTMuNWMtMy41LTcuNS0xMy0xMC41LTE2LTQtMyA2IDUgMTAgNSAxMHoiLz48cGF0aCBkPSJNMTEuNSAzMGM1LjUtMyAxNS41LTMgMjEgMG0tMjEgMy41YzUuNS0zIDE1LjUtMyAyMSAwbS0yMSAzLjVjNS41LTMgMTUuNS0zIDIxIDAiLz48L2c+PC9zdmc+',
  bp: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJjb2xvci1zY2hlbWU6bGlnaHQgb25seSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1IiB2aWV3Qm94PSIwIDAgNDUgNDUiPjxwYXRoIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuNSIgZD0iTTIyLjUgOWE0IDQgMCAwIDAtMy4yMiA2LjM4IDYuNDggNi40OCAwIDAgMC0uODcgMTAuNjVjLTMgMS4wNi03LjQxIDUuNTUtNy40MSAxMy40N2gyM2MwLTcuOTItNC40MS0xMi40MS03LjQxLTEzLjQ3YTYuNDYgNi40NiAwIDAgMC0uODctMTAuNjVBNC4wMSA0LjAxIDAgMCAwIDIyLjUgOXoiLz48L3N2Zz4=', bn: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJjb2xvci1zY2hlbWU6bGlnaHQgb25seSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1IiB2aWV3Qm94PSIwIDAgNDUgNDUiPjxnIGZpbGw9Im5vbmUiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMS41Ij48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMjIgMTBjMTAuNSAxIDE2LjUgOCAxNiAyOUgxNWMwLTkgMTAtNi41IDgtMjEiLz48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMjQgMThjLjM4IDIuOTEtNS41NSA3LjM3LTggOS0zIDItMi44MiA0LjM0LTUgNC0xLjA0LS45NCAxLjQxLTMuMDQgMC0zLTEgMCAuMTkgMS4yMy0xIDItMSAwLTQgMS00LTQgMC0yIDYtMTIgNi0xMnMxLjg5LTEuOSAyLTMuNWMtLjczLTEtLjUtMi0uNS0zIDEtMSAzIDIuNSAzIDIuNWgycy43OC0yIDIuNS0zYzEgMCAxIDMgMSAzIi8+PHBhdGggZmlsbD0iI2VjZWNlYyIgc3Ryb2tlPSIjZWNlY2VjIiBkPSJNOS41IDI1LjVhLjUuNSAwIDEgMS0xIDAgLjUuNSAwIDEgMSAxIDBtNS40My05Ljc1YS41IDEuNSAzMCAxIDEtLjg2LS41LjUgMS41IDMwIDEgMSAuODYuNSIvPjxwYXRoIGZpbGw9IiNlY2VjZWMiIHN0cm9rZT0ibm9uZSIgZD0ibTI0LjU1IDEwLjQtLjQ1IDEuNDUuNS4xNWMzLjE1IDEgNS42NSAyLjQ5IDcuOSA2Ljc1UzM1Ljc1IDI5LjA2IDM1LjI1IDM5bC0uMDUuNWgyLjI1bC4wNS0uNWMuNS0xMC4wNi0uODgtMTYuODUtMy4yNS0yMS4zNHMtNS43OS02LjY0LTkuMTktNy4xNnoiLz48L2c+PC9zdmc+', bb: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJjb2xvci1zY2hlbWU6bGlnaHQgb25seSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1IiB2aWV3Qm94PSIwIDAgNDUgNDUiPjxnIGZpbGw9Im5vbmUiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMS41Ij48ZyBmaWxsPSIjMDAwIiBzdHJva2UtbGluZWNhcD0iYnV0dCI+PHBhdGggZD0iTTkgMzZjMy40LTEgMTAuMS40IDEzLjUtMiAzLjQgMi40IDEwLjEgMSAxMy41IDIgMCAwIDEuNi41IDMgMi0uNyAxLTEuNiAxLTMgLjUtMy40LTEtMTAuMS41LTEzLjUtMS0zLjQgMS41LTEwLjEgMC0xMy41IDEtMS40LjUtMi4zLjUtMy0uNSAxLjQtMiAzLTIgMy0yeiIvPjxwYXRoIGQ9Ik0xNSAzMmMyLjUgMi41IDEyLjUgMi41IDE1IDAgLjUtMS41IDAtMiAwLTIgMC0yLjUtMi41LTQtMi41LTQgNS41LTEuNSA2LTExLjUtNS0xNS41LTExIDQtMTAuNSAxNC01IDE1LjUgMCAwLTIuNSAxLjUtMi41IDQgMCAwLS41LjUgMCAyeiIvPjxwYXRoIGQ9Ik0yNSA4YTIuNSAyLjUgMCAxIDEtNSAwIDIuNSAyLjUgMCAxIDEgNSAweiIvPjwvZz48cGF0aCBzdHJva2U9IiNlY2VjZWMiIHN0cm9rZS1saW5lam9pbj0ibWl0ZXIiIGQ9Ik0xNy41IDI2aDEwTTE1IDMwaDE1bS03LjUtMTQuNXY1TTIwIDE4aDUiLz48L2c+PC9zdmc+', br: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJjb2xvci1zY2hlbWU6bGlnaHQgb25seSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1IiB2aWV3Qm94PSIwIDAgNDUgNDUiPjxnIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMS41Ij48cGF0aCBzdHJva2UtbGluZWNhcD0iYnV0dCIgZD0iTTkgMzloMjd2LTNIOXptMy41LTcgMS41LTIuNWgxN2wxLjUgMi41em0tLjUgNHYtNGgyMXY0eiIvPjxwYXRoIHN0cm9rZS1saW5lY2FwPSJidXR0IiBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBkPSJNMTQgMjkuNXYtMTNoMTd2MTN6Ii8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9ImJ1dHQiIGQ9Ik0xNCAxNi41IDExIDE0aDIzbC0zIDIuNXpNMTEgMTRWOWg0djJoNVY5aDV2Mmg1VjloNHY1eiIvPjxwYXRoIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2VjZWNlYyIgc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIgc3Ryb2tlLXdpZHRoPSIxIiBkPSJNMTIgMzUuNWgyMW0tMjAtNGgxOW0tMTgtMmgxN20tMTctMTNoMTdNMTEgMTRoMjMiLz48L2c+PC9zdmc+', bq: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJjb2xvci1zY2hlbWU6bGlnaHQgb25seSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1IiB2aWV3Qm94PSIwIDAgNDUgNDUiPjxnIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMS41Ij48ZyBzdHJva2U9Im5vbmUiPjxjaXJjbGUgY3g9IjYiIGN5PSIxMiIgcj0iMi43NSIvPjxjaXJjbGUgY3g9IjE0IiBjeT0iOSIgcj0iMi43NSIvPjxjaXJjbGUgY3g9IjIyLjUiIGN5PSI4IiByPSIyLjc1Ii8+PGNpcmNsZSBjeD0iMzEiIGN5PSI5IiByPSIyLjc1Ii8+PGNpcmNsZSBjeD0iMzkiIGN5PSIxMiIgcj0iMi43NSIvPjwvZz48cGF0aCBzdHJva2UtbGluZWNhcD0iYnV0dCIgZD0iTTkgMjZjOC41LTEuNSAyMS0xLjUgMjcgMGwyLjUtMTIuNUwzMSAyNWwtLjMtMTQuMS01LjIgMTMuNi0zLTE0LjUtMyAxNC41LTUuMi0xMy42TDE0IDI1IDYuNSAxMy41eiIvPjxwYXRoIHN0cm9rZS1saW5lY2FwPSJidXR0IiBkPSJNOSAyNmMwIDIgMS41IDIgMi41IDQgMSAxLjUgMSAxIC41IDMuNS0xLjUgMS0xLjUgMi41LTEuNSAyLjUtMS41IDEuNS41IDIuNS41IDIuNSA2LjUgMSAxNi41IDEgMjMgMCAwIDAgMS41LTEgMC0yLjUgMCAwIC41LTEuNS0xLTIuNS0uNS0yLjUtLjUtMiAuNS0zLjUgMS0yIDIuNS0yIDIuNS00LTguNS0xLjUtMTguNS0xLjUtMjcgMHoiLz48cGF0aCBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0iYnV0dCIgZD0iTTExIDM4LjVhMzUgMzUgMSAwIDAgMjMgMCIvPjxwYXRoIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2VjZWNlYyIgZD0iTTExIDI5YTM1IDM1IDEgMCAxIDIzIDBtLTIxLjUgMi41aDIwbS0yMSAzYTM1IDM1IDEgMCAwIDIyIDBtLTIzIDNhMzUgMzUgMSAwIDAgMjQgMCIvPjwvZz48L3N2Zz4=', bk: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHN0eWxlPSJjb2xvci1zY2hlbWU6bGlnaHQgb25seSIgdmlld0JveD0iMCAwIDQ1IDQ1Ij48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuNSI+PHBhdGggc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIgZD0iTTIyLjUgMTEuNlY2Ii8+PHBhdGggZmlsbD0iIzAwMCIgc3Ryb2tlLWxpbmVjYXA9ImJ1dHQiIHN0cm9rZS1saW5lam9pbj0ibWl0ZXIiIGQ9Ik0yMi41IDI1czQuNS03LjUgMy0xMC41YzAgMC0xLTIuNS0zLTIuNXMtMyAyLjUtMyAyLjVjLTEuNSAzIDMgMTAuNSAzIDEwLjUiLz48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTEuNSAzN2EyMi4zIDIyLjMgMCAwIDAgMjEgMHYtN3M5LTQuNSA2LTEwLjVjLTQtNi41LTEzLjUtMy41LTE2IDRWMjd2LTMuNWMtMy41LTcuNS0xMy0xMC41LTE2LTQtMyA2IDUgMTAgNSAxMHoiLz48cGF0aCBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBkPSJNMjAgOGg1Ii8+PHBhdGggc3Ryb2tlPSIjZWNlY2VjIiBkPSJNMzIgMjkuNXM4LjUtNCA2LTkuN0MzNC4xIDE0IDI1IDE4IDIyLjUgMjQuNnYyLjEtMi4xQzIwIDE4IDkuOSAxNCA3IDE5LjljLTIuNSA1LjYgNC44IDkgNC44IDkiLz48cGF0aCBzdHJva2U9IiNlY2VjZWMiIGQ9Ik0xMS41IDMwYzUuNS0zIDE1LjUtMyAyMSAwbS0yMSAzLjVjNS41LTMgMTUuNS0zIDIxIDBtLTIxIDMuNWM1LjUtMyAxNS41LTMgMjEgMCIvPjwvZz48L3N2Zz4=',
};
const PIMG = {}; for (const k in PIECE_URL) { const im = new Image(); im.src = PIECE_URL[k]; PIMG[k] = im; }
const miniEl = $('#mini'), mc = $('#miniC'), mg = mc.getContext('2d');
const SQ_PX = 60; mc.width = mc.height = SQ_PX * 8;
let miniRot = 0, miniLegal = [], hintMove = null;
const toCell = (sq, q) => { const x = sq.charCodeAt(0) - 97 - 3.5, z = 3.5 - (+sq[1] - 1), c = Math.cos(q), s = Math.sin(q); return [Math.round(x * c - z * s + 3.5), Math.round(x * s + z * c + 3.5)]; };
function fromCell(col, row) { const q = miniRot * Math.PI / 2, c = Math.cos(q), s = Math.sin(q), sx = col - 3.5, sy = row - 3.5; return sqAt(V(sx * c + sy * s, 0, -sx * s + sy * c)); }

// материал: у кого больше и чего
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
function material() {
  const cnt = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const row of game.board()) for (const p of row) if (p && p.type !== 'k') cnt[p.color][p.type]++;
  const out = { w: { list: [], score: 0 }, b: { list: [], score: 0 } };
  let sw = 0, sb = 0;
  for (const t of ['q', 'r', 'b', 'n', 'p']) {
    sw += cnt.w[t] * VAL[t]; sb += cnt.b[t] * VAL[t];
    const d = cnt.w[t] - cnt.b[t];
    for (let i = 0; i < Math.abs(d); i++) (d > 0 ? out.w : out.b).list.push((d > 0 ? 'b' : 'w') + t); // съеденные у соперника
  }
  out.w.score = sw - sb; out.b.score = sb - sw;
  return out;
}
let matKey = '';
function drawMaterial(bottomColor) {
  const m = material(), top = bottomColor === 'w' ? 'b' : 'w';
  const key = JSON.stringify(m) + bottomColor; if (key === matKey) return; matKey = key;
  const row = (el, c) => { const x = m[c]; el.innerHTML = `<span class="who">${SIDE[c]}</span>` + x.list.map(k => `<img src="${PIECE_URL[k]}" alt="">`).join('') + (x.score > 0 ? `<b>+${x.score}</b>` : ''); };
  row($('#matTop'), top); row($('#matBot'), bottomColor);
  const lead = m.w.score > 0 ? `материал: лагерь +${m.w.score}` : m.b.score > 0 ? `материал: орги +${m.b.score}` : 'материал: поровну';
  $('#matInfo').textContent = lead;
}
function drawMini(t) {
  const show = SET.mini && mode !== 'title';
  miniEl.classList.toggle('on', show);
  if (mode === 'title') return;
  miniRot = ((Math.round(orbit.th / (Math.PI / 2)) % 4) + 4) % 4;
  const q = miniRot * Math.PI / 2, S = SQ_PX;
  drawMaterial(toCell('e1', q)[1] >= toCell('e8', q)[1] ? 'w' : 'b');
  if (!show) return;
  const cell = sq => { const [cx, cy] = toCell(sq, q); return [cx * S, cy * S]; };
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) { const [x, y] = cell('abcdefgh'[f] + (r + 1)); mg.fillStyle = (f + r) % 2 ? '#fff6f8' : '#ff7a99'; mg.fillRect(x, y, S, S); }
  const h = game.history({ verbose: true }), l = h[h.length - 1];
  if (l) { mg.fillStyle = 'rgba(255,230,107,.75)'; for (const sq of [l.from, l.to]) { const [x, y] = cell(sq); mg.fillRect(x, y, S, S); } }
  const frameSq = (sq, col, w = 5) => { const [x, y] = cell(sq); mg.strokeStyle = col; mg.lineWidth = w; mg.strokeRect(x + w / 2, y + w / 2, S - w, S - w); };
  if (game.in_check()) { const b = game.board(); for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = b[r][f]; if (p && p.type === 'k' && p.color === game.turn()) { const [x, y] = cell('abcdefgh'[f] + (8 - r)); const g = mg.createRadialGradient(x + S / 2, y + S / 2, 2, x + S / 2, y + S / 2, S * .7); g.addColorStop(0, 'rgba(255,0,40,.95)'); g.addColorStop(1, 'rgba(255,0,40,0)'); mg.fillStyle = g; mg.fillRect(x, y, S, S); } } }
  if (selected) frameSq(selected, C.myata);
  // висящие фигуры (тренер)
  for (const sq of hanging) { const [x, y] = cell(sq); mg.fillStyle = C.bak; mg.beginPath(); mg.arc(x + S - 11, y + 11, 9, 0, 7); mg.fill(); mg.fillStyle = C.limonad; mg.font = 'bold 14px "IBM Plex Mono", monospace'; mg.textAlign = 'center'; mg.textBaseline = 'middle'; mg.fillText('!', x + S - 11, y + 12); }
  const b = game.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = b[r][f]; if (!p) continue; const im = PIMG[p.color + p.type]; if (!im.complete) continue; const [x, y] = cell('abcdefgh'[f] + (8 - r)); mg.drawImage(im, x, y, S, S); }
  if (selected) for (const m of miniLegal) { const [x, y] = cell(m.to); mg.fillStyle = 'rgba(20,85,30,.5)'; if (m.captured) { mg.beginPath(); mg.arc(x + S / 2, y + S / 2, S / 2 - 2, 0, 7); mg.arc(x + S / 2, y + S / 2, S / 2 - 8, 0, 7, true); mg.fill(); } else { mg.beginPath(); mg.arc(x + S / 2, y + S / 2, S * .14, 0, 7); mg.fill(); } }
  // координаты, как на lichess
  mg.font = '600 11px "IBM Plex Mono", monospace'; mg.textBaseline = 'alphabetic';
  for (let i = 0; i < 8; i++) {
    const fsq = 'abcdefgh'[i], bottomRow = [...'12345678'].map(r => fsq + r).find(sq => toCell(sq, q)[1] === 7);
    if (bottomRow) { const [x, y] = cell(bottomRow); mg.fillStyle = ((i + +bottomRow[1] - 1) % 2) ? '#ff4f7b' : '#fff6f8'; mg.textAlign = 'right'; mg.fillText(fsq, x + S - 3, y + S - 3); }
    const rsq = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(f => f + (i + 1)).find(sq => toCell(sq, q)[0] === 0);
    if (rsq) { const [x, y] = cell(rsq); mg.fillStyle = ((rsq.charCodeAt(0) - 97 + i) % 2) ? '#ff4f7b' : '#fff6f8'; mg.textAlign = 'left'; mg.fillText(String(i + 1), x + 3, y + 13); }
  }
  // стрелка подсказки
  if (hintMove) {
    const [x1, y1] = cell(hintMove.from), [x2, y2] = cell(hintMove.to);
    const ax = x1 + S / 2, ay = y1 + S / 2, bx = x2 + S / 2, by = y2 + S / 2, an = Math.atan2(by - ay, bx - ax);
    mg.strokeStyle = 'rgba(47,208,138,.85)'; mg.fillStyle = 'rgba(47,208,138,.85)'; mg.lineWidth = 10; mg.lineCap = 'round';
    mg.beginPath(); mg.moveTo(ax, ay); mg.lineTo(bx - Math.cos(an) * 18, by - Math.sin(an) * 18); mg.stroke();
    mg.beginPath(); mg.moveTo(bx, by); mg.lineTo(bx - Math.cos(an - .5) * 26, by - Math.sin(an - .5) * 26); mg.lineTo(bx - Math.cos(an + .5) * 26, by - Math.sin(an + .5) * 26); mg.fill();
  }
}
mc.addEventListener('pointerdown', e => {
  e.stopPropagation(); const r = mc.getBoundingClientRect();
  const col = Math.floor((e.clientX - r.left) / r.width * 8), row = Math.floor((e.clientY - r.top) / r.height * 8);
  if ($('#dialog').classList.contains('on')) return nextLine();
  tapSq(fromCell(col, row));
});


// ---------- цикл ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
  updTweens(dt); tickClock(dt);
  for (const f of Object.values(figs)) f.update(t, dt);
  for (const f of grave) f.update(t, dt);
  for (const f of spectators) f.update(t, dt);
  updParts(dt); world.update(t, dt);
  const pulse = 1 + Math.sin(t * 6) * .15; for (const m of moveMarks) m.scale.set(pulse, 1, pulse);
  checkM.scale.setScalar(1 + Math.sin(t * 8) * .04);
  updCam(dt);
  drawMini(t);
  retro.render(scene, cam, t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__rc = { get game() { return game; }, figs: () => figs, startGame, setView, queueMove, SET, applySet, retro, cam, world, startChapter, toMenu, humanMove, pick, tap, story: () => story, dbg: () => ({ mode, busy, inCut, mySide, turn: game.turn(), selected, cine: cine.k, ptrs: ptrs.size }) };
