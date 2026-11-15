import * as THREE from 'three';
import { shared } from '../render/watercolor';

// 국물 표면: 기름방울, 물결, 스프 가루 무늬, 반짝이는 윤기. 표면은 돌지 않고 제자리에서 끓어요
const VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vV; varying vec3 vN;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor; uniform vec3 uOil; uniform vec3 uPowder; uniform float uSwirl; uniform float uTime; uniform vec3 uLightV;
uniform vec4 uRip[4]; uniform sampler2D uPaper; uniform float uHot; uniform float uAlpha;
varying vec2 vUv; varying vec3 vV; varying vec3 vN;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 h22(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  vec3 col = uColor * mix(1.04, 0.8, smoothstep(0.45, 1.0, r));
  // 스프 가루가 퍼진 무늬 (돌지 않고 제자리에 있어요)
  float sw = n2(vec2(ang * 1.6 + r * 5.0, r * 7.0));
  col = mix(col, uPowder, uSwirl * smoothstep(0.45, 0.85, sw) * 0.55);
  // 물결 고리
  float rip = 0.0; vec2 grad = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 R = uRip[i];
    float t = uTime - R.z;
    if (t > 0.0 && t < 2.5) {
      vec2 dvec = p - R.xy; float d = length(dvec);
      float front = t * 0.75;
      float w = sin((d - front) * 34.0) * exp(-t * 1.6) * exp(-abs(d - front) * 7.0) * R.w;
      rip += w; grad += normalize(dvec + 1e-4) * w;
    }
  }
  // 끓을 때 잔물결: 흐르지 않고 제자리에서 보글보글 일렁여요
  float bub = (n2(p * 9.0) - 0.5) * sin(uTime * 5.0 + n2(p * 4.0 + 3.1) * 6.2831) * uHot;
  col *= 1.0 + rip * 0.22 + bub * 0.06;
  // 기름방울
  vec2 q = p * 4.2;
  vec2 cell = floor(q), f = fract(q);
  float md = 9.0; float sz = 1.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 n = vec2(float(x), float(y));
    vec2 o = h22(cell + n);
    vec2 c = n + 0.5 + 0.35 * sin(6.2831 * o) - f;
    float s = 0.35 + 0.65 * h2(cell + n + 7.0);
    float d = length(c) / s;
    if (d < md) { md = d; sz = s; }
  }
  float oil = smoothstep(0.36, 0.3, md) * step(r, 0.92);
  float ring = (smoothstep(0.36, 0.33, md) - smoothstep(0.3, 0.26, md)) * step(r, 0.92);
  col = mix(col, uOil, oil * 0.45);
  col += vec3(1.0, 0.97, 0.85) * ring * 0.35;
  // 윤기 (빛 반사)
  vec3 n = normalize(vN + vec3(grad.x, 0.0, grad.y) * 0.5 + vec3(bub * 0.3, 0.0, 0.0));
  vec3 v = normalize(vV);
  vec3 rf = reflect(-normalize(uLightV), n);
  float sp = pow(max(dot(rf, v), 0.0), 60.0);
  float glint = smoothstep(0.2, 0.6, sp + oil * 0.3 * sp);
  col = mix(col, vec3(1.0, 0.98, 0.92), glint * 0.6);
  float paper = texture2D(uPaper, gl_FragCoord.xy / 420.0).r;
  col *= 1.0 - (1.0 - paper) * 0.35;
  // 가장자리 물감 고임
  col *= 1.0 - smoothstep(0.86, 1.0, r) * 0.25;
  gl_FragColor = vec4(col, uAlpha);
}`;

export function brothMaterial(color: string, powder: string | null) {
  const c = new THREE.Color(color);
  const oil = c.clone().lerp(new THREE.Color('#F2B740'), 0.55);
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uColor: { value: c },
      uOil: { value: oil },
      uPowder: { value: new THREE.Color(powder ?? color) },
      uSwirl: { value: powder ? 1 : 0 },
      uTime: shared.uTime,
      uLightV: shared.uLightV,
      uPaper: shared.uPaper,
      uRip: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0)) },
      uHot: { value: 0 },
      uAlpha: { value: 1 },
    },
  });
}

let ripIdx = 0;
export function addRipple(m: THREE.ShaderMaterial, x: number, z: number, strength = 1) {
  const arr = m.uniforms.uRip.value as THREE.Vector4[];
  arr[ripIdx++ % 4].set(x, z, shared.uTime.value, strength);
}

// 끓는 거품 (모양은 하나를 같이 써요: 냄비를 다시 만들 때마다 새로 만들면 쌓여요)
let bubbleGeo: THREE.SphereGeometry | null = null;
export class Bubbles {
  mesh: THREE.InstancedMesh;
  private life: { x: number; z: number; t: number; dur: number; s: number }[] = [];
  private m4 = new THREE.Matrix4();
  on = 0;
  constructor(private radius: number, mat: THREE.Material, n = 26) {
    bubbleGeo ??= new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(bubbleGeo, mat, n);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < n; i++) this.life.push(this.spawn(Math.random()));
  }
  private spawn(t = 0) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * this.radius * 0.85;
    return { x: Math.cos(a) * d, z: Math.sin(a) * d, t, dur: 0.5 + Math.random() * 0.7, s: this.radius * (0.03 + Math.random() * 0.05) };
  }
  update(dt: number) {
    this.mesh.visible = this.on > 0.01;
    if (!this.mesh.visible) return;
    this.life.forEach((b, i) => {
      b.t += dt / b.dur;
      if (b.t >= 1) Object.assign(b, this.spawn(0));
      const k = b.t < 0.85 ? b.t / 0.85 : 0;
      const s = b.s * Math.sin(k * Math.PI * 0.5) * this.on;
      this.m4.makeScale(s, s * 0.8, s).setPosition(b.x, 0.002, b.z);
      this.mesh.setMatrixAt(i, this.m4);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
