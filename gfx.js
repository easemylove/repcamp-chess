// Графика: ретро-материалы (PS1 / N64), низкое разрешение, пост-проход с дизером и CRT.
import * as THREE from 'three';

export const U = {
  uRes: { value: new THREE.Vector2(320, 240) },
  uSnap: { value: 1 },
  uAffine: { value: 1 },
};

export const C = {
  bak: '#2a1f3d', paper: '#ffffff', malina: '#ff4f7b', myata: '#2fd08a', vasilek: '#5b8cff', limonad: '#ffe66b',
};

const TEX = [];
export function regTex(t) { t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; TEX.push(t); return t; }
export function setTexFilter(nearest) {
  for (const t of TEX) { const f = nearest ? THREE.NearestFilter : THREE.LinearFilter; t.magFilter = f; t.minFilter = f; t.needsUpdate = true; }
}

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; draw(g, w, h);
  const t = regTex(new THREE.CanvasTexture(c));
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}

export function imgTex(url, size, onload) {
  const t = regTex(new THREE.Texture());
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas'); const k = size / Math.max(im.width, im.height);
    c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    t.image = c; t.needsUpdate = true; onload && onload(t);
  };
  im.src = url; return t;
}

// Материал с дрожанием вершин и аффинными текстурами. Освещение — ламберт.
const matCache = new Map();
export function mat(color = '#ffffff', o = {}) {
  const key = color + JSON.stringify(Object.keys(o).map(k => [k, o[k] && o[k].uuid ? o[k].uuid : o[k]]));
  if (!o.nocache && matCache.has(key)) return matCache.get(key);
  const { nocache, ...rest } = o;
  const m = new THREE.MeshLambertMaterial({ color, ...rest });
  retroize(m);
  if (!o.nocache) matCache.set(key, m);
  return m;
}
export function retroize(m) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uRes = U.uRes; sh.uniforms.uSnap = U.uSnap; sh.uniforms.uAffine = U.uAffine;
    sh.vertexShader = 'uniform vec2 uRes; uniform float uSnap; uniform float uAffine; varying float vAffW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      if (uSnap > 0.5 && gl_Position.w > 0.0) { vec2 g = uRes * 0.5; vec4 sp = gl_Position; sp.xy = floor(sp.xy / sp.w * g + 0.5) / g * sp.w; gl_Position = sp; }
      vAffW = mix(1.0, max(gl_Position.w, 0.001), uAffine);
      #ifdef USE_MAP
        vMapUv *= vAffW;
      #endif`);
    sh.fragmentShader = 'varying float vAffW;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv / vAffW );
        diffuseColor *= sampledDiffuseColor;
      #endif`);
  };
  m.customProgramCacheKey = () => 'retro';
  return m;
}

// Рендер в маленькую цель + вывод на экран.
export class Retro {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.r.setPixelRatio(1);
    this.mode = 'ps1'; this.crt = false; this.sharp = 240;
    this.rt = new THREE.WebGLRenderTarget(320, 240, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { tex: { value: this.rt.texture }, res: { value: new THREE.Vector2(320, 240) }, uDither: { value: 1 }, uCrt: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tex; uniform vec2 res; uniform float uDither, uCrt, uTime;
        float bayer(vec2 p){ int x = int(mod(p.x,4.)), y = int(mod(p.y,4.)); int i = x + y*4;
          int m[16]; m[0]=0;m[1]=8;m[2]=2;m[3]=10;m[4]=12;m[5]=4;m[6]=14;m[7]=6;m[8]=3;m[9]=11;m[10]=1;m[11]=9;m[12]=15;m[13]=7;m[14]=13;m[15]=5;
          for(int k=0;k<16;k++){ if(k==i) return float(m[k])/16.; } return 0.; }
        vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec2 uv = vUv;
          if (uCrt > .5) { vec2 c = uv*2.-1.; c *= 1. + .045*dot(c,c); uv = c*.5+.5;
            if (uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.) { gl_FragColor = vec4(0.,0.,0.,1.); return; } }
          vec3 col = toSRGB(texture2D(tex, uv).rgb);
          if (uDither > .5) { vec2 p = floor(uv*res); col += (bayer(p) - .5) / 24.; col = floor(clamp(col,0.,1.)*31. + .5)/31.; }
          if (uCrt > .5) {
            float line = sin(uv.y*res.y*3.14159*2.)*.5+.5; col *= .78 + .22*line;
            float m = mod(gl_FragCoord.x, 3.); vec3 mask = vec3(m<1.?1.:.82, (m>=1.&&m<2.)?1.:.82, m>=2.?1.:.82); col *= mask*1.12;
            vec2 c = uv*2.-1.; col *= 1. - .35*dot(c*c, c*c);
            col += .015*sin(uTime*60. + uv.y*400.);
          }
          gl_FragColor = vec4(col, 1.);
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.qscene = new THREE.Scene(); this.qscene.add(this.quad);
    this.qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.resize();
  }
  setMode(mode) {
    this.mode = mode;
    const ps1 = mode === 'ps1';
    U.uSnap.value = ps1 ? 1 : 0; U.uAffine.value = ps1 ? 1 : 0;
    this.quad.material.uniforms.uDither.value = ps1 ? 1 : 0;
    const f = ps1 ? THREE.NearestFilter : THREE.LinearFilter;
    this.rt.texture.magFilter = f; this.rt.texture.minFilter = f; this.rt.texture.needsUpdate = true;
    setTexFilter(ps1);
  }
  resize() {
    const W = innerWidth, H = innerHeight;
    this.r.setSize(W, H, true);
    const k = this.sharp / Math.min(W, H);
    const w = Math.max(2, Math.round(W * k)), h = Math.max(2, Math.round(H * k));
    this.rt.setSize(w, h); U.uRes.value.set(w, h);
    this.quad.material.uniforms.res.value.set(w, h);
    this.w = w; this.h = h; this.aspect = W / H;
  }
  render(scene, cam, t) {
    this.quad.material.uniforms.uCrt.value = this.crt ? 1 : 0;
    this.quad.material.uniforms.uTime.value = t;
    this.r.setRenderTarget(this.rt); this.r.render(scene, cam);
    this.r.setRenderTarget(null); this.r.render(this.qscene, this.qcam);
  }
}

// Простые генераторы пиксельных текстур.
export function rnd(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s ^= s >>> 16) >>> 0) / 4294967296); }

export function noiseTex(base, spots, size = 32, n = 120, seed = 1, repeat) {
  const r = rnd(seed);
  return canvasTex(size, size, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) { g.fillStyle = spots[(r() * spots.length) | 0]; g.fillRect((r() * w) | 0, (r() * h) | 0, 1 + (r() < .3), 1); }
  }, repeat);
}
