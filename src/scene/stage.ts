import * as THREE from 'three';
import { sfx, startBubble, stopBubble } from '../core/sound';
import { ease, lerp, tween, wait } from '../core/tween';
import { ING } from '../data/ingredients';
import type { ChibiSpec, Customer, Ingredient, Picks } from '../data/types';
import { lighten } from '../paint/brush';
import { heartCanvas, sparkleCanvas, steamCanvas, tex, woodCanvas } from '../paint/textures';
import { wc, type WatercolorRenderer } from '../render/watercolor';
import { addRipple, Bubbles } from './broth';
import { Chibi, LEG, type Act, type Mood } from './chibi';
import { animateRamen, buildRamen, itemModel, makeBowl, makeCookChopsticks, makeLadle, noodleBlock, POT_R, RAINBOW } from './food';
import { makeShadow, wispTex } from './fx';
import { disposeTree, M } from './geo';
import { makeOwnerPaws, type Paw } from './paws';
import { makeProp } from './props';
import { makeShop, makeSteam } from './shop';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
type View = 'guest' | 'pot' | 'door' | 'wide' | 'serve' | 'eat' | 'eat2';
const VIEWS: Record<View, { pos: [number, number, number]; look: [number, number, number]; focus: number; range: number; dof: number }> = {
  guest: { pos: [0, 1.6, 1.6], look: [0, 1.32, -0.8], focus: 2.25, range: 1.1, dof: 0.6 },
  pot: { pos: [0, 1.78, 1.28], look: [0, 0.96, 0.52], focus: 0.95, range: 0.45, dof: 1 },
  serve: { pos: [-0.2, 1.74, 1.3], look: [-0.22, 0.95, 0.56], focus: 0.95, range: 0.5, dof: 0.9 },
  door: { pos: [0.2, 1.6, 1.6], look: [0.9, 1.2, -1.0], focus: 3.2, range: 1.4, dof: 0.4 },
  eat: { pos: [-0.5, 1.34, 0.64], look: [0.05, 1.2, -0.42], focus: 1.25, range: 0.55, dof: 0.9 },
  eat2: { pos: [0, 1.36, 0.95], look: [0, 1.2, -0.45], focus: 1.4, range: 0.6, dof: 0.8 },
  wide: { pos: [0, 1.75, 2.1], look: [0, 1.35, -0.8], focus: 2.9, range: 1.6, dof: 0.35 },
};
const MOOD_ACT: Partial<Record<Mood, Act>> = { sad: 'sad', worried: 'worry', angry: 'fist' };

interface Particle { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; grow: number; g: number }
interface BowlInfo { group: THREE.Group; food: THREE.Group; surfaceY: number; innerR: number; steam: ReturnType<typeof makeSteam> }

// 젓가락에 매달린 면발
class Strands {
  group = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private mat: THREE.Material;
  private jit: THREE.Vector3[] = [];
  constructor(color: string, private n = 5, private r = 0.0055) {
    this.mat = M(color, { rim: 0.6, spec: 0.45 });
    for (let i = 0; i < n; i++) this.jit.push(V((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05));
  }
  set(base: THREE.Vector3, tip: THREE.Vector3, sag: number, lift = 0) {
    this.clearGeo();
    for (let i = 0; i < this.n; i++) {
      const a = base.clone().add(this.jit[i]).lerp(tip, lift);
      const b = tip.clone().add(V(this.jit[i].x * 0.08, 0, this.jit[i].z * 0.08));
      const m1 = a.clone().lerp(b, 0.33).add(V(this.jit[i].x * 0.3, -sag * 0.8, this.jit[i].z * 0.3));
      const m2 = a.clone().lerp(b, 0.66).add(V(this.jit[i].x * 0.2, -sag * 0.5, 0));
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, m1, m2, b]), 14, this.r, 5);
      const mm = new THREE.Mesh(g, this.mat);
      this.group.add(mm);
      this.meshes.push(mm);
    }
  }
  private clearGeo() { for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); } this.meshes = []; }
  dispose() { this.clearGeo(); this.group.removeFromParent(); }
}

// 긴 젓가락에 걸쳐 양쪽으로 축 늘어진 면발 (사장님이 냄비에서 그릇으로 옮길 때)
// 끝은 처음엔 냄비 국물에 붙어 있다가(attach=1) 들어 올리면 떨어져 늘어지고(attach=0),
// 그릇에 내려놓으면 국물 면에 닿아 옆으로 퍼져요.
class HangingNoodles {
  group = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private mats: THREE.Material[];
  private seeds: { dx: number; dz: number; la: number; lb: number; sa: THREE.Vector3; sb: THREE.Vector3; ph: number; c: number }[] = [];
  constructor(colors: string[], private n = 8, private r = 0.0055, private wig = 0.006) {
    this.mats = colors.map((c) => M(c, { rim: 0.6, spec: 0.45 }));
    for (let i = 0; i < n; i++) {
      const rs = () => { const a = Math.random() * PI * 2, d = 0.02 + Math.random() * 0.05; return V(Math.cos(a) * d, 0, Math.sin(a) * d); };
      this.seeds.push({ dx: (Math.random() - 0.5) * 0.03, dz: (Math.random() - 0.5) * 0.014, la: 0.1 + Math.random() * 0.08, lb: 0.07 + Math.random() * 0.08, sa: rs(), sb: rs(), ph: Math.random() * 6.28, c: i % colors.length });
    }
  }
  // tip: 젓가락 끝, attach: 바닥에 붙은 정도, ground: 바닥(국물 면) 가운데, sway: 움직임 반대로 쏠리는 정도
  set(tip: THREE.Vector3, attach: number, ground: THREE.Vector3, sway = V(), alpha = 1) {
    this.clear();
    const gy = ground.y + 0.003;
    this.seeds.forEach((s, i) => {
      const top = tip.clone().add(V(s.dx, 0.006, s.dz));
      const end = (len: number, side: number, onGround: THREE.Vector3) => {
        const hang = top.clone().add(V(side * 0.012 + sway.x * len, -len, side * 0.006 + sway.z * len));
        const e = hang.lerp(ground.clone().add(onGround), attach);
        // 바닥 아래로는 내려가지 않고 옆으로 퍼져요
        if (e.y < gy) {
          const out = V(e.x - top.x, 0, e.z - top.z);
          if (out.lengthSq() < 1e-6) out.set(side, 0, 0.3);
          out.normalize().multiplyScalar((gy - e.y) * 0.9);
          e.add(out); e.y = gy;
        }
        return e;
      };
      const ea = end(s.la, -1, s.sa), eb = end(s.lb, 1, s.sb);
      const pts: THREE.Vector3[] = [];
      const seg = (a: THREE.Vector3, b: THREE.Vector3, from: number, to: number) => {
        for (let k = from; k <= to; k++) {
          const t = k / 4;
          const p = a.clone().lerp(b, t);
          const w = Math.sin(t * PI) * this.wig;
          p.x += Math.sin(s.ph + t * 9 + i) * w; p.z += Math.cos(s.ph + t * 7) * w;
          pts.push(p);
        }
      };
      seg(ea, top, 0, 3);
      pts.push(top.clone().add(V(0, 0.004, 0)));
      seg(top, eb, 1, 4);
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, this.r, 5);
      const m = new THREE.Mesh(g, this.mats[s.c]);
      this.group.add(m);
      this.meshes.push(m);
    });
    this.mats.forEach((m) => { const u = (m as THREE.ShaderMaterial).uniforms; if (u?.uAlpha) { u.uAlpha.value = alpha; (m as THREE.ShaderMaterial).transparent = alpha < 1; } });
  }
  private clear() { for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); } this.meshes = []; }
  dispose() { this.clear(); this.group.removeFromParent(); }
}

export class Stage {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(46, 1, 0.05, 30);
  shop = makeShop();
  paws = makeOwnerPaws();
  potFood = new THREE.Group();
  potSteam: ReturnType<typeof makeSteam>;
  guests: Chibi[] = [];
  shadows: THREE.Mesh[] = [];
  props: THREE.Object3D[] = [];
  bowls: THREE.Group[] = [];
  bowlInfo: BowlInfo[] = [];
  bowlSteam: ReturnType<typeof makeSteam>[] = [];
  dof = { focus: 2.25, range: 1.1, amount: 0.6 };
  private look = new THREE.Vector3(...VIEWS.guest.look);
  private parts: Particle[] = [];
  private texSteam = tex(steamCanvas());
  private texSpark = tex(sparkleCanvas());
  private texHeart = tex(heartCanvas());
  private t = 0;
  private picks: Picks | null = null;
  private served: Picks | null = null;
  private bubbles: Bubbles | null = null;
  view: View = 'guest';
  phase = '';
  pawsOn = false;
  private baseAct: Act[] = [];
  private thumbScene = new THREE.Scene();
  private thumbCam = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
  private photoScene = new THREE.Scene();
  private photoCam = new THREE.PerspectiveCamera(34, 1, 0.01, 10);

  constructor(private wcr: WatercolorRenderer) {
    this.scene.add(this.shop.root);
    this.scene.add(this.cam);
    this.cam.add(this.paws.group);
    this.paws.group.visible = false;
    this.shop.pot.add(this.potFood);
    this.potFood.position.y = 0.12;
    this.potSteam = makeSteam(wispTex(), 9);
    this.potSteam.group.position.set(0, 0.16, 0);
    this.shop.pot.add(this.potSteam.group);
    const potShadow = makeShadow(0.62, 0.62, 0.55);
    potShadow.position.set(0, 0.922, 0.66);
    this.scene.add(potShadow);
    this.setView('guest', 0);

    this.thumbCam.position.set(0, 0.42, 0.52);
    this.thumbCam.lookAt(0, 0.07, 0);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), wc('#FFFFFF', { map: tex(woodCanvas('#D7A979', 13, 5)), rim: 0 }));
    table.rotation.x = -PI / 2;
    this.photoScene.add(table);
    this.photoCam.position.set(0, 0.5, 0.36);
    this.photoCam.lookAt(0, 0.03, 0);
  }

  private vw = 1; private vh = 1; private shift = 0; private shiftTarget = 0;
  setShift(px: number) { this.shiftTarget = px; }
  private applyShift() {
    if (Math.abs(this.shift) < 0.5 && this.shiftTarget === 0) { if (this.cam.view) this.cam.clearViewOffset(); this.shift = 0; return; }
    this.cam.setViewOffset(this.vw, this.vh, 0, this.shift, this.vw, this.vh);
  }
  resize(w: number, h: number) {
    this.vw = w; this.vh = h;
    const a = w / h;
    this.cam.aspect = a;
    this.cam.fov = a < 1.25 ? 46 * Math.pow(1.25 / a, 0.75) : 46;
    this.cam.updateProjectionMatrix();
  }

  setView(v: View, dur = 0.9): Promise<void> {
    this.view = v;
    const from = this.cam.position.clone(), fromL = this.look.clone();
    const to = new THREE.Vector3(...VIEWS[v].pos), toL = new THREE.Vector3(...VIEWS[v].look);
    const d0 = { ...this.dof }, d1 = { focus: VIEWS[v].focus, range: VIEWS[v].range, amount: VIEWS[v].dof };
    if (dur <= 0) { this.cam.position.copy(to); this.look.copy(toL); this.cam.lookAt(this.look); Object.assign(this.dof, d1); return Promise.resolve(); }
    return tween(dur, (k) => {
      this.cam.position.lerpVectors(from, to, k);
      this.look.lerpVectors(fromL, toL, k);
      this.cam.lookAt(this.look);
      this.dof.focus = lerp(d0.focus, d1.focus, k); this.dof.range = lerp(d0.range, d1.range, k); this.dof.amount = lerp(d0.amount, d1.amount, k);
    }, { ease: ease.inOutCubic });
  }

  showPaws(on: boolean) {
    this.pawsOn = on;
    this.paws.group.visible = true;
    for (const p of [this.paws.L, this.paws.R]) p.target.copy(p.rest).add(V(0, on ? 0 : -0.45, 0));
    if (!on) setTimeout(() => { if (!this.pawsOn) this.paws.group.visible = false; }, 600);
  }
  // 앞발을 세상 속 한 점으로 보내요
  private pawAt(p: Paw, w: THREE.Vector3 | null) {
    if (!w) { p.target.copy(p.rest); return; }
    this.cam.updateMatrixWorld();
    p.target.copy(this.paws.group.worldToLocal(w.clone()));
  }
  private camPoint(x: number, y: number, z: number) { this.cam.updateMatrixWorld(); return this.cam.localToWorld(V(x, y, z)); }

  // ── 손님 ─────────────────────────────
  private addGuest(s: ChibiSpec) {
    const ch = new Chibi(s);
    this.scene.add(ch.root);
    this.guests.push(ch);
    const sh = makeShadow(0.55, 0.45, 0.5);
    this.scene.add(sh);
    this.shadows.push(sh);
    this.baseAct.push('idle');
    return ch;
  }

  private async walkTo(ch: Chibi, to: THREE.Vector3, speed = 0.95) {
    const from = ch.root.position.clone();
    const flat = V(to.x - from.x, 0, to.z - from.z);
    const dist = flat.length();
    if (dist < 0.01) return;
    const yaw0 = ch.root.rotation.y, yaw1 = Math.atan2(flat.x, flat.z);
    let dy = yaw1 - yaw0; while (dy > PI) dy -= 2 * PI; while (dy < -PI) dy += 2 * PI;
    ch.walking = 1;
    await tween(dist / speed, (k) => {
      ch.root.position.x = lerp(from.x, to.x, k);
      ch.root.position.z = lerp(from.z, to.z, k);
      ch.root.position.y = LEG;
      ch.root.rotation.y = yaw0 + dy * Math.min(1, k * 4);
    }, { ease: ease.linear });
    ch.walking = 0;
  }
  private async turnTo(ch: Chibi, yaw: number, dur = 0.35) {
    const y0 = ch.root.rotation.y;
    let dy = yaw - y0; while (dy > PI) dy -= 2 * PI; while (dy < -PI) dy += 2 * PI;
    await tween(dur, (k) => { ch.root.rotation.y = y0 + dy * k; });
  }

  async enter(c: Customer) {
    this.clearGuests();
    const specs: ChibiSpec[] = Array.isArray(c.chibi) ? c.chibi : [c.chibi];
    specs.forEach((s, i) => {
      const ch = this.addGuest(s);
      ch.root.position.copy(this.shop.doorOut).add(V(i * 0.1, LEG, -i * 0.45));
      ch.root.rotation.y = 0;
    });
    this.shop.openDoor(true);
    sfx.door(); sfx.bell();
    this.swingBell();
    await Promise.all(this.guests.map(async (ch, i) => {
      await wait(i * 0.45);
      await this.walkTo(ch, this.shop.doorPos.clone().add(V(0, 0, 0.1)));
      if (i === this.guests.length - 1) setTimeout(() => this.shop.openDoor(false), 500);
      const seat = this.shop.seat(i, specs.length);
      await this.walkTo(ch, V(seat.x, 0, seat.z - 0.32));
      await this.turnTo(ch, 0);
      ch.play('bow');
      await wait(1.1);
      ch.play('idle');
      const p0 = ch.root.position.clone();
      await tween(0.5, (k) => {
        ch.root.position.x = lerp(p0.x, seat.x, k);
        ch.root.position.z = lerp(p0.z, seat.z, k);
        ch.root.position.y = lerp(LEG, seat.y, k) + Math.sin(k * PI) * 0.28;
      }, { ease: ease.outQuad });
      ch.seated = true;
    }));
    const p = c.propModel !== 'none' ? makeProp(c.propModel) : null;
    if (p) {
      p.position.set(specs.length > 1 ? 0 : 0.42, 1.035, -0.12);
      if (['cane', 'broom'].includes(c.propModel)) p.position.set(0.36, 1.035, -0.3);
      else p.add(makeShadow(0.32, 0.28, 0.45));
      this.scene.add(p);
      this.props.push(p);
      p.scale.setScalar(0.01);
      tween(0.4, (k) => p.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack });
    }
  }

  // 시험용: 손님을 바로 자리에 앉혀요
  showInstant(c: Customer) {
    this.clearGuests();
    const specs: ChibiSpec[] = Array.isArray(c.chibi) ? c.chibi : [c.chibi];
    specs.forEach((s, i) => {
      const ch = this.addGuest(s);
      ch.root.position.copy(this.shop.seat(i, specs.length));
      ch.seated = true;
    });
    const p = c.propModel !== 'none' ? makeProp(c.propModel) : null;
    if (p) {
      p.position.set(specs.length > 1 ? 0 : 0.42, 1.035, -0.12);
      if (['cane', 'broom'].includes(c.propModel)) p.position.set(0.36, 1.035, -0.3);
      this.scene.add(p); this.props.push(p);
    }
  }

  async leave() {
    const gs = this.guests.slice();
    this.props.forEach((p) => tween(0.3, (k) => p.scale.setScalar(Math.max(0.01, 1 - k))));
    for (const b of this.bowls) tween(0.35, (k) => b.scale.setScalar(Math.max(0.01, 1 - k)));
    await Promise.all(gs.map(async (ch, i) => {
      await wait(i * 0.3);
      ch.bounce = 0; ch.talking = false; ch.manual = false; ch.chewing = false;
      ch.play('wave');
      await wait(0.9);
      ch.play('idle');
      const p0 = ch.root.position.clone();
      await tween(0.4, (k) => { ch.root.position.y = lerp(p0.y, LEG, k) + Math.sin(k * PI) * 0.2; ch.root.position.z = lerp(p0.z, p0.z - 0.3, k); });
      ch.seated = false;
      await this.walkTo(ch, this.shop.doorPos.clone().add(V(0, 0, 0.1)));
      if (i === 0) { this.shop.openDoor(true); sfx.bell(); this.swingBell(); }
      await this.walkTo(ch, this.shop.doorOut.clone().add(V(0, 0, -0.2)));
    }));
    this.shop.openDoor(false);
    this.clearGuests();
  }

  clearGuests() {
    for (const g of this.guests) { this.scene.remove(g.root); disposeTree(g.root); }
    for (const s of this.shadows) this.scene.remove(s);
    for (const p of this.props) { this.scene.remove(p); disposeTree(p); }
    this.clearBowls();
    this.guests = []; this.shadows = []; this.props = []; this.baseAct = [];
  }
  clearBowls() {
    for (const b of this.bowls) { this.scene.remove(b); disposeTree(b); }
    this.bowls = []; this.bowlInfo = []; this.bowlSteam = [];
  }

  talk(i: number, on: boolean) {
    this.guests.forEach((g, k) => {
      g.talking = on && k === i;
      if (!g.manual) g.play(g.talking ? 'talk' : this.baseAct[k] ?? 'idle');
    });
  }
  mood(m: Mood, i = -1) {
    this.guests.forEach((g, k) => {
      if (i >= 0 && i !== k) return;
      g.setMood(m);
      this.baseAct[k] = MOOD_ACT[m] ?? 'idle';
      if (!g.talking && !g.manual) g.play(this.baseAct[k]);
    });
  }

  private swingBell() {
    const b = this.shop.bell;
    tween(1.6, (k) => { b.rotation.z = Math.sin(k * PI * 7) * 0.5 * (1 - k); }, { ease: ease.linear });
  }

  // ── 냄비 ─────────────────────────────
  resetPot() {
    disposeTree(this.potFood);
    this.potFood.clear();
    this.picks = null;
    this.bubbles = null;
    this.potSteam.set(0);
    this.shop.flames.visible = false;
    stopBubble();
  }

  private brothMat() {
    const d = this.potFood.getObjectByName('broth') as THREE.Mesh | undefined;
    return d ? (d.material as THREE.ShaderMaterial) : null;
  }

  private rebuildPot(p: Picks, popId?: string) {
    disposeTree(this.potFood);
    this.potFood.clear();
    const food = buildRamen(p, POT_R * 0.93, 11);
    this.potFood.add(food);
    this.picks = JSON.parse(JSON.stringify(p));
    const hot = !!p.broth;
    this.potSteam.set(hot ? 1 : 0);
    this.shop.flames.visible = hot;
    if (hot) {
      startBubble();
      const bm = this.brothMat();
      if (bm) bm.uniforms.uHot.value = 1;
      const col = p.broth ? ING.get(p.broth)!.look.color : '#F3E3C0';
      this.bubbles = new Bubbles(POT_R * 0.9, M(lighten(col, 0.35), { alpha: 0.85, spec: 0.8, rim: 1 }), 22);
      this.bubbles.on = 1;
      food.add(this.bubbles.mesh);
    } else { stopBubble(); this.bubbles = null; }
    if (popId) {
      const o = food.getObjectByName(popId);
      if (o) { o.scale.setScalar(0.01); tween(0.45, (k) => o.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack }); }
    }
    return food;
  }

  private ripple(x = 0, z = 0, s = 1) { const bm = this.brothMat(); if (bm) addRipple(bm, x, z, s); }

  // 재료를 앞발로 들고 와서 냄비에 쏙
  async toss(ing: Ingredient, picks: Picks) {
    const kind = ing.look.model;
    const model = kind === 'noodle' ? noodleBlock(ing) : itemModel(ing);
    model.scale.setScalar(0.75);
    this.scene.add(model);
    const R = this.paws.R;
    const potW = this.shop.pot.getWorldPosition(V());
    const potTop = potW.clone().add(V(0, 0.27, 0));
    const start = this.camPoint(0.3, -0.3, -0.62);
    const grip = V(0.05, 0.1, 0.05);
    const follow = () => this.pawAt(R, model.position.clone().add(grip));
    const type = kind === 'broth' ? 'pour' : ['sesame', 'pepper', 'salt', 'gimflake', 'giggle', 'oil', 'stargim', 'butter', 'cheese'].includes(kind) ? 'shake' : kind === 'packet' ? 'packet' : 'drop';
    const hover = potTop.clone().add(V(type === 'pour' ? -0.13 : type === 'drop' ? 0.02 : 0.03, type === 'drop' ? -0.02 : 0.02, 0.02));
    model.position.copy(start);
    sfx.whoosh();
    await tween(0.55, (k) => {
      model.position.lerpVectors(start, hover, k);
      model.position.y += Math.sin(k * PI) * 0.18;
      model.rotation.y = (1 - k) * 0.6;
      follow();
    }, { ease: ease.outCubic });

    if (type === 'pour') {
      sfx.pour();
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.018, 0.28, 8), M(ing.look.color, { alpha: 0.85, rim: 0, spec: 0.6 }));
      stream.visible = false;
      this.scene.add(stream);
      await tween(0.35, (k) => { model.rotation.z = k * 1.7; follow(); });
      stream.visible = true;
      stream.position.copy(potW).add(V(-0.035, 0.27, 0.02));
      this.rebuildPot(picks);
      const disc = this.potFood.getObjectByName('broth');
      if (disc) { disc.position.y = -0.1; tween(1.0, (k) => { disc.position.y = lerp(-0.1, 0, k); }); }
      for (let i = 0; i < 4; i++) { this.ripple(-0.2 + Math.random() * 0.1, Math.random() * 0.1, 0.8); await wait(0.24); }
      stream.removeFromParent(); stream.geometry.dispose();
      await tween(0.3, (k) => { model.rotation.z = 1.7 * (1 - k); follow(); });
    } else if (type === 'shake') {
      sfx.sprinkle();
      await tween(0.3, (k) => { model.rotation.z = k * 1.2; follow(); });
      for (let i = 0; i < 3; i++) {
        this.burst(potTop.clone().add(V(0.02, -0.1, 0)), ing.look.color === '#FFFFFF' ? '#FFFFFF' : ing.look.color, 7, 0.4);
        await tween(0.16, (k) => { model.rotation.z = 1.2 + Math.sin(k * PI) * 0.35; follow(); }, { ease: ease.linear });
      }
      this.rebuildPot(picks, ing.id);
      this.ripple(0, 0, 0.5);
      sfx.plop();
      await tween(0.25, (k) => { model.rotation.z = 1.2 * (1 - k); follow(); });
    } else if (type === 'packet') {
      await tween(0.22, (k) => { model.rotation.z = k * 0.3; model.position.y = hover.y + Math.sin(k * PI) * 0.03; follow(); });
      await tween(0.25, (k) => { model.rotation.z = 0.3 + k * 2.2; follow(); });
      sfx.sprinkle();
      this.burst(potTop.clone().add(V(0, -0.12, 0)), ing.look.color2 ?? '#D8783F', 16, 0.45);
      await wait(0.3);
      this.rebuildPot(picks);
      const bm = this.brothMat();
      if (bm) { bm.uniforms.uSwirl.value = 0; tween(1.4, (k) => { bm.uniforms.uSwirl.value = k; }, { ease: ease.outCubic }); }
      this.ripple(0, 0, 0.7);
      sfx.plop();
    } else {
      // 손을 놓으면 퐁당
      const land = potW.clone().add(V(0.02, 0.13, 0.02));
      const from = model.position.clone();
      this.pawAt(R, null);
      await tween(0.36, (k) => { model.position.lerpVectors(from, land, k); model.rotation.x = k * 1.6; model.rotation.z = k * 0.8; }, { ease: ease.inQuad });
      sfx.plop();
      this.burst(land.clone().add(V(0, 0.04, 0)), '#FFFFFF', 9, 0.6);
      if (kind === 'noodle') {
        this.ripple(0, 0, 1.2);
        const pl = model.position.clone();
        tween(0.6, (k) => { model.position.y = pl.y - k * 0.06; model.scale.setScalar(0.75 * (1 - k * 0.5)); }).then(() => { this.scene.remove(model); disposeTree(model); });
        const food = this.rebuildPot(picks);
        const nest = food.getObjectByName('noodles');
        if (nest) { nest.scale.setScalar(0.3); nest.rotation.y = -0.6; tween(0.9, (k) => { nest.scale.setScalar(0.3 + 0.7 * k); nest.rotation.y = -0.6 * (1 - k); }, { ease: ease.outElastic }); }
        await wait(0.5);
        return;
      }
      const lx = (Math.random() - 0.5) * 0.5;
      this.ripple(lx, 0.1, 0.9);
      this.rebuildPot(picks, ing.id);
      this.scene.remove(model);
      disposeTree(model);
      return;
    }
    const away = start.clone().add(V(0.15, -0.15, 0));
    const hv = model.position.clone();
    await tween(0.3, (k) => { model.position.lerpVectors(hv, away, k); model.scale.setScalar(0.75 * (1 - k) + 0.01); follow(); });
    this.pawAt(R, null);
    this.scene.remove(model);
    disposeTree(model);
  }

  removeFromPot(picks: Picks) { sfx.back(); if (!picks.broth && !picks.soup && !picks.noodle && !picks.toppings.length && !picks.finish.length) this.resetPot(); else this.rebuildPot(picks); }
  restorePot(picks: Picks) { if (picks.broth || picks.noodle || picks.soup || picks.toppings.length || picks.finish.length) this.rebuildPot(picks); else this.resetPot(); }

  // ── 그릇 ─────────────────────────────
  private makeBowlFull(picks: Picks): BowlInfo {
    const { group, surfaceY, innerR } = makeBowl(0.17);
    const food = buildRamen(picks, innerR * 0.97, 11);
    food.position.y = surfaceY;
    group.add(food);
    const steam = makeSteam(wispTex(), 6);
    steam.group.position.y = surfaceY + 0.03;
    steam.set(1);
    group.add(steam.group);
    const sh = makeShadow(0.46, 0.46, 0.5);
    sh.position.y = 0.002;
    group.add(sh);
    group.userData.food = food;
    return { group, food, surfaceY, innerR, steam };
  }

  // 국자로 국물을, 젓가락으로 면과 건더기를 옮겨 담아요
  async serve(picks: Picks) {
    const n = Math.max(1, this.guests.length);
    this.served = JSON.parse(JSON.stringify(picks));
    this.clearBowls();
    await this.setView('serve', 0.7);
    this.showPaws(true);
    const B = this.makeBowlFull(picks);
    const bowlHome = V(-0.46, 0.89, 0.64);
    B.group.position.copy(bowlHome);
    B.group.scale.setScalar(0.01);
    this.scene.add(B.group);
    this.bowls.push(B.group); this.bowlInfo.push(B); this.bowlSteam.push(B.steam);
    const bf = B.food;
    const bBroth = bf.getObjectByName('broth');
    const hideKids = bf.children.filter((c) => c.name !== 'broth');
    hideKids.forEach((c) => { c.visible = false; });
    if (bBroth) { bBroth.position.y = -0.06; bBroth.scale.setScalar(0.7); }
    B.steam.set(0);
    sfx.pop();
    await tween(0.35, (k) => B.group.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack });

    const potW = this.shop.pot.getWorldPosition(V());
    const R = this.paws.R;
    const bowlTop = () => B.group.localToWorld(V(0, B.surfaceY, 0));
    const pBroth = this.potFood.getObjectByName('broth');

    // 국자 두 번
    if (pBroth) {
      const ladle = makeLadle();
      const liquid = ladle.getObjectByName('liquid') as THREE.Mesh;
      liquid.material = M(picks.broth ? ING.get(picks.broth)!.look.color : '#F2D27C', { rim: 0, flat: 0.3 });
      this.scene.add(ladle);
      const grip = V(0, 0.16, -0.3);
      // 손잡이가 늘 화면 오른쪽 아래(사장님 손 쪽)를 향하게 돌려요. 기울이기는 손잡이 기준으로
      ladle.rotation.order = 'YXZ';
      const follow = () => {
        const base = this.camPoint(0.3, -0.4, -0.28);
        const dx = base.x - ladle.position.x, dz = base.z - ladle.position.z;
        ladle.rotation.y = Math.atan2(-dx, -dz);
        ladle.updateMatrixWorld();
        this.pawAt(R, ladle.localToWorld(grip.clone()));
      };
      const start = this.camPoint(0.25, -0.25, -0.6);
      ladle.position.copy(start);
      this.phase = 'ladle';
      for (let s = 0; s < 2; s++) {
        const above = potW.clone().add(V(0.02, 0.24, 0.02));
        const dip = potW.clone().add(V(0.04 - s * 0.06, 0.1, 0.02));
        const p0 = ladle.position.clone();
        await tween(0.4, (k) => { ladle.position.lerpVectors(p0, above, k); follow(); });
        await tween(0.3, (k) => { ladle.position.lerpVectors(above, dip, k); follow(); }, { ease: ease.inQuad });
        sfx.plop(); this.ripple(0.15, 0.1, 1);
        liquid.visible = true;
        pBroth.position.y -= 0.022;
        await tween(0.3, (k) => { ladle.position.lerpVectors(dip, above, k); follow(); });
        const over = bowlTop().add(V(0.09, 0.2, 0.02));
        await tween(0.5, (k) => { ladle.position.lerpVectors(above, over, k); ladle.position.y += Math.sin(k * PI) * 0.06; follow(); });
        sfx.pour();
        await tween(0.35, (k) => { ladle.rotation.x = k * 1.15; follow(); });
        liquid.visible = false;
        if (bBroth) { const y0 = bBroth.position.y, s0 = bBroth.scale.x; const last = s === 1; tween(0.5, (k) => { bBroth.position.y = lerp(y0, last ? 0 : -0.028, k); bBroth.scale.setScalar(lerp(s0, last ? 1 : 0.88, k)); }); }
        this.burst(bowlTop().add(V(0, 0.03, 0)), '#FFFFFF', 5, 0.3);
        await tween(0.3, (k) => { ladle.rotation.x = 1.15 * (1 - k); follow(); });
      }
      const p0 = ladle.position.clone();
      await tween(0.3, (k) => { ladle.position.lerpVectors(p0, start, k); follow(); });
      ladle.removeFromParent(); disposeTree(ladle);
    }
    B.steam.set(1);

    // 젓가락으로 면과 건더기
    const chop = makeCookChopsticks();
    this.scene.add(chop);
    const tipLocal = V(0, 0, 0.42);
    const tipW = () => chop.localToWorld(tipLocal.clone());
    // 젓가락은 화면 오른쪽 아래(사장님 손 쪽)에서 집을 곳을 향해 뻗어요. 손은 젓가락 위쪽 1/3을 쥐어요
    const putTip = (w: THREE.Vector3) => {
      const base = this.camPoint(0.3, -0.4, -0.28);
      const dir = w.clone().sub(base).normalize();
      chop.position.copy(w).addScaledVector(dir, -0.42);
      chop.lookAt(w);
      chop.updateMatrixWorld();
      this.pawAt(R, chop.localToWorld(V(0, 0.012, 0.13)));
    };
    putTip(this.camPoint(0.2, -0.25, -0.6));
    const moveTip = async (to: THREE.Vector3, dur: number, arc = 0, carry?: THREE.Object3D, carryOff = V()) => {
      chop.updateMatrixWorld();
      const from = tipW();
      await tween(dur, (k) => {
        const p = from.clone().lerp(to, k); p.y += Math.sin(k * PI) * arc;
        putTip(p);
        if (carry) carry.position.copy(p).add(carryOff);
      });
    };
    const nest = this.potFood.getObjectByName('noodles');
    const bNest = bf.getObjectByName('noodles');
    this.phase = 'noodle';
    if (nest && bNest) {
      // 면은 덩어리째가 아니라 젓가락으로 두 번 나눠 집어 옮겨요
      const ing = picks.noodle ? ING.get(picks.noodle)! : null;
      const style = ing?.look.style ?? 'curly';
      const colors = style === 'rainbow' ? RAINBOW : [ing?.look.color ?? '#F0D088'];
      const thick = style === 'thick' || style === 'chewy' ? 0.0075 : style === 'thin' ? 0.004 : 0.0055;
      const wig = style === 'curly' || style === 'rainbow' ? 0.012 : style === 'long' ? 0.002 : 0.005;
      const potStrands = [...nest.children], bowlStrands = [...bNest.children];
      bowlStrands.forEach((c) => { c.visible = false; });
      bNest.visible = true;
      const nestC = nest.getWorldPosition(V());
      const trips = 2;
      for (let t = 0; t < trips; t++) {
        const spot = nestC.clone().add(V(t ? -0.035 : 0.03, 0.012, t ? 0.02 : -0.015));
        await moveTip(spot.clone().add(V(0, 0.12, 0)), 0.28);
        await moveTip(spot.clone().add(V(0, -0.012, 0)), 0.18);
        const hn = new HangingNoodles(colors, 11, thick, wig);
        this.scene.add(hn.group);
        // 들어 올리기: 처음엔 국물에 붙어 늘어나다가, 떨어지면서 출렁
        const up = spot.clone().add(V(0, 0.26, 0));
        let released = false;
        await tween(0.6, (k) => {
          const tip = spot.clone().lerp(up, ease.outCubic(k));
          putTip(tip);
          const att = k < 0.55 ? 1 : 1 - ease.outCubic((k - 0.55) / 0.45);
          const bounce = k > 0.55 ? Math.sin((k - 0.55) * 26) * 0.25 * (1 - k) : 0;
          hn.set(tip, att, spot, V(0, 0, bounce));
          if (!released && k > 0.6) {
            released = true;
            sfx.plop(); this.ripple(0.05, 0.05, 0.8);
            // 냄비 속 면이 그만큼 줄어요
            const take = potStrands.splice(0, Math.ceil(potStrands.length / (trips - t)));
            take.forEach((c) => { c.visible = false; });
            if (!potStrands.length) nest.visible = false;
            else { const s0 = nest.scale.clone(); tween(0.3, (q) => nest.scale.set(s0.x * (1 - 0.15 * q), s0.y * (1 - 0.35 * q), s0.z * (1 - 0.15 * q))); }
          }
        }, { ease: ease.linear });
        // 그릇 위로 옮기기: 움직이는 반대쪽으로 살짝 쏠려요
        const from = up.clone(), over = bowlTop().add(V(0.01, 0.2, 0));
        const dir = over.clone().sub(from).setY(0).normalize();
        await tween(0.55, (k) => {
          const e = ease.inOutCubic(k);
          const tip = from.clone().lerp(over, e); tip.y += Math.sin(k * PI) * 0.04;
          putTip(tip);
          const v = Math.sin(k * PI) * 0.35 - (k > 0.85 ? Math.sin((k - 0.85) * 40) * 0.1 : 0);
          hn.set(tip, 0, bowlTop(), dir.clone().multiplyScalar(-v));
        }, { ease: ease.linear });
        // 그릇에 내려놓기: 면 끝이 국물에 닿아 퍼지고, 그릇 속 면이 늘어나요
        const down = bowlTop().add(V(0.01, 0.025, 0));
        let placed = false;
        await tween(0.5, (k) => {
          const tip = over.clone().lerp(down, ease.inOutCubic(Math.min(1, k * 1.3)));
          putTip(tip);
          hn.set(tip, 0, bowlTop(), V(), k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1);
          if (!placed && k > 0.62) {
            placed = true;
            sfx.plop();
            const show = bowlStrands.splice(0, Math.ceil(bowlStrands.length / (trips - t)));
            show.forEach((c) => { c.visible = true; c.scale.set(1, 0.4, 1); tween(0.35, (q) => c.scale.set(1, 0.4 + 0.6 * q, 1), { ease: ease.outBack }); });
          }
        }, { ease: ease.linear });
        hn.dispose();
        await moveTip(down.clone().add(V(0, 0.1, 0)), 0.2);
      }
      bowlStrands.forEach((c) => { c.visible = true; });
      nest.visible = false;
    } else if (bNest) bNest.visible = true;

    this.phase = 'topping';
    for (const id of picks.toppings) {
      const src = this.potFood.getObjectByName(id);
      const dst = bf.getObjectByName(id);
      if (!src || !dst) { if (dst) dst.visible = true; continue; }
      const sp = src.getWorldPosition(V());
      await moveTip(sp.clone().add(V(0, 0.02, 0)), 0.3, 0.08);
      this.scene.attach(src);
      dst.visible = true;
      const dp = dst.getWorldPosition(V());
      dst.visible = false;
      await moveTip(dp.clone().add(V(0, 0.03, 0)), 0.45, 0.12, src, V(0, -0.02, 0));
      src.removeFromParent(); disposeTree(src);
      dst.visible = true; dst.scale.setScalar(0.7);
      tween(0.3, (k) => dst.scale.setScalar(0.7 + 0.3 * k), { ease: ease.outBack });
      sfx.pop();
    }
    const away = this.camPoint(0.3, -0.35, -0.6);
    await moveTip(away, 0.3);
    chop.removeFromParent(); disposeTree(chop);
    this.pawAt(R, null);
    for (const f of picks.finish) {
      const dst = bf.getObjectByName(f.id);
      if (!dst) continue;
      sfx.sprinkle();
      const col = ING.get(f.id)!.look.color;
      this.burst(bowlTop().add(V(0, 0.12, 0)), col, 10, 0.3);
      await wait(0.2);
      dst.visible = true;
    }
    hideKids.forEach((c) => { c.visible = true; });
    this.resetPot();
    this.potSteam.set(0.25);
    this.showPaws(false);

    // 두 손님이면 한 그릇 더
    if (n > 1) {
      const B2 = this.makeBowlFull(picks);
      B2.group.position.copy(bowlHome).add(V(-0.38, 0, 0.04));
      B2.group.scale.setScalar(0.01);
      this.scene.add(B2.group);
      this.bowls.push(B2.group); this.bowlInfo.push(B2); this.bowlSteam.push(B2.steam);
      sfx.pop();
      await tween(0.35, (k) => B2.group.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack });
    }

    // 손님 앞으로 내어 주기
    this.phase = 'deliver';
    await wait(0.2);
    sfx.whoosh();
    const cam = this.setView('guest', 1.3);
    await Promise.all(this.bowls.map((b, i) => {
      const seat = this.shop.seat(i, n);
      const from = b.position.clone();
      const mid = V(seat.x, 1.035, 0.2);
      const end = V(seat.x, 1.035, -0.24);
      return tween(1.3, (k) => {
        if (k < 0.5) { const q = k / 0.5; b.position.lerpVectors(from, mid, q); b.position.y += Math.sin(q * PI) * 0.12; }
        else b.position.lerpVectors(mid, end, (k - 0.5) / 0.5);
      }, { ease: ease.inOutCubic, delay: i * 0.15 });
    }));
    await cam;
  }

  // ── 젓가락으로 먹기 ─────────────────────────────
  async eat(onSlurp?: () => void) {
    this.phase = 'eat';
    await this.setView(this.guests.length > 1 ? 'eat2' : 'eat', 0.8);
    await Promise.all(this.guests.map((g, i) => this.eatOne(g, this.bowlInfo[i] ?? this.bowlInfo[0], i * 0.5, onSlurp)));
    await this.setView('guest', 0.8);
    this.phase = 'done';
  }

  private async eatOne(ch: Chibi, B: BowlInfo | undefined, delay: number, onSlurp?: () => void) {
    if (!B) return;
    await wait(delay);
    const bowl = B.group, food = B.food;
    const sc = ch.root.scale.x;
    const surf = () => bowl.localToWorld(V(0, B.surfaceY + 0.01, 0));
    const noodles = food.getObjectByName('noodles');
    const broth = food.getObjectByName('broth');
    const p = this.served;
    const ncol = p?.noodle ? ING.get(p.noodle)!.look.color : '#F0D088';
    ch.manual = true;
    ch.talking = false;
    ch.look = surf();
    ch.showChop(true);
    ch.chop.scale.setScalar(0.01);
    tween(0.3, (k) => ch.chop.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack });
    const bowlW = bowl.getWorldPosition(V());
    // 왼손은 그릇 옆을 살짝 잡아요
    const lh = bowlW.clone().add(V(-0.16, 0.08, -0.02));
    ch.setHand(0, ch.toLocal(lh), ch.toLocal(lh.clone().add(V(1, 0.1, 0))).sub(ch.toLocal(lh)));
    const placeTip = (tip: THREE.Vector3, aimW: THREE.Vector3) => {
      const a = aimW.clone().normalize();
      const hand = tip.clone().addScaledVector(a, -0.23 * sc);
      const hl = ch.toLocal(hand);
      ch.setHand(1, hl, ch.toLocal(hand.clone().add(a)).sub(hl));
    };
    const bites = noodles ? 3 : 1;
    for (let b = 0; b < bites; b++) {
      ch.lean = 0.16;
      ch.headExtra.x = -0.05;
      ch.look = surf();
      const dipTip = surf().add(V((Math.random() - 0.5) * 0.06, -0.005, (Math.random() - 0.5) * 0.04));
      placeTip(dipTip, V(-0.12, -1, 0.25));
      await wait(0.5);
      if (!noodles) break;
      const strands = new Strands(ncol, 6, 0.008 * sc + 0.002);
      this.scene.add(strands.group);
      const base = surf();
      this.phase = 'lift';
      ch.look = null;
      // 입 앞까지 들어 올려요
      await tween(0.65, (k) => {
        const mouth = ch.mouthWorld();
        const tipW = dipTip.clone().lerp(mouth.clone().add(V(0.02, -0.03, 0.07)), ease.inOutCubic(k));
        const aim = V(-0.12, -1, 0.25).normalize().lerp(V(-0.15, 0.62, -0.77).normalize(), ease.inOutCubic(k));
        placeTip(tipW, aim.lengthSq() > 0.01 ? aim : V(0, 1, 0));
        ch.headExtra.x = -0.05 - 0.08 * k;
        ch.lean = 0.16 - 0.14 * k;
        strands.set(base, ch.chopTipWorld(), 0.06 * (1 - k * 0.5), 0);
      }, { ease: ease.linear });
      ch.look = null;
      this.phase = 'slurp';
      // 후루룩
      sfx.slurp();
      onSlurp?.();
      ch.setMood('surprised');
      await tween(0.7, (k) => { strands.set(base, ch.chopTipWorld(), 0.04 * (1 - k), ease.inQuad(k)); }, { ease: ease.linear });
      strands.dispose();
      ch.setMood('eat');
      ch.chewing = true;
      noodles.scale.multiplyScalar(0.82);
      noodles.position.y -= 0.004;
      await wait(0.55);
      ch.chewing = false;
    }
    // 건더기 하나 집어 먹기
    this.phase = 'topbite';
    const topId = p?.toppings[0];
    const top = topId ? food.getObjectByName(topId) : null;
    if (top) {
      ch.lean = 0.14; ch.look = surf(); ch.headExtra.x = -0.05;
      const tp = top.getWorldPosition(V()).add(V(0, 0.02, 0));
      placeTip(tp, V(-0.12, -1, 0.25));
      await wait(0.5);
      this.scene.attach(top);
      top.scale.multiplyScalar(0.7);
      ch.look = null;
      await tween(0.6, (k) => {
        const mouth = ch.mouthWorld();
        const tipW = tp.clone().lerp(mouth.clone().add(V(0.02, -0.02, 0.06)), ease.inOutCubic(k));
        placeTip(tipW, V(-0.12, -1, 0.25).normalize().lerp(V(-0.15, 0.62, -0.77).normalize(), ease.inOutCubic(k)));
        top.position.copy(ch.chopTipWorld()).add(V(0, -0.015, 0));
        ch.lean = 0.14 - 0.12 * k;
        ch.headExtra.x = -0.05 - 0.08 * k;
      }, { ease: ease.linear });
      sfx.pop();
      top.removeFromParent(); disposeTree(top);
      ch.look = null;
      ch.chewing = true;
      await wait(0.6);
      ch.chewing = false;
    }
    // 그릇을 들고 국물 마시기
    this.phase = 'drink';
    ch.showChop(false);
    const home = bowl.position.clone();
    const hands = () => {
      bowl.updateMatrixWorld();
      const l = bowl.localToWorld(V(-0.17, 0.06, 0)), r = bowl.localToWorld(V(0.17, 0.06, 0));
      const ll = ch.toLocal(l), rl = ch.toLocal(r);
      ch.setHand(0, ll, ch.toLocal(r).sub(ll)); ch.setHand(1, rl, ch.toLocal(l).sub(rl));
    };
    hands();
    ch.lean = 0.12;
    await wait(0.35);
    const mouth0 = ch.mouthWorld();
    const lift = mouth0.clone().add(V(0, -0.15, 0.16));
    await tween(0.55, (k) => { bowl.position.lerpVectors(home, lift, k); bowl.rotation.x = -0.15 * k; hands(); ch.lean = 0.12 - 0.2 * k; }, { ease: ease.inOutCubic });
    sfx.slurp();
    onSlurp?.();
    ch.chewing = true;
    await tween(1.0, (k) => {
      bowl.rotation.x = -0.15 - 0.5 * Math.sin(k * PI * 0.5);
      ch.headExtra.x = -0.3 * Math.sin(k * PI * 0.5);
      hands();
      if (broth) { broth.position.y = -0.02 - 0.03 * k; broth.scale.setScalar(1 - 0.3 * k); }
      if (noodles && k > 0.5) noodles.visible = false;
    }, { ease: ease.linear });
    ch.chewing = false;
    await tween(0.5, (k) => { bowl.position.lerpVectors(lift, home, k); bowl.rotation.x = -0.65 * (1 - k); hands(); ch.headExtra.x = -0.3 * (1 - k); }, { ease: ease.inOutCubic });
    bowl.rotation.x = 0;
    food.children.forEach((c) => { if (c.name !== 'broth') c.visible = false; });
    B.steam.set(0.15);
    ch.manual = false;
    ch.look = null;
    ch.headExtra.set(0, 0, 0);
    ch.setMood('eat');
    ch.play('full');
    await wait(0.6);
  }

  celebrate(stars: number, heart: boolean) {
    const head = V();
    this.guests.forEach((g, i) => {
      g.head.getWorldPosition(head);
      g.bounce = stars === 3 ? 1 : stars === 2 ? 0.35 : 0;
      g.droop = 0;
      g.setMood(stars === 3 ? 'delight' : stars === 2 ? 'happy' : 'neutral');
      const act: Act = stars === 3 ? 'cheer' : stars === 2 ? (i % 2 ? 'clap' : 'thumbs') : 'scratch';
      g.play(act);
      this.baseAct[i] = act;
      setTimeout(() => { if (this.guests[i] === g) { this.baseAct[i] = 'idle'; if (!g.talking && !g.manual) g.play('idle'); } }, stars === 3 ? 3200 : 2400);
      if (stars === 3) for (let k = 0; k < 16; k++) this.spawn(this.texSpark, head.clone().add(V((Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.3, 0.2)), V((Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.6, 0.1), 1.4, 0.12 + Math.random() * 0.06, -0.6);
      if (heart) for (let k = 0; k < 4; k++) this.spawn(this.texHeart, head.clone().add(V(0.25 + k * 0.05, 0.3, 0.2)), V(0.05 * (k - 1.5), 0.35, 0), 2.2, 0.12, 0);
    });
    if (stars < 3) setTimeout(() => this.guests.forEach((g) => { g.bounce = 0; }), 2500);
  }

  // ── 작은 그림 찍기 ────────────────────────
  thumb(ing: Ingredient, size = 192): HTMLCanvasElement {
    const m = itemModel(ing);
    this.thumbScene.add(m);
    const c = this.wcr.snapshot(this.thumbScene, this.thumbCam, size, size, '#FFF8EE');
    this.thumbScene.remove(m);
    disposeTree(m);
    return c;
  }

  photo(picks: Picks, size = 512): HTMLCanvasElement {
    const { group, surfaceY, innerR } = makeBowl(0.17);
    const food = buildRamen(picks, innerR * 0.97, 11);
    food.position.y = surfaceY;
    animateRamen(food, 1);
    group.add(food);
    const sh = makeShadow(0.5, 0.5, 0.5); sh.position.y = 0.002; group.add(sh);
    this.photoScene.add(group);
    const c = this.wcr.snapshot(this.photoScene, this.photoCam, size, size, '#F6EBDD');
    this.photoScene.remove(group);
    disposeTree(group);
    return c;
  }

  // ── 반짝이·물방울 ─────────────────────────
  private spawn(t: THREE.Texture, p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, g: number, color?: string) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, color: color ?? '#ffffff' }));
    s.position.copy(p);
    s.scale.setScalar(size);
    s.renderOrder = 6;
    this.scene.add(s);
    this.parts.push({ s, v, life, max: life, grow: size, g });
  }
  burst(p: THREE.Vector3, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * PI * 2;
      this.spawn(this.texSteam, p.clone(), V(Math.cos(a) * speed * 0.4, speed * (0.4 + Math.random()), Math.sin(a) * speed * 0.4), 0.6, 0.035 + Math.random() * 0.03, -2.5, color);
    }
  }

  update(dt: number) {
    this.t += dt;
    if (Math.abs(this.shift - this.shiftTarget) > 0.5 || this.shift !== 0) {
      this.shift += (this.shiftTarget - this.shift) * Math.min(1, dt * 5);
      this.applyShift();
    }
    this.shop.update(dt);
    const camW = this.cam.getWorldPosition(V());
    this.guests.forEach((g, i) => {
      if (!g.manual) g.look = !g.walking && g.seated && this.view !== 'eat' && this.view !== 'eat2' ? camW : null;
      g.update(dt);
      const sh = this.shadows[i];
      if (sh) { sh.position.set(g.root.position.x, 0.004, g.root.position.z); sh.visible = !g.seated; }
    });
    this.potSteam.update(dt);
    this.bowlSteam.forEach((s) => s.update(dt, 0.07, 0.32));
    this.bubbles?.update(dt);
    animateRamen(this.potFood, this.t);
    for (const b of this.bowls) animateRamen(b, this.t);
    if (this.shop.flames.visible) this.shop.flames.children.forEach((f) => { if (f.userData.phase !== undefined) f.scale.y = 0.8 + Math.sin(this.t * 20 + f.userData.phase) * 0.25; });
    if (this.paws.group.visible) {
      for (const [p, k] of [[this.paws.L, 0], [this.paws.R, 1.3]] as const) {
        if (p.target.distanceTo(p.rest) < 0.012) p.target.y = p.rest.y + Math.sin(this.t * 1.6 + k) * 0.006;
        p.update(dt, 16);
      }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life -= dt;
      q.v.y += q.g * dt;
      q.s.position.addScaledVector(q.v, dt);
      const k = q.life / q.max;
      (q.s.material as THREE.SpriteMaterial).opacity = Math.min(1, k * 2);
      if (q.life <= 0) { this.scene.remove(q.s); q.s.material.dispose(); this.parts.splice(i, 1); }
    }
  }

  get currentPicks() { return this.picks; }
}
