// Rep Camp Chess — партия, режимы, камера, сценки, интерфейс.
import * as THREE from 'three';
import { Retro, mat, C } from './gfx.js?v=1794083424';
import { buildWorld, BT } from './world.js?v=1794083424';
import { makePiece } from './figures.js?v=1794083424';
import { initAudio, sfx, setMusic, setSfx } from './audio.js?v=1794083424';
import { CHAPTERS, preparePuzzle } from './story.js?v=1794083424';

const $ = s => document.querySelector(s);
const Chess = window.Chess;

// ---------- настройки ----------
const LS = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
let saved = {}; try { saved = JSON.parse(LS.get('rcSet') || '{}'); } catch (_) {}
const SET = Object.assign({ gfx: 'ps1', crt: false, scenes: true, music: true, sfx: true, sharp: 240, flip: true, mini: true }, saved);
const saveSet = () => LS.set('rcSet', JSON.stringify(SET));

// ---------- рендер ----------
const retro = new Retro($('#c'));
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, 1, .1, 200);
const world = buildWorld(scene);
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
  const d = Math.max(orbit.dist, auto ? orbit.dist : need * (top ? 1 : .85));
  const ph = Math.min(orbit.ph, 1.52);
  const p = V(orbit.tx + Math.sin(orbit.th) * Math.cos(ph) * d, orbit.ty + Math.sin(ph) * d, orbit.tz + Math.cos(orbit.th) * Math.cos(ph) * d);
  const look = V(orbit.tx, orbit.ty, orbit.tz);
  // на телефоне под схемой — сдвигаем доску выше
  panK += ((portrait && SET.mini && !auto ? (top ? 2.4 : 2.0) : 0) - panK) * k;
  const pan = V(Math.sin(orbit.th), 0, Math.cos(orbit.th)).multiplyScalar(panK); p.add(pan); look.add(pan);
  if (cine.k > 0) { p.lerp(cine.pos, cine.k); look.lerp(cine.look, cine.k); }
  cam.position.copy(p); cam.up.set(top && cine.k < .5 ? -Math.sin(orbit.th) : 0, top && cine.k < .5 ? 0 : 1, top && cine.k < .5 ? -Math.cos(orbit.th) : 0);
  cam.lookAt(look);
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
function pop(text, color = C.malina) { const e = $('#pop'); e.textContent = text; e.style.color = color; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); }
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
  pop(WORDS[att.type][(Math.random() * 2) | 0], W ? C.malina : C.myata);
  const head = () => vic.root.position.clone().add(V(0, .75 * vic.scale, 0));
  const fallBack = (ax = -1.45) => tween(.35, k => { vic.stand.rotation.x = ax * k; }, ease.in);

  if (att.type === 'p') {
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
  if (vic.root.visible && att.type !== 'r') { vic.root.visible = false; burst(vic); }
  vic.root.visible = false;
  await wait(.45);
  att.posing = false; att.holdR = false;
  if (p.armR) p.armR.rotation.x = att.baseArm.R; if (p.horse) p.horse.rotation.x = 0;
  vic.posing = false;
  await walk(att, toPos);
  toGrave(vic);
  await cineOut(.55);
}

async function quickCapture(att, vic, toPos) {
  await walk(att, vic.root.position.clone().lerp(att.root.position, .45), { keepFacing: true });
  vic.root.visible = false; burst(vic); await walk(att, toPos); toGrave(vic);
}

// ---------- ход ----------
let busy = false; let chain = Promise.resolve();
function queueMove(mv) { chain = chain.then(() => doMove(mv)).catch(e => console.error(e)); return chain; }
async function doMove(mvIn) {
  const mv = game.move(mvIn); if (!mv) return null;
  busy = true; selected = null; showMoves([]); selM.visible = false; checkM.visible = false;
  const f = figs[mv.from]; delete figs[mv.from];
  let vicSq = null; if (mv.flags.includes('e')) vicSq = mv.to[0] + mv.from[1]; else if (mv.captured) vicSq = mv.to;
  const vic = vicSq ? figs[vicSq] : null; if (vicSq) delete figs[vicSq];
  const to = sqPos(mv.to);
  sfx('move');
  if (vic) { inCut = !!SET.scenes; if (SET.scenes) await captureScene(f, vic, to); else await quickCapture(f, vic, to); inCut = false; skip = false; }
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
  { name: 'начинашка', skill: 0, depth: 1, rnd: .4 },
  { name: 'продолжашка', skill: 4, depth: 4, rnd: .12 },
  { name: 'кайфарик-про', skill: 11, depth: 8, rnd: 0 },
  { name: 'гроссорг', skill: 20, depth: 13, rnd: 0, time: 1500 },
];
const SIDE = { w: 'лагерь', b: 'орги' };

// Stockfish в воркере
let engine, engCb;
function eng() {
  if (engine) return engine;
  engine = new Worker('stockfish.js?v=1794083424');
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

function afterMove(mv) {
  updHud();
  if (game.game_over()) return endGame();
  if (mode === 'ai' && game.turn() !== mySide) aiTurn();
  if (mode === 'hot') viewForTurn();
  if (mode === 'story') storyAfter(mv);
}
function canTouch() {
  if (busy || inCut) return false;
  if (mode === 'hot') return true;
  if (mode === 'ai' || mode === 'online') return game.turn() === mySide;
  if (mode === 'story') return story && story.active && game.turn() === 'w';
  return false;
}

async function endGame() {
  const w = game.in_checkmate() ? (game.turn() === 'w' ? 'b' : 'w') : null;
  let title, sub;
  if (w) { title = 'МАТ'; sub = w === 'w' ? 'кайфарики победили. орги идут мыть посуду' : 'орги победили. лагерь отправляется на зарядку'; }
  else if (game.in_stalemate()) { title = 'ПАТ'; sub = 'ничья. все в баню'; }
  else { title = 'НИЧЬЯ'; sub = 'мир, дружба, глинтвейн'; }
  if (w) {
    const k = figs[kingSq(w === 'w' ? 'b' : 'w')];
    k.posing = true; await tween(.6, t => k.stand.rotation.x = -1.45 * t, ease.in); burst(k);
    for (const f of Object.values(figs)) if (f.color === w) { const y0 = f.root.position.y; tween(1.6, t => f.root.position.y = y0 + Math.abs(Math.sin(t * Math.PI * 4)) * .35, ease.lin); }
    stars(V(0, 2, 0), 30);
  }
  const iWon = mode === 'hot' || !w ? null : (w === mySide);
  sfx(iWon === false ? 'lose' : 'win');
  if (mode === 'story') return storyEnd(w === 'w');
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
  if (mode === 'online' && conn) conn.send({ t: 'move', ...m });
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
}
function show(id) { document.querySelectorAll('.panel').forEach(p => p.classList.toggle('on', p.id === id)); }
function hideAll() { document.querySelectorAll('.panel').forEach(p => p.classList.remove('on')); }
function showEnd(title, sub) { $('#endT').textContent = title; $('#endS').textContent = sub; show('end'); }

function startGame(m, opts = {}) {
  mode = m; auto = false; hideAll(); $('#hud').classList.add('on'); $('#title').classList.remove('on');
  game = new Chess(opts.fen); rebuild(); world.dark = opts.dark || 0;
  if (m === 'ai') { mySide = opts.side || 'w'; level = opts.level ?? level; }
  Object.assign(goal, { tx: 0, ty: .2, tz: .4 });
  setView(m === 'hot' ? game.turn() : mySide);
  updHud();
  if (m === 'ai' && game.turn() !== mySide) setTimeout(aiTurn, 600);
}
function toMenu() {
  mode = 'title'; auto = true; chain = Promise.resolve(); busy = false; inCut = false; skip = false; cine.k = 0; story = null;
  Object.assign(goal, { ph: .32, dist: 15, ty: 1 }); top = false;
  $('#hud').classList.remove('on'); $('#dialog').classList.remove('on'); show('menu');
}

// меню
const bind = (sel, fn) => $(sel).addEventListener('click', e => { e.stopPropagation(); sfx('blip'); fn(e); });
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { sfx('blip'); show(b.dataset.go); if (b.dataset.go === 'story') renderStory(); }));
document.querySelectorAll('[data-lvl]').forEach(b => b.addEventListener('click', () => { sfx('blip'); level = +b.dataset.lvl; startGame('ai', { level, side: $('#sideB').classList.contains('sel') ? 'b' : 'w' }); }));
bind('#sideW', () => { $('#sideW').classList.add('sel'); $('#sideB').classList.remove('sel'); });
bind('#sideB', () => { $('#sideB').classList.add('sel'); $('#sideW').classList.remove('sel'); });
bind('#hot', () => startGame('hot'));
bind('#menuBtn', () => { if (mode === 'online' && conn) conn.send({ t: 'bye' }); if (mode === 'online') closeRelay(); toMenu(); });
bind('#viewBtn', () => { const seq = ['w', 'side', 'b', 'side']; viewI = (viewI + 1) % 4; setView(seq[viewI]); });
bind('#topBtn', () => top ? setView(mode === 'hot' ? game.turn() : mySide) : setView('top'));
bind('#undo', () => { if (busy) return; if (mode === 'ai') { game.undo(); if (game.turn() !== mySide) game.undo(); } else game.undo(); rebuild(); updHud(); viewForTurn(); });
bind('#again', () => { if (mode === 'online') { conn && conn.send({ t: 'again' }); startGame('online'); return; } startGame(mode, { level, side: mySide }); });
bind('#endMenu', () => toMenu());
let viewI = 0;

// настройки
function renderSet() {
  const t = (id, on, txt) => { const b = $(id); b.textContent = txt; b.classList.toggle('sel', !!on); };
  t('#sGfx', true, 'графика: ' + (SET.gfx === 'ps1' ? 'PS1 · дрожит и пикселит' : 'N64 · мягко и в тумане'));
  t('#sCrt', SET.crt, 'старый телевизор: ' + (SET.crt ? 'да' : 'нет'));
  t('#sSharp', true, 'пиксели: ' + (SET.sharp === 240 ? 'крупные' : 'помельче'));
  t('#sScenes', SET.scenes, 'сценки взятий: ' + (SET.scenes ? 'да' : 'нет'));
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
tog('#sMusic', () => SET.music = !SET.music);
tog('#sSfx', () => SET.sfx = !SET.sfx);
renderSet();

// ---------- онлайн (ходы через открытый ретранслятор ntfy.sh: работает через любой NAT, без регистрации) ----------
const RELAY = 'https://ntfy.sh/';
const myId = Math.random().toString(36).slice(2, 10);
let conn = null, relay = null, helloT = null;
function openRelay(topic, onMsg, onOpen, onFail) {
  closeRelay();
  let es; try { es = new EventSource(RELAY + topic + '/sse'); } catch (_) { onFail(); return null; }
  let opened = false; const seen = new Set();
  es.onopen = () => { if (!opened) { opened = true; onOpen(); } };
  es.onmessage = e => { try { const d = JSON.parse(e.data); if (d.event !== 'message' || seen.has(d.id)) return; seen.add(d.id); const m = JSON.parse(d.message); if (m.who !== myId) onMsg(m); } catch (_) {} };
  es.onerror = () => { if (!opened) { es.close(); onFail(); } };
  relay = { topic, send: o => fetch(RELAY + topic, { method: 'POST', body: JSON.stringify({ ...o, who: myId }) }).catch(() => status('сообщение не ушло, проверь интернет')), close() { es.close(); } };
  return relay;
}
function closeRelay() { clearInterval(helloT); if (relay) relay.close(); relay = null; conn = null; }
const noNet = () => { $('#onState').textContent = 'онлайн тут не работает: страница не пускает в интернет. открой игру по ссылке easemylove.github.io/repcamp-chess'; };
function onlineMsg(d) {
  if (d.t === 'start') { clearInterval(helloT); conn = relay; startGame('online', {}); mySide = 'b'; setView('b'); updHud(); pop('ПОЕХАЛИ', C.myata); }
  if (d.t === 'move') queueMove({ from: d.from, to: d.to, promotion: d.promotion });
  if (d.t === 'again') { startGame('online'); updHud(); }
  if (d.t === 'bye') { status('соперник вышел'); pop('СОПЕРНИК УШЁЛ', C.limonad); conn = null; updHud(); }
}
let guestId = null;
function hostOnline() {
  const code = Math.random().toString(36).slice(2, 7);
  show('online'); $('#onState').textContent = 'открываем комнату…'; $('#onLink').value = ''; guestId = null;
  openRelay('repcamp-' + code, d => {
    if (d.t === 'hello') {
      if (!guestId) { guestId = d.who; conn = relay; mySide = 'w'; startGame('online'); mySide = 'w'; setView('w'); updHud(); pop('ПОЕХАЛИ', C.malina); }
      if (d.who === guestId) relay.send({ t: 'start', fen: game.fen() });
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
  sfx('win'); stars(V(0, 2, 0), 24);
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
  initAudio(); applySet();
  $('#title').classList.remove('on');
  const j = new URLSearchParams(location.search).get('join');
  if (j) { history.replaceState(null, '', location.pathname); mode = 'online'; joinOnline(j); } else toMenu();
}
$('#title').addEventListener('click', begin);
addEventListener('keydown', e => {
  if (mode === 'title' && $('#title').classList.contains('on') && (e.key === 'Enter' || e.key === ' ')) begin();
  if (e.key === 'Escape' && mode !== 'title') toMenu();
  if ($('#dialog').classList.contains('on') && (e.key === 'Enter' || e.key === ' ')) nextLine();
});
auto = true; Object.assign(orbit, { th: .6, ph: .32, dist: 15, ty: 1 }); Object.assign(goal, orbit);
rebuild();


// ---------- схема доски (2D, в углу) ----------
const SPR = {
  p: ['............', '............', '.....##.....', '....####....', '....####....', '.....##.....', '....####....', '.....##.....', '....####....', '...######...', '..########..', '............'],
  r: ['............', '..##.##.##..', '..##.##.##..', '..########..', '...######...', '...######...', '...######...', '...######...', '...######...', '..########..', '..########..', '............'],
  n: ['............', '.....#......', '....####....', '...######...', '..###.####..', '..#######...', '.....####...', '....#####...', '....#####...', '...######...', '..########..', '............'],
  b: ['.....##.....', '....####....', '....##.#....', '...##.###...', '...######...', '...######...', '....####....', '.....##.....', '....####....', '...######...', '..########..', '............'],
  q: ['............', '..#..##..#..', '..#.####.#..', '..########..', '...######...', '...######...', '....####....', '.....##.....', '....####....', '...######...', '..########..', '............'],
  k: ['.....##.....', '....####....', '.....##.....', '...######...', '..########..', '..########..', '...######...', '....####....', '.....##.....', '....####....', '...######...', '..########..'],
};
const miniEl = $('#mini'), mc = $('#miniC'), mg = mc.getContext('2d');
function sprite(type, color, ox, oy) {
  const a = SPR[type], fill = color === 'w' ? '#ffffff' : C.bak, line = color === 'w' ? C.bak : '#ffffff';
  const on = (x, y) => y >= 0 && y < 12 && x >= 0 && x < 12 && a[y][x] === '#';
  mg.fillStyle = line;
  for (let y = -1; y < 13; y++) for (let x = -1; x < 13; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) mg.fillRect(ox + x, oy + y, 1, 1);
  mg.fillStyle = fill;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (on(x, y)) mg.fillRect(ox + x, oy + y, 1, 1);
}
let miniRot = 0, miniLegal = [];
const toCell = (sq, q) => { const x = sq.charCodeAt(0) - 97 - 3.5, z = 3.5 - (+sq[1] - 1), c = Math.cos(q), s = Math.sin(q); return [Math.round(x * c - z * s + 3.5), Math.round(x * s + z * c + 3.5)]; };
function fromCell(col, row) { const q = miniRot * Math.PI / 2, c = Math.cos(q), s = Math.sin(q), sx = col - 3.5, sy = row - 3.5; return sqAt(V(sx * c + sy * s, 0, -sx * s + sy * c)); }
function drawMini(t) {
  const show = SET.mini && mode !== 'title';
  miniEl.classList.toggle('on', show); if (!show) return;
  miniRot = ((Math.round(orbit.th / (Math.PI / 2)) % 4) + 4) % 4;
  const q = miniRot * Math.PI / 2;
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) { const sq = 'abcdefgh'[f] + (r + 1), [cx, cy] = toCell(sq, q); mg.fillStyle = (f + r) % 2 ? '#ffffff' : C.malina; mg.fillRect(cx * 16, cy * 16, 16, 16); }
  const h = game.history({ verbose: true }), l = h[h.length - 1];
  if (l) { mg.fillStyle = 'rgba(255,230,107,.7)'; for (const sq of [l.from, l.to]) { const [cx, cy] = toCell(sq, q); mg.fillRect(cx * 16, cy * 16, 16, 16); } }
  const frameSq = (sq, col, w = 2) => { const [cx, cy] = toCell(sq, q); mg.fillStyle = col; mg.fillRect(cx * 16, cy * 16, 16, w); mg.fillRect(cx * 16, cy * 16 + 16 - w, 16, w); mg.fillRect(cx * 16, cy * 16, w, 16); mg.fillRect(cx * 16 + 16 - w, cy * 16, w, 16); };
  if (game.in_check()) { const b = game.board(); for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = b[r][f]; if (p && p.type === 'k' && p.color === game.turn() && Math.sin(t * 8) > -.3) frameSq('abcdefgh'[f] + (8 - r), C.bak, 2); } }
  if (selected) frameSq(selected, C.myata, 2);
  const b = game.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = b[r][f]; if (!p) continue; const [cx, cy] = toCell('abcdefgh'[f] + (8 - r), q); sprite(p.type, p.color, cx * 16 + 2, cy * 16 + 2); }
  if (selected) for (const m of miniLegal) { const [cx, cy] = toCell(m.to, q); if (m.captured) frameSq(m.to, C.myata, 2); else { mg.fillStyle = C.myata; mg.fillRect(cx * 16 + 6, cy * 16 + 6, 4, 4); mg.fillStyle = C.bak; mg.fillRect(cx * 16 + 6, cy * 16 + 10, 4, 1); } }
}
mc.addEventListener('pointerdown', e => {
  e.stopPropagation(); const r = mc.getBoundingClientRect();
  const col = Math.floor((e.clientX - r.left) / r.width * 8), row = Math.floor((e.clientY - r.top) / r.height * 8);
  if ($('#dialog').classList.contains('on')) return nextLine();
  tapSq(fromCell(col, row));
});
bind('#miniBtn', () => { SET.mini = !SET.mini; saveSet(); });

// ---------- цикл ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
  updTweens(dt);
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
