import * as THREE from 'three';

// 모든 수채 재질이 같이 쓰는 값
export const shared = {
  uLightV: { value: new THREE.Vector3(0.4, 0.8, 0.5) },
  uTime: { value: 0 },
  uPaper: { value: null as THREE.Texture | null },
  uBake: { value: 0 }, // 구운 광선추적 조명이 얼마나 들어갔는지 (0 → 1 로 스며들어요)
};
export const LIGHT_W = new THREE.Vector3(0.4, 0.8, 0.5).normalize();

const NOISE = /* glsl */ `
float hash3(vec3 p){ p = fract(p*0.3183099+vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;

const VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec2 vUv;
uniform float uWave; uniform float uTime;
#ifdef BAKE
attribute vec4 bake;
varying vec4 vBake;
#endif
void main(){
  vUv = uv;
#ifdef BAKE
  vBake = bake;
#endif
  vec4 lp = vec4(position, 1.0);
  vec3 ln = normal;
  if (uWave > 0.0) {
    float k = 1.0 - uv.y;
    lp.z += (sin(lp.x * 9.0 + uTime * 2.3) * 0.6 + sin(lp.x * 4.0 - uTime * 1.3) * 0.4) * uWave * k;
    lp.x += sin(uTime * 1.7 + lp.y * 3.0) * uWave * 0.3 * k;
  }
#ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
  ln = mat3(instanceMatrix) * ln;
#endif
  vec4 wp = modelMatrix * lp;
  vW = wp.xyz;
  vN = normalize(normalMatrix * ln);
  vec4 mv = viewMatrix * wp;
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor; uniform sampler2D uMap; uniform float uUseMap; uniform vec3 uLightV; uniform sampler2D uPaper;
uniform float uRim; uniform float uAlpha; uniform float uGlow; uniform vec3 uGlowColor; uniform float uFlat; uniform float uNoiseScale; uniform float uSpec;
varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec2 vUv;
#ifdef BAKE
uniform float uBake;
varying vec4 vBake;
#endif
${NOISE}
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vV);
  float nl = dot(n, normalize(uLightV));
  float w = nl * 0.5 + 0.5;
  vec3 q = vW * uNoiseScale;
  float nz = noise3(q * 5.0) * 0.6 + noise3(q * 15.0) * 0.4;
  w += (nz - 0.5) * 0.22;
  w = mix(w, 0.8, uFlat);
#ifdef BAKE
  // 광선으로 구한 주 조명 그림자: 가려진 곳은 밝은 띠까지 못 올라가요
  w = mix(w, min(w, 0.46), (1.0 - vBake.a) * uBake * (1.0 - uFlat));
#endif
  float t1 = smoothstep(0.36, 0.46, w);
  float t2 = smoothstep(0.68, 0.80, w);
  vec4 tx = uUseMap > 0.5 ? texture2D(uMap, vUv) : vec4(1.0);
  vec3 base = uColor * tx.rgb;
  vec3 shade = base * vec3(0.74, 0.72, 0.84) + vec3(0.02, 0.015, 0.04);
  vec3 mid = base * vec3(0.90, 0.88, 0.90);
  vec3 lit = min(base * 1.05 + vec3(0.025, 0.02, 0.0), vec3(1.0));
  vec3 col = mix(shade, mid, t1);
  col = mix(col, lit, t2);
#ifdef BAKE
  // 구석 어둠 + 주변에서 튄 빛의 색 + 등불의 따뜻한 빛
  col *= mix(vec3(1.0), vBake.rgb, uBake);
#endif
  float paper = texture2D(uPaper, gl_FragCoord.xy / 420.0).r;
  col *= 1.0 - (1.0 - paper) * (1.3 - w) * 0.6;
  float fres = 1.0 - max(dot(n, v), 0.0);
  float edge = smoothstep(0.55, 0.98, fres + (nz - 0.5) * 0.35);
  col = mix(col, col * 0.7, edge * uRim);
  if (uSpec > 0.0) {
    vec3 rf = reflect(-normalize(uLightV), n);
    float sp = pow(max(dot(rf, v), 0.0), 24.0);
    sp = smoothstep(0.25, 0.65, sp + (nz - 0.5) * 0.25);
    col = mix(col, vec3(1.0, 0.98, 0.93), sp * uSpec);
  }
  col += uGlowColor * uGlow * (0.35 + 0.65 * fres);
  gl_FragColor = vec4(col, uAlpha * tx.a);
}`;

export interface WCOpts { map?: THREE.Texture | null; rim?: number; alpha?: number; flat?: number; side?: THREE.Side; transparent?: boolean; noise?: number; spec?: number; wave?: number; depthWrite?: boolean }

export function wc(color: string | THREE.Color, o: WCOpts = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uMap: { value: o.map ?? null },
      uUseMap: { value: o.map ? 1 : 0 },
      uLightV: shared.uLightV,
      uPaper: shared.uPaper,
      uRim: { value: o.rim ?? 1 },
      uAlpha: { value: o.alpha ?? 1 },
      uGlow: { value: 0 },
      uGlowColor: { value: new THREE.Color('#FFD86B') },
      uFlat: { value: o.flat ?? 0 },
      uNoiseScale: { value: o.noise ?? 1 },
      uSpec: { value: o.spec ?? 0 },
      uWave: { value: o.wave ?? 0 },
      uTime: shared.uTime,
      uBake: shared.uBake,
    },
    side: o.side ?? THREE.FrontSide,
    transparent: o.transparent ?? (o.alpha !== undefined && o.alpha < 1),
    depthWrite: o.depthWrite ?? true,
  });
  return m;
}
export const setColor = (m: THREE.Material, c: string) => (m as THREE.ShaderMaterial).uniforms.uColor.value.set(c);

// ── 화면 전체 수채 후처리 ─────────────────────────────
const POST_FRAG = /* glsl */ `
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tPaper; uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uEdge; uniform float uTime;
uniform float uFocus; uniform float uFocusRange; uniform float uDof; uniform float uWarm; uniform float uPx;
varying vec2 vUv;
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float lin(vec2 uv){ float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
void main(){
  // 붓 효과 크기는 화면 해상도와 상관없이 늘 같은 크기로 (uPx = 해상도 배율 / 1.6)
  vec2 px = uPx / uRes;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 wob = (vec2(n2(vUv * asp * 9.0), n2(vUv * asp * 9.0 + 17.3)) - 0.5) * px * 2.2;
  vec2 uv = vUv + wob;
  vec3 c = texture2D(tColor, uv).rgb;
  vec3 cr = texture2D(tColor, uv + vec2(px.x * 2.0, 0.0)).rgb, cl = texture2D(tColor, uv - vec2(px.x * 2.0, 0.0)).rgb;
  vec3 cu = texture2D(tColor, uv + vec2(0.0, px.y * 2.0)).rgb, cd = texture2D(tColor, uv - vec2(0.0, px.y * 2.0)).rgb;
  vec3 b = (cr + cl + cu + cd) * 0.25;
  float diff = length(c - b);
  c = mix(c, b, 0.16); // 물감 번짐은 살짝만
  c *= 1.0 - smoothstep(0.03, 0.2, diff) * 0.16;
  float d = lin(uv);
  // 초점 밖은 물감이 번진 듯 흐리게
  if (uDof > 0.0) {
    float coc = clamp(abs(d - uFocus) / uFocusRange - 0.25, 0.0, 1.0) * uDof;
    if (coc > 0.01) {
      vec3 acc = c; float wsum = 1.0;
      for (int i = 0; i < 10; i++) {
        float a = float(i) * 2.39996 + 0.5;
        float rr = sqrt(float(i) + 0.5) / 3.2;
        vec2 off = vec2(cos(a), sin(a)) * rr * coc * 4.5 * px;
        acc += texture2D(tColor, uv + off).rgb; wsum += 1.0;
      }
      c = mix(c, acc / wsum, min(1.0, coc * 1.2));
    }
  }
  float le = length(vec2(lum(cr) - lum(cl), lum(cu) - lum(cd)));
  float o = 1.4;
  float e = abs(lin(uv - vec2(px.x * o, 0.0)) - d) + abs(lin(uv + vec2(px.x * o, 0.0)) - d) +
            abs(lin(uv + vec2(0.0, px.y * o)) - d) + abs(lin(uv - vec2(0.0, px.y * o)) - d);
  e /= max(d, 0.2);
  float edge = smoothstep(0.035, 0.11, e);
  float broken = smoothstep(0.3, 0.62, n2(vUv * asp * 55.0));
  c = mix(c, vec3(0.353, 0.227, 0.157), edge * broken * 0.72 * uEdge);
  c = mix(c, c * vec3(0.72, 0.62, 0.55), smoothstep(0.1, 0.32, le) * broken * 0.35 * uEdge);
  vec3 paper = texture2D(tPaper, gl_FragCoord.xy / 512.0).rgb;
  c *= mix(vec3(1.0), paper * vec3(1.0, 0.985, 0.96), 0.95);
  float bloom = n2(vUv * asp * 3.0 + 4.0);
  c = mix(c, c * (0.95 + bloom * 0.08), 0.6);
  float vig = smoothstep(1.25, 0.35, length((vUv - 0.5) * vec2(1.0, 0.9)) * 1.45);
  c *= mix(0.9, 1.0, vig);
  // 따뜻한 색감과 살짝 진한 채도
  float L = lum(c);
  c = mix(vec3(L), c, 1.08);
  c *= mix(vec3(1.0), vec3(1.03, 1.0, 0.95), uWarm);
  gl_FragColor = vec4(c, 1.0);
}`;

export class WatercolorRenderer {
  renderer: THREE.WebGLRenderer;
  rt: THREE.WebGLRenderTarget;
  post: THREE.ShaderMaterial;
  quad: THREE.Mesh;
  postScene = new THREE.Scene();
  postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // 화질 단계: 그림 점 개수 한도(budget)와 최대 배율. 화면보다 작게 그려 늘리지 않아요
  budget = 2.9e6;
  maxDpr = 2;
  private tmp = new THREE.Vector3();
  private snapRT = new Map<string, { rt: THREE.WebGLRenderTarget; out: THREE.WebGLRenderTarget }>();

  constructor(canvas: HTMLCanvasElement, paper: THREE.Texture) {
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor('#F6EBDD', 1);
    shared.uPaper.value = paper;
    this.rt = this.makeRT(4, 4);
    this.post = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: POST_FRAG,
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, tPaper: { value: paper },
        uRes: { value: new THREE.Vector2(4, 4) }, uNear: { value: 0.05 }, uFar: { value: 30 }, uEdge: { value: 1 }, uTime: { value: 0 },
        uFocus: { value: 2.2 }, uFocusRange: { value: 1.6 }, uDof: { value: 0 }, uWarm: { value: 1 }, uPx: { value: 1 },
      },
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);
  }

  makeRT(w: number, h: number) {
    const rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(w, h);
    rt.depthTexture.type = THREE.UnsignedIntType;
    return rt;
  }

  dofOn = true;
  setTier(t: { budget: number; maxDpr: number; dof: boolean }) { this.budget = t.budget; this.maxDpr = t.maxDpr; this.dofOn = t.dof; this.resize(); }
  // 초점 흐림은 은은하게. 작은 화면(휴대폰)에서는 더 약하게
  setDof(focus: number, range: number, amount: number) {
    const u = this.post.uniforms;
    const small = Math.min(window.innerWidth, window.innerHeight) < 500;
    u.uFocus.value = focus; u.uFocusRange.value = range * 1.3; u.uDof.value = this.dofOn ? amount * (small ? 0.35 : 0.6) : 0;
  }
  pixelRatio = 1;

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // 기기 배율 안에서, 점 개수 한도를 넘지 않는 가장 선명한 배율 (최소 1)
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, this.maxDpr, Math.sqrt(this.budget / Math.max(1, w * h))));
    this.pixelRatio = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    // 캔버스와 꼭 같은 크기 (three 는 내림을 써요. 1px 차이로 화면 전체가 반 픽셀 흐려지지 않게)
    const db = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rw = Math.max(2, db.x), rh = Math.max(2, db.y);
    this.rt.setSize(rw, rh);
    this.post.uniforms.uRes.value.set(rw, rh);
    this.post.uniforms.uPx.value = dpr / 1.6;
  }

  render(scene: THREE.Scene, cam: THREE.PerspectiveCamera) {
    this.tmp.copy(LIGHT_W).transformDirection(cam.matrixWorldInverse);
    shared.uLightV.value.copy(this.tmp);
    this.post.uniforms.uNear.value = cam.near;
    this.post.uniforms.uFar.value = cam.far;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.clear();
    this.renderer.render(scene, cam);
    this.post.uniforms.tColor.value = this.rt.texture;
    this.post.uniforms.tDepth.value = this.rt.depthTexture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }

  // 화면과 따로 작은 그림을 찍어요 (도감 사진, 재료 카드 그림)
  snapshot(scene: THREE.Scene, cam: THREE.PerspectiveCamera, w: number, h: number, clear = '#FFF8EE'): HTMLCanvasElement {
    const key = w + 'x' + h;
    let pair = this.snapRT.get(key);
    if (!pair) { pair = { rt: this.makeRT(w, h), out: new THREE.WebGLRenderTarget(w, h) }; this.snapRT.set(key, pair); }
    const { rt, out } = pair;
    const prevClear = new THREE.Color(); this.renderer.getClearColor(prevClear);
    this.renderer.setClearColor(clear, 1);
    this.tmp.copy(LIGHT_W).transformDirection(cam.matrixWorldInverse);
    shared.uLightV.value.copy(this.tmp);
    this.renderer.setRenderTarget(rt);
    this.renderer.clear();
    this.renderer.render(scene, cam);
    const u = this.post.uniforms;
    const keep = { c: u.tColor.value, d: u.tDepth.value, r: u.uRes.value.clone(), n: u.uNear.value, f: u.uFar.value, dof: u.uDof.value, px: u.uPx.value };
    u.tColor.value = rt.texture; u.tDepth.value = rt.depthTexture; u.uRes.value.set(w, h); u.uNear.value = cam.near; u.uFar.value = cam.far; u.uDof.value = 0; u.uPx.value = 1;
    this.renderer.setRenderTarget(out);
    this.renderer.render(this.postScene, this.postCam);
    const px = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(out, 0, 0, w, h, px);
    this.renderer.setRenderTarget(null);
    u.tColor.value = keep.c; u.tDepth.value = keep.d; u.uRes.value.copy(keep.r); u.uNear.value = keep.n; u.uFar.value = keep.f; u.uDof.value = keep.dof; u.uPx.value = keep.px;
    this.renderer.setClearColor(prevClear, 1);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    g.putImageData(img, 0, 0);
    return c;
  }
}

// ── 기기 성능에 맞춰 화질 고르기 ─────────────────────────
export type Tier = 'high' | 'mid' | 'low';
// budget: 한 화면에 그리는 점 개수 한도. 태블릿(1280×800)은 높음 1.65배·보통 1.36배·낮음 1.1배,
// 휴대폰은 화면이 작아 낮음에서도 1.5배 이상으로 또렷해요
export const TIERS: Record<Tier, { budget: number; maxDpr: number; dof: boolean }> = {
  high: { budget: 2.9e6, maxDpr: 2, dof: true },
  mid: { budget: 1.9e6, maxDpr: 1.75, dof: true },
  low: { budget: 1.25e6, maxDpr: 1.5, dof: false },
};
export class QualityProbe {
  private frames: number[] = [];
  done = false;
  constructor(public tier: Tier, private onChange: (t: Tier) => void, private locked = false) {}
  sample(dt: number) {
    if (this.done || this.locked) return;
    this.frames.push(dt);
    if (this.frames.length < 120) return;
    const s = this.frames.slice(20).sort((a, b) => a - b);
    const med = s[Math.floor(s.length * 0.6)];
    this.frames = [];
    if (med > 0.026 && this.tier !== 'low') {
      this.tier = this.tier === 'high' ? 'mid' : 'low';
      this.onChange(this.tier);
    } else this.done = true;
  }
}
