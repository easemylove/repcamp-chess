// Кубиковые человечки: лагерь (белые) против оргов (чёрные).
import * as THREE from 'three';
import { mat, canvasTex, imgTex, rnd, C } from './gfx.js?v=1794083424';

const SKIN = ['#f2c9a0', '#e0b088', '#c98f66', '#ffdcbc', '#a8724e'];
const G = {}; // кэш геометрий
const box = (w, h, d) => { const k = `${w}|${h}|${d}`; return G[k] || (G[k] = new THREE.BoxGeometry(w, h, d)); };
function taper(w, h, d, k) { const g = new THREE.BoxGeometry(w, h, d); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * k); g.computeVertexNormals(); return g; }
const TORSO = taper(.3, .3, .17, .8);
function M(geo, color, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color); m.position.set(x, y, z); parent && parent.add(m); return m; }
function piv(x, y, z, parent) { const g = new THREE.Group(); g.position.set(x, y, z); parent && parent.add(g); return g; }

// ---------- лица 16×16 ----------
const faceCache = {};
function faceMat(skin, kind) {
  const key = skin + kind; if (faceCache[key]) return faceCache[key];
  const t = canvasTex(16, 16, (g) => {
    g.fillStyle = skin; g.fillRect(0, 0, 16, 16);
    const px = (c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const ink = '#2a1f3d';
    if (kind === 'cool') { px(ink, 2, 5, 12, 3); px('#5b5470', 3, 6, 4, 1); px('#5b5470', 9, 6, 4, 1); }
    else if (kind === 'sleepy') { px(ink, 3, 7, 3, 1); px(ink, 10, 7, 3, 1); }
    else if (kind === 'glasses') { px(ink, 2, 5, 5, 1); px(ink, 9, 5, 5, 1); px(ink, 2, 8, 5, 1); px(ink, 9, 8, 5, 1); px(ink, 2, 5, 1, 4); px(ink, 6, 5, 1, 4); px(ink, 9, 5, 1, 4); px(ink, 13, 5, 1, 4); px(ink, 7, 6, 2, 1); px(ink, 4, 6, 1, 2); px(ink, 11, 6, 1, 2); }
    else { px(ink, 4, 6, 2, 2); px(ink, 10, 6, 2, 2); px('#ffffff', 4, 6); px('#ffffff', 10, 6); }
    if (kind === 'stern') { px(ink, 3, 4, 3, 1); px(ink, 10, 4, 3, 1); px(ink, 6, 3, 1, 1); px(ink, 9, 3, 1, 1); }
    px(C.malina, 2, 9, 2, 1); px(C.malina, 12, 9, 2, 1);
    if (kind === 'sleepy') { px(ink, 7, 11, 2, 2); }
    else if (kind === 'stern') { px(ink, 5, 12, 6, 1); }
    else { px(ink, 5, 11, 1, 1); px(ink, 6, 12, 4, 1); px(ink, 10, 11, 1, 1); }
  });
  const sm = mat(skin), fm = mat('#ffffff', { map: t });
  return (faceCache[key] = [sm, sm, sm, sm, fm, sm]);
}

// ---------- человечек ----------
function humanoid(o, parent) {
  const r = { };
  const b = piv(0, 0, 0, parent); r.body = b;
  r.hips = piv(0, .3, 0, b);
  for (const s of [-1, 1]) {
    const leg = piv(s * .066, 0, 0, r.hips);
    M(box(.115, .26, .13), o.pants, 0, -.12, 0, leg);
    M(box(.125, .07, .17), o.boots || '#2a1f3d', 0, -.265, .02, leg);
    r[s < 0 ? 'legL' : 'legR'] = leg;
  }
  M(box(.27, .07, .15), o.pants, 0, .03, 0, r.hips);
  r.torso = piv(0, .36, 0, b);
  M(TORSO, o.jacket, 0, .15, 0, r.torso);
  if (o.stripe) M(box(.305, .045, .175), o.stripe, 0, .09, 0, r.torso);
  if (o.scarf) { M(box(.25, .06, .19), o.scarf, 0, .29, 0, r.torso); M(box(.06, .16, .03), o.scarf, .06, .19, .095, r.torso); }
  if (o.badge) { M(box(.012, .14, .012), o.badge, -.05, .23, .088, r.torso); M(box(.012, .14, .012), o.badge, .05, .23, .088, r.torso); M(box(.09, .07, .02), '#ffffff', 0, .14, .092, r.torso); M(box(.06, .02, .022), o.badge, 0, .155, .093, r.torso); }
  for (const s of [-1, 1]) {
    const arm = piv(s * .185, .28, 0, r.torso);
    const a = M(box(.085, .25, .1), o.sleeve || o.jacket, 0, -.12, 0, arm);
    M(box(.07, .07, .08), o.skin, 0, -.27, 0, arm);
    arm.rotation.z = s * .12;
    r[s < 0 ? 'armL' : 'armR'] = arm;
    r[s < 0 ? 'handL' : 'handR'] = piv(0, -.29, .02, arm);
  }
  r.head = piv(0, .31, 0, r.torso);
  M(box(.22, .22, .21), faceMat(o.skin, o.face || 'smile'), 0, .11, 0, r.head);
  if (o.hair) { M(box(.24, .07, .23), o.hair, 0, .225, -.005, r.head); if (o.longHair) M(box(.24, .26, .06), o.hair, 0, .05, -.12, r.head); }
  return r;
}

// головные уборы (в системе головы, макушка на y=.22)
function beanie(head, c, pom) { M(box(.24, .1, .23), c, 0, .26, 0, head); M(box(.25, .05, .245), pom === c ? '#ffffff' : c, 0, .215, 0, head); if (pom) M(box(.09, .09, .09), pom, 0, .35, 0, head); }
function cap(head, c, visor) { M(box(.235, .07, .23), c, 0, .25, 0, head); M(box(.2, .025, .11), visor || c, 0, .225, .15, head); }
function crown(head, c, y = .25, s = 1) {
  const g = piv(0, y, 0, head); g.scale.setScalar(s);
  M(box(.22, .06, .22), c, 0, .03, 0, g);
  for (const [x, z] of [[-.09, -.09], [.09, -.09], [-.09, .09], [.09, .09], [0, .1], [0, -.1], [.1, 0], [-.1, 0]]) M(box(.045, .08, .045), c, x, .09, z, g);
  M(box(.05, .05, .02), C.malina === c ? '#ffffff' : C.malina, 0, .04, .115, g);
  return g;
}
function tallHat(head, c, pom) { M(box(.24, .1, .23), c, 0, .26, 0, head); M(box(.18, .1, .18), c, 0, .35, -.01, head); M(box(.12, .1, .12), c, 0, .44, -.02, head); M(box(.06, .08, .06), c, 0, .52, -.03, head); M(box(.09, .09, .09), pom, 0, .59, -.03, head); }

// ---------- конь ----------
function horse(parent, c, mane) {
  const r = {};
  const h = piv(0, 0, 0, parent); r.horse = h;
  M(box(.25, .24, .5), c, 0, .44, 0, h);
  r.hlegs = [];
  for (const [x, z] of [[-.08, .18], [.08, .18], [-.08, -.18], [.08, -.18]]) { const l = piv(x, .34, z, h); M(box(.075, .32, .08), c, 0, -.16, 0, l); M(box(.08, .05, .09), '#2a1f3d', 0, -.31, .01, l); r.hlegs.push(l); }
  const neck = piv(0, .5, .2, h); neck.rotation.x = -.45; r.neck = neck;
  M(box(.15, .3, .15), c, 0, .14, 0, neck);
  M(box(.04, .3, .05), mane, 0, .15, -.09, neck);
  const head = piv(0, .3, 0, neck); head.rotation.x = .9; r.hhead = head;
  M(box(.14, .14, .28), c, 0, .02, .1, head);
  M(box(.04, .06, .03), mane, -.04, .1, -.02, head); M(box(.04, .06, .03), mane, .04, .1, -.02, head);
  M(box(.03, .03, .02), '#2a1f3d', -.071, .04, .06, head); M(box(.03, .03, .02), '#2a1f3d', .071, .04, .06, head);
  const tail = piv(0, .52, -.25, h); M(box(.05, .26, .06), mane, 0, -.12, -.03, tail); tail.rotation.x = .5; r.tail = tail;
  M(box(.27, .05, .26), mane === '#ffffff' ? C.bak : C.malina, 0, .58, -.02, h); // попона
  return r;
}

// ---------- сборка фигур ----------
export function makePiece(type, color, seed = 1) {
  const R = rnd(seed * 7919 + (color === 'w' ? 1 : 2) * 131 + type.charCodeAt(0));
  const pick = a => a[(R() * a.length) | 0];
  const W = color === 'w';
  const root = new THREE.Group();
  const f = { type, color, root, p: {}, walk: 0, phase: R() * 6, idle: R() * 6, colors: [] };
  // подставка
  const disc = M(new THREE.CylinderGeometry(.37, .39, .05, 10), W ? '#ffffff' : C.bak, 0, .025, 0, root);
  M(new THREE.CylinderGeometry(.395, .395, .02, 10), W ? C.malina : C.myata, 0, .006, 0, root);
  f.disc = disc;
  const stand = piv(0, .05, 0, root);
  f.stand = stand;
  const skin = pick(SKIN);
  const jacketW = pick(['#f4f0e8', '#ffffff', '#ece6da']);
  const accents = [C.malina, C.myata, C.limonad, C.vasilek];
  let scale = 1;
  let p;

  if (type === 'p') {
    if (W) {
      const hatc = pick([C.malina, C.myata, C.limonad, '#ffffff']);
      p = humanoid({ jacket: jacketW, pants: '#8b87a3', skin, scarf: pick([C.malina, C.myata]), face: pick(['smile', 'smile', 'glasses']) }, stand);
      beanie(p.head, hatc, hatc === '#ffffff' ? C.malina : '#ffffff');
      f.colors = [jacketW, hatc, '#8b87a3'];
    } else {
      p = humanoid({ jacket: C.bak, pants: '#1a1328', skin, badge: C.malina, stripe: C.malina, face: pick(['stern', 'smile', 'cool']) }, stand);
      cap(p.head, '#3d2f57', C.malina);
      M(box(.05, .12, .04), '#1a1328', 0, -.02, .02, p.handR); M(box(.012, .08, .012), '#1a1328', .015, .08, .02, p.handR); // рация
      f.colors = [C.bak, C.malina, '#3d2f57'];
    }
  } else if (type === 'n') {
    const hc = W ? C.malina : '#463761', mc = W ? '#ffffff' : C.malina;
    const hr = horse(stand, hc, mc); Object.assign(f.p, hr);
    const rider = piv(0, .3, -.03, hr.horse);
    p = humanoid(W ? { jacket: jacketW, pants: '#8b87a3', skin, scarf: C.myata } : { jacket: C.bak, pants: '#1a1328', skin, badge: C.malina, face: 'stern' }, rider);
    p.legL.rotation.x = -1.35; p.legR.rotation.x = -1.35; p.legL.rotation.z = -.35; p.legR.rotation.z = .35;
    p.armL.rotation.x = -.7; p.armR.rotation.x = -.7;
    rider.scale.setScalar(.85);
    if (W) beanie(p.head, C.limonad, C.malina); else cap(p.head, '#3d2f57', C.malina);
    f.p.rider = rider;
    f.colors = [hc, mc, W ? jacketW : C.bak];
  } else if (type === 'b') {
    scale = 1.1;
    if (W) {
      p = humanoid({ jacket: jacketW, pants: '#8b87a3', skin, scarf: C.myata, hair: '#7a4a2e', longHair: true }, stand);
      tallHat(p.head, C.malina, '#ffffff');
      const mug = piv(0, -.02, .04, p.handR); M(box(.08, .1, .08), C.malina, 0, .03, 0, mug); M(box(.02, .05, .04), C.malina, .05, .03, 0, mug); M(box(.07, .01, .07), '#9a2d2d', 0, .08, 0, mug);
      p.armR.rotation.x = -.9; f.p.mug = mug;
      f.colors = [jacketW, C.malina, '#7a4a2e'];
    } else {
      p = humanoid({ jacket: C.bak, pants: '#1a1328', skin, badge: C.myata, face: 'glasses', hair: '#3a2a20' }, stand);
      tallHat(p.head, '#463761', C.myata);
      const clk = piv(0, -.02, .05, p.handR); M(box(.18, .08, .07), '#6b4a3a', 0, .03, 0, clk); M(box(.06, .06, .01), '#ffffff', -.045, .035, .04, clk); M(box(.06, .06, .01), '#ffffff', .045, .035, .04, clk); M(box(.03, .03, .03), C.malina, -.05, .085, 0, clk); M(box(.03, .03, .03), C.malina, .05, .085, 0, clk);
      p.armR.rotation.x = -.9; f.p.clock = clk;
      f.colors = [C.bak, C.myata, '#463761'];
    }
  } else if (type === 'r') {
    if (W) { // домик-континент на ножках
      p = {}; const b = piv(0, 0, 0, stand); p.body = b; p.hips = piv(0, .26, 0, b);
      for (const s of [-1, 1]) { const leg = piv(s * .14, 0, 0, p.hips); M(box(.13, .23, .14), '#8b87a3', 0, -.1, 0, leg); M(box(.15, .07, .19), C.bak, 0, -.22, .02, leg); p[s < 0 ? 'legL' : 'legR'] = leg; }
      p.torso = piv(0, .26, 0, b); p.head = p.torso;
      M(box(.62, .5, .56), '#8a5c48', 0, .25, 0, p.torso);
      for (let i = 0; i < 4; i++) M(box(.63, .02, .57), '#6b4636', 0, .07 + i * .12, 0, p.torso);
      const roof = new THREE.Mesh(roofGeo(.74, .3, .64), mat('#3b2c4a')); roof.position.y = .5; p.torso.add(roof);
      const sn = new THREE.Mesh(roofGeo(.78, .32, .68), mat('#f6f8ff')); sn.position.y = .53; p.torso.add(sn);
      for (const s of [-1, 1]) { M(box(.14, .12, .02), '#ffd27a', s * .14, .32, .285, p.torso); M(box(.05, .06, .025), C.bak, s * .14, .31, .29, p.torso); }
      M(box(.14, .2, .02), C.bak, 0, .1, .285, p.torso);
      M(box(.66, .03, .03), C.malina, 0, .49, .3, p.torso);
      p.armL = piv(-.33, .3, 0, p.torso); p.armR = piv(.33, .3, 0, p.torso);
      M(box(.07, .18, .08), '#8a5c48', 0, -.08, 0, p.armL); M(box(.07, .18, .08), '#8a5c48', 0, -.08, 0, p.armR);
      f.colors = ['#8a5c48', '#3b2c4a', '#f6f8ff'];
    } else { // баня на колёсах
      p = {}; const b = piv(0, 0, 0, stand); p.body = b; p.torso = piv(0, .18, 0, b); p.head = p.torso;
      M(box(.62, .5, .62), '#5a3b2a', 0, .27, 0, p.torso);
      for (let i = 0; i < 4; i++) M(box(.63, .025, .63), '#3e281d', 0, .08 + i * .13, 0, p.torso);
      const roof = new THREE.Mesh(roofGeo(.76, .28, .7), mat(C.bak)); roof.position.y = .52; p.torso.add(roof);
      const sn = new THREE.Mesh(roofGeo(.8, .3, .74), mat('#f6f8ff')); sn.position.y = .55; p.torso.add(sn);
      M(box(.08, .26, .08), '#4a4555', .18, .7, -.12, p.torso);
      for (const s of [-1, 1]) { M(box(.12, .1, .02), '#ffb35c', s * .14, .36, .315, p.torso); M(box(.04, .05, .025), C.bak, s * .14, .35, .32, p.torso); }
      M(box(.5, .08, .02), C.malina, 0, .14, .315, p.torso);
      p.wheels = [];
      for (const [x, z] of [[-.33, .2], [.33, .2], [-.33, -.2], [.33, -.2]]) { const w = piv(x, .12, z, b); const wm = M(new THREE.CylinderGeometry(.12, .12, .06, 8), C.bak, 0, 0, 0, w); wm.rotation.z = Math.PI / 2; M(box(.07, .05, .05), C.malina, 0, 0, 0, w); p.wheels.push(w); }
      p.smoke = [];
      for (let i = 0; i < 3; i++) { const s = M(box(.1, .1, .1), mat('#c9c6d6', { transparent: true, opacity: .7, nocache: true }), .18, .9, -.12, p.torso); p.smoke.push(s); }
      p.armL = piv(-.33, .3, 0, p.torso); p.armR = piv(.33, .3, 0, p.torso);
      f.colors = ['#5a3b2a', C.bak, '#f6f8ff'];
    }
  } else if (type === 'q') {
    scale = 1.2;
    if (W) {
      p = humanoid({ jacket: '#ffffff', pants: C.myata, skin, scarf: C.limonad, hair: '#d9a441', longHair: true }, stand);
      crown(p.head, C.limonad, .22, .8);
      const cup = piv(0, 0, .03, p.handR); M(new THREE.CylinderGeometry(.06, .035, .1, 6), C.limonad, 0, .06, 0, cup); M(box(.04, .03, .04), C.limonad, 0, 0, 0, cup); M(box(.08, .02, .06), C.bak, 0, -.025, 0, cup);
      p.armR.rotation.x = -2.6; p.armR.rotation.z = .2; f.p.cup = cup;
      f.colors = ['#ffffff', C.limonad, C.myata];
    } else {
      p = humanoid({ jacket: C.bak, pants: '#1a1328', skin, badge: C.malina, stripe: C.malina, face: 'cool', hair: '#1a1328' }, stand);
      M(box(.12, .1, .12), '#1a1328', 0, .3, -.06, p.head); // пучок
      crown(p.head, C.malina, .22, .8);
      const mega = piv(0, 0, .05, p.handR); const cn = M(new THREE.CylinderGeometry(.04, .09, .2, 6), C.malina, 0, 0, .08, mega); cn.rotation.x = Math.PI / 2; M(box(.03, .06, .03), '#ffffff', 0, -.04, 0, mega);
      p.armR.rotation.x = -1.4; f.p.mega = mega;
      f.colors = [C.bak, C.malina, '#1a1328'];
    }
  } else if (type === 'k') {
    scale = 1.28;
    if (W) { // соня в пледе
      p = humanoid({ jacket: '#d8d1e8', pants: '#8b87a3', skin, face: 'sleepy', hair: '#5a3b2a' }, stand);
      const plaid = canvasTex(8, 8, (g) => { g.fillStyle = C.myata; g.fillRect(0, 0, 8, 8); g.fillStyle = '#ffffff'; g.fillRect(0, 2, 8, 1); g.fillRect(2, 0, 1, 8); g.fillStyle = C.bak; g.fillRect(0, 6, 8, 1); g.fillRect(6, 0, 1, 8); });
      const pm = mat('#ffffff', { map: plaid });
      M(box(.42, .36, .08), pm, 0, .15, -.11, p.torso); M(box(.44, .08, .25), pm, 0, .3, 0, p.torso);
      M(box(.08, .3, .2), pm, -.2, .14, 0, p.torso); M(box(.08, .3, .2), pm, .2, .14, 0, p.torso);
      M(box(.23, .05, .02), C.malina, 0, .17, .11, p.head); // маска для сна на лбу
      crown(p.head, C.limonad, .23, .9);
      f.colors = [C.myata, '#ffffff', C.limonad];
    } else { // главный орг
      p = humanoid({ jacket: C.bak, pants: '#1a1328', skin, badge: C.limonad, stripe: C.limonad, face: 'stern', hair: '#3a2a20' }, stand);
      crown(p.head, C.limonad, .23, .9);
      M(box(.02, .12, .12), '#1a1328', .12, .12, 0, p.head); M(box(.02, .02, .12), '#1a1328', .12, .06, .09, p.head); M(box(.03, .03, .03), C.malina, .1, .06, .15, p.head); // гарнитура
      const clip = piv(0, 0, .05, p.handL); M(box(.15, .2, .02), '#6b4a3a', 0, .05, 0, clip); M(box(.12, .14, .01), '#ffffff', 0, .04, .012, clip);
      p.armL.rotation.x = -1.0; f.p.clip = clip;
      f.colors = [C.bak, C.limonad, '#1a1328'];
    }
  }
  Object.assign(f.p, p);
  stand.scale.setScalar(scale);
  f.scale = scale;
  f.baseArm = { L: p.armL ? p.armL.rotation.x : 0, R: p.armR ? p.armR.rotation.x : 0 };
  f.face = (W ? Math.PI : 0); root.rotation.y = f.face;
  f.update = (t, dt) => updateFig(f, t, dt);
  return f;
}

function roofGeo(w, h, d) { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0); const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return g; }

function updateFig(f, t, dt) {
  const p = f.p;
  if (f.frozen) return;
  const w = f.walk;
  f.phase += dt * (f.type === 'n' ? 14 : 11) * w;
  const s = Math.sin(f.phase);
  if (p.legL && f.type !== 'n') { p.legL.rotation.x = s * .7 * w; p.legR.rotation.x = -s * .7 * w; }
  if (p.armL && !f.posing) {
    const idle = Math.sin(t * 1.6 + f.idle) * .05;
    p.armL.rotation.x = f.baseArm.L * (1 - w) - s * .6 * w + idle;
    if (!f.holdR) p.armR.rotation.x = f.baseArm.R * (1 - w) + s * .6 * w - idle;
  }
  if (p.hlegs) { const g = Math.sin(f.phase); p.hlegs[0].rotation.x = g * .8 * w; p.hlegs[3].rotation.x = g * .8 * w; p.hlegs[1].rotation.x = -g * .8 * w; p.hlegs[2].rotation.x = -g * .8 * w; p.tail.rotation.x = .5 + Math.sin(t * 3 + f.idle) * .15; p.neck.rotation.x = -.45 + Math.sin(f.phase) * .1 * w + Math.sin(t * 1.3 + f.idle) * .04; }
  if (p.wheels) { for (const wh of p.wheels) wh.rotation.x += dt * 9 * w; f.p.smoke.forEach((sm, i) => { const k = (t * .5 + i / 3) % 1; sm.position.set(.18 + Math.sin(k * 5 + i) * .05, .88 + k * .5, -.12); sm.scale.setScalar(.6 + k * 1.4); sm.material.opacity = .7 * (1 - k); }); }
  if (p.body && !f.posing) {
    p.body.position.y = Math.abs(s) * .05 * w + (f.type === 'r' && f.color === 'b' ? Math.abs(s) * .02 * w : 0);
    const breathe = 1 + Math.sin(t * 2 + f.idle) * .012;
    p.body.scale.y = breathe;
  }
  if (p.head && p.head !== p.torso && !f.posing) { p.head.rotation.y = Math.sin(t * .4 + f.idle * 3) * .35 * (1 - w); }
  if (f.type === 'k' && f.color === 'w' && !f.posing) p.head.rotation.z = Math.sin(t * .8 + f.idle) * .08;
}
