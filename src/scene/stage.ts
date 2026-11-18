import * as THREE from 'three';
import { sfx, startBubble, stopBubble } from '../core/sound';
import { ease, lerp, tween, wait } from '../core/tween';
import { ING } from '../data/ingredients';
import type { ChibiSpec, Customer, Ingredient, Picks } from '../data/types';
import { lighten } from '../paint/brush';
import { heartCanvas, sparkleCanvas, steamCanvas, tex, woodCanvas } from '../paint/textures';
import { wc, type WatercolorRenderer } from '../render/watercolor';
import { addRipple, Bubbles } from './broth';
import { Chibi, HR, LEG, type Act, type Mood } from './chibi';
import { animateRamen, buildRamen, itemModel, makeBowl, makeCookChopsticks, makeLadle, makePot, makePotGripper, makeSpoon, makeTrivet, noodleBlock, POT_R, RAINBOW } from './food';
import { makeShadow, wispTex } from './fx';
import { disposeTree, M, Mu } from './geo';
import { makeOwnerPaws, type Paw } from './paws';
import { bowlProfile, Drop, GRAV, Liquid, NoodleBundle, potProfile, Stream, type Container, type NoodleLook, type Profile } from './physics';
import { makeProp } from './props';
import { makeShop, makeSteam } from './shop';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// 이만큼(세상 길이) 넘게 튀어나온 주둥이·부리·코는 고개를 숙여 먹어요 (펠리컨·악어·코끼리)
const LONG_SNOUT = 0.12;
const WALL_Z = -1.75; // 문이 달린 뒷벽
// 나갈 때 문 여는 손님: 문 가운데에서 왼쪽으로 x만큼 떨어져 서서(문짝이 쓸고 지나가는 자리 밖), 문을 open(0~1)만큼 당기는 동안
// back만큼 뒤로 물러서요. gap: 얼굴 앞과 벽 사이 틈. snoutTurn: 고개를 옆으로 돌린 긴 주둥이가 앞으로 나오는 비율
const PULL = { x: -0.8, back: [0, 0.2], open: 0.33, dur: 0.85, snoutTurn: 0.825, gap: 0.06 } as const;
const POT_SPOT_Z = -0.02, POT_SPOT_Z2 = -0.1; // 냄비째 내어 줄 때 냄비 자리: 혼자 온 손님, 두 손님 (그릇은 -0.24)
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
interface BowlInfo { group: THREE.Group; food: THREE.Group; surfaceY: number; innerR: number; steam: ReturnType<typeof makeSteam>; kind: 'bowl' | 'pot'; liquid: Liquid | null; box: Container; grips: [THREE.Vector3, THREE.Vector3]; shared: boolean }

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
  // 물리: 국물 면, 젓가락에 걸린 면, 떨어지는 건더기, 매 순간 돌릴 일
  private liquids: Liquid[] = [];
  private bundles: NoodleBundle[] = [];
  private drops: Drop[] = [];
  private jobs: ((dt: number) => boolean)[] = [];
  private extras: THREE.Object3D[] = [];
  private potLiquid: Liquid | null = null;
  private potBox: Container | null = null;
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
    this.scene.add(this.paws.body);
    this.paws.body.visible = false;
    this.shop.pot.add(this.potFood);
    this.potFood.position.y = 0.12;
    // 냄비는 들려 나가기도 하고 속이 계속 바뀌어서 조명을 굽지 않아요 (내어 주는 냄비와 같은 모습)
    this.shop.pot.userData.noBake = true;
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

  // 카메라 자리 = 장면마다 정한 자리(camBase) + 다가가기(dolly).
  // 손이 팔 길이보다 먼 곳(옆 그릇, 손님 앞에 내려놓는 냄비)을 잡을 때 팔이 고무처럼 늘어나 보이지 않게,
  // 카메라(내 몸)가 그쪽으로 수평으로 다가가요. 보는 방향은 그대로라 화면이 그쪽으로 조금 당겨져 보여요
  private camBase = new THREE.Vector3(...VIEWS.guest.pos);
  private dolly = V();
  private dollyWant = V();
  dollyOn = true;
  focusShift = 0; // 다가간 만큼 초점 거리를 줄여요
  private placeCam() {
    this.cam.position.copy(this.camBase).add(this.dolly);
    this.cam.lookAt(this.look.clone().add(this.dolly));
  }
  // 손이 닿아야 하는 곳까지 어깨에서 REACH 안에 들어오려면 카메라가 수평으로 얼마나 다가가야 하나
  private reachDolly(out: THREE.Vector3) {
    out.set(0, 0, 0);
    if (!this.dollyOn || !this.pawsOn || !this.paws.group.visible) return out;
    const REACH = 0.42, MAXD = 0.85;
    this.cam.updateMatrixWorld();
    let best = 0;
    for (const p of [this.paws.L, this.paws.R]) {
      const W = this.paws.group.localToWorld(p.target.clone());
      const S = this.paws.group.localToWorld(p.shoulder.clone()).sub(this.dolly); // 다가가기 전 어깨 자리
      const dx = W.x - S.x, dy = W.y - S.y, dz = W.z - S.z, a = Math.hypot(dx, dz);
      if (a < 1e-4) continue;
      const h = a - (Math.abs(dy) < REACH ? Math.sqrt(REACH * REACH - dy * dy) : 0);
      if (h > best) { best = h; out.set(dx / a, 0, dz / a).multiplyScalar(Math.min(h, MAXD)); }
    }
    return out;
  }

  setView(v: View, dur = 0.9): Promise<void> {
    this.view = v;
    const from = this.camBase.clone(), fromL = this.look.clone();
    const to = new THREE.Vector3(...VIEWS[v].pos), toL = new THREE.Vector3(...VIEWS[v].look);
    const d0 = { ...this.dof }, d1 = { focus: VIEWS[v].focus, range: VIEWS[v].range, amount: VIEWS[v].dof };
    if (dur <= 0) { this.camBase.copy(to); this.look.copy(toL); this.placeCam(); Object.assign(this.dof, d1); return Promise.resolve(); }
    return tween(dur, (k) => {
      this.camBase.lerpVectors(from, to, k);
      this.look.lerpVectors(fromL, toL, k);
      this.placeCam();
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
  private run(job: (dt: number) => boolean) { this.jobs.push(job); }
  // 조건이 맞을 때까지 기다려요 (최대 max 초)
  private until(cond: () => boolean, max = 3) {
    return new Promise<void>((res) => { let t = 0; this.run((dt) => { t += dt; if (cond() || t > max) { res(); return false; } return true; }); });
  }
  private inScene(o: THREE.Object3D) { while (o.parent) o = o.parent; return o === this.scene; }

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
      // 마지막 손님이 문짝이 닫히는 자리를 다 지나간 뒤에 닫아요
      if (i === this.guests.length - 1) wait(1.1).then(() => this.shop.openDoor(false)); // 게임 시간으로 (화면이 멈춰도 같이 멈춰요)
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
    // 문은 가게 안쪽으로 열려요. 문에 가장 가까이 앉은 손님이 손잡이 쪽(문짝이 쓸고 지나가는 자리 밖)에 서서
    // 손잡이를 당겨 열고, 같이 온 친구는 내려선 자리에서 기다렸다가 따라 나가요
    const D = this.shop.doorPos;
    const opener = gs.reduce((a, b) => (b.root.position.x > a.root.position.x ? b : a), gs[0]);
    let opened = () => { /* 문이 열리면 불러요 */ };
    const doorOpened = new Promise<void>((r) => { opened = r; });
    // 문간으로 나가는 길: 벽과 문틀에서 조금 떨어져 걷다가 비스듬히 문간 가운데로 들어가요
    // (활짝 열린 문짝 쪽으로 똑바로 걸어가면 긴 주둥이가 문짝에 닿아요)
    const goOut = async (ch: Chibi) => {
      await this.walkTo(ch, V(D.x - 0.3, 0, D.z + 0.13));
      await this.walkTo(ch, V(D.x - 0.08, 0, D.z - 0.13));
      await this.walkTo(ch, this.shop.doorOut.clone().add(V(0, 0, -0.2)));
    };
    await Promise.all(gs.map(async (ch, i) => {
      await wait(i * 0.3);
      ch.bounce = 0; ch.talking = false; ch.manual = false; ch.chewing = false;
      ch.play('wave');
      await wait(0.9);
      ch.play('idle');
      const p0 = ch.root.position.clone();
      await tween(0.4, (k) => { ch.root.position.y = lerp(p0.y, LEG, k) + Math.sin(k * PI) * 0.2; ch.root.position.z = lerp(p0.z, p0.z - 0.3, k); });
      ch.seated = false;
      if (ch === opener) {
        this.setView('door', 1.3); // 들어올 때처럼 문 쪽을 봐요
        await this.pullDoor(ch);
        opened();
      } else {
        await this.turnTo(ch, Math.atan2(D.x - ch.root.position.x, D.z - ch.root.position.z));
        await doorOpened;
        await wait(0.6 + 0.3 * i);
      }
      await goOut(ch);
    }));
    this.shop.openDoor(false);
    this.clearGuests();
  }

  // 손잡이를 잡고 당겨서 문을 열어요. 문짝이 다가오는 만큼 뒤로 물러서고, 조금 열리면 손을 놓아요 (나머지는 문이 스르르 열려요)
  private async pullDoor(ch: Chibi) {
    const P = PULL;
    const sc = ch.root.scale.x;
    // 문을 바라보고 서요. 주둥이가 벽에 닿지 않을 만큼 떨어져요 (주둥이가 긴 손님은 고개를 옆으로 돌려서 덜 떨어져도 돼요)
    const longSnout = ch.faceReach * sc >= LONG_SNOUT;
    const ext = Math.max(HR, (HR + ch.faceReach) * (longSnout ? P.snoutTurn : 1)) * sc + P.gap;
    const at = V(this.shop.doorPos.x + P.x, 0, WALL_Z + ext);
    // 문 앞으로 가서 문 쪽으로 똑바로 몇 걸음 (그래서 서면 이미 문을 보고 있어요. 제자리에서 돌다가 주둥이가 벽을 쓸지 않게)
    await this.walkTo(ch, at.clone().add(V(0, 0, 0.3)));
    ch.manual = true; // 여기부터는 팔과 고개를 무대가 맡아요
    ch.look = longSnout ? V(at.x - 2, LEG + 1.9 * sc, at.z - 0.5) : null; // 주둥이가 긴 손님은 고개를 문 반대쪽 위로 살짝 돌려요
    await this.walkTo(ch, at);
    const hand = 0; // 왼손(문 쪽 손)으로 잡아요
    const knob = this.shop.knobWorld();
    const into = V();
    const grip = () => {
      this.shop.knobWorld(knob);
      const a = this.shop.doorAngle();
      into.set(-Math.sin(a), 0, -Math.cos(a)); // 손끝은 문짝 쪽
      ch.setHandWorld(hand, knob, into);
    };
    const h0 = ch.handWorld(hand);
    await tween(0.35, (k) => { this.shop.knobWorld(knob); ch.setHandWorld(hand, h0.clone().lerp(knob, k), V(0, 0, -1)); }, { ease: ease.inOutCubic });
    grip();
    await wait(0.15);
    sfx.door(); sfx.bell(); this.swingBell();
    const p = ch.root.position, g0 = p.clone();
    await tween(P.dur, (k) => {
      this.shop.holdDoor(P.open * k);
      p.set(g0.x + P.back[0] * k, g0.y, g0.z + P.back[1] * k);
      grip();
    }, { ease: ease.inOutCubic });
    // 손을 문짝에서 떼어 몸 쪽으로 거두고 나면 문이 마저 열려요
    const k0 = knob.clone(), rest = ch.toWorld(V(-0.2, 0.45, 0.15));
    await tween(0.25, (k) => ch.setHandWorld(hand, k0.clone().lerp(rest, 0.6 * k), into));
    this.shop.openDoor(true);
    ch.manual = false;
    ch.look = null;
  }

  clearGuests() {
    for (const g of this.guests) { this.scene.remove(g.root); disposeTree(g.root); }
    for (const s of this.shadows) { this.scene.remove(s); ((s as THREE.Mesh).material as THREE.Material).dispose(); } // 그림자 그림은 같이 써서 재질만
    for (const p of this.props) { this.scene.remove(p); disposeTree(p); }
    this.clearBowls();
    this.guests = []; this.shadows = []; this.props = []; this.baseAct = [];
  }
  clearBowls() {
    for (const b of this.bowls) { this.scene.remove(b); disposeTree(b); }
    for (const e of this.extras) { this.scene.remove(e); disposeTree(e); }
    for (const b of this.bundles) b.dispose();
    this.bowls = []; this.bowlInfo = []; this.bowlSteam = []; this.extras = []; this.bundles = []; this.drops = [];
    this.shop.pot.visible = true;
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
    this.potLiquid = null;
    this.potBox = null;
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
    const food = buildRamen(p, POT_R * 0.93, 11, this.TOP);
    this.potFood.add(food);
    const prof = potProfile(POT_R, POT_R * 0.93);
    this.potLiquid = this.addLiquid(food, prof);
    this.potBox = this.box(food, prof, this.potLiquid, food.getObjectByName('noodles'), 0.14 * 0.92 * POT_R * 0.93);
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
    const type = kind === 'broth' ? 'pour' : ['sesame', 'pepper', 'salt', 'gimflake', 'giggle', 'oil', 'stargim', 'butter', 'cheese'].includes(kind) ? 'shake' : kind === 'packet' ? 'packet' : 'drop';
    // 건더기는 냄비 속에서와 같은 크기의 작은 접시에 담아 와요 (떨어뜨려도 크기가 그대로)
    const isTop = type === 'drop' && kind !== 'noodle';
    model.scale.setScalar(isTop ? (this.TOP * 1.55) / 1.4 : 0.75);
    this.scene.add(model);
    const R = this.paws.R;
    const potW = this.shop.pot.getWorldPosition(V());
    const potTop = potW.clone().add(V(0, 0.27, 0));
    const start = this.camPoint(0.3, -0.3, -0.62);
    const grip = isTop ? V(0.035, 0.015, 0.03) : V(0.05, 0.1, 0.05);
    const follow = () => this.pawAt(R, model.position.clone().add(grip));
    const hover = potTop.clone().add(V(type === 'drop' ? 0.02 : 0.03, type === 'drop' ? -0.02 : 0.02, 0.02));
    if (type === 'pour') {
      // 다 기울였을 때 주둥이가 냄비 한가운데 위에 오도록 주전자 자리를 계산해요
      model.rotation.set(0, 0, 1.7);
      model.position.set(0, 0, 0);
      model.updateMatrixWorld();
      const lipOff = model.localToWorld(V(-0.125, 0.165, 0));
      model.rotation.set(0, 0, 0);
      hover.copy(potW).add(V(-0.02, 0.27, 0.02)).sub(lipOff);
    }
    model.position.copy(start);
    sfx.whoosh();
    await tween(0.55, (k) => {
      model.position.lerpVectors(start, hover, k);
      model.position.y += Math.sin(k * PI) * 0.18;
      model.rotation.y = (1 - k) * 0.6;
      follow();
    }, { ease: ease.outCubic });

    if (type === 'pour') {
      // 주전자 주둥이에서 국물이 포물선으로 쏟아지고, 냄비 국물이 차오르는 만큼 높아져요
      sfx.pour();
      this.rebuildPot(picks);
      const PL = this.potLiquid, box = this.potBox;
      const floor = box ? box.prof.floorAt(0) : -0.1;
      if (PL) PL.level = floor - 0.003;
      const stream = new Stream(ing.look.color, 0.0085);
      this.scene.add(stream.group);
      const spout = V(-0.125, 0.165, 0);
      let tilt = 0, on = true, rip = 0;
      this.run((dt) => {
        model.updateMatrixWorld();
        const lip = model.localToWorld(spout.clone());
        const flow = THREE.MathUtils.clamp((tilt - 0.95) / 0.6, 0, 1);
        const vel = V(-1, 0, 0).transformDirection(model.matrixWorld).multiplyScalar(0.35 + 0.25 * flow);
        rip += dt;
        stream.update(dt, on ? lip : null, vel, flow, () => (box ? box.obj.localToWorld(V(0, Math.max(box.level(), floor), 0)).y : potW.y + 0.02), (p) => {
          if (PL) PL.level = Math.min(0, Math.max(PL.level, floor + 0.003) + 0.0016);
          if (rip > 0.1 && box && PL) { rip = 0; this.splash({ food: box.obj, liquid: PL, box }, p, 0.6, '#FFFFFF'); }
        });
        return on || !stream.empty;
      });
      await tween(0.55, (k) => { tilt = k * 1.7; model.rotation.z = tilt; follow(); });
      await this.until(() => !PL || PL.level >= -0.002, 1.8);
      on = false;
      if (PL) PL.level = 0;
      await tween(0.3, (k) => { tilt = 1.7 * (1 - k); model.rotation.z = tilt; follow(); });
      await this.until(() => stream.empty, 0.6);
      stream.dispose();
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
      if (isTop) {
        // 접시를 기울이면 건더기가 미끄러져 떨어지고, 국물 위에서 둥둥 흔들리다 자리를 잡아요
        this.rebuildPot(picks);
        const dst = this.potFood.getObjectByName(ing.id);
        const top = model.children[1];
        if (dst && top) {
          dst.visible = false;
          const dp = dst.getWorldPosition(V()), dq = dst.getWorldQuaternion(new THREE.Quaternion());
          const to = dp.clone().sub(model.position).setY(0).normalize();
          await tween(0.22, (k) => { model.rotation.z = -k * 0.5 * Math.sign(to.x || 1); model.rotation.x = k * 0.5 * to.z; follow(); });
          this.scene.attach(top);
          const box = this.potBox, PL = this.potLiquid;
          const drop = new Drop(top, dp, dq, (p, sp) => { sfx.plop(); if (box && PL) this.splash({ food: box.obj, liquid: PL, box }, p, sp, '#FFFFFF'); }, to.multiplyScalar(0.25).add(V(0, 0.05, 0)));
          this.drops.push(drop);
          const hv = model.position.clone(), away = this.camPoint(0.3, -0.3, -0.62);
          await tween(0.3, (k) => { model.position.lerpVectors(hv, away, k); follow(); });
          this.pawAt(R, null);
          this.scene.remove(model); disposeTree(model);
          await this.until(() => drop.done, 1.4);
          top.removeFromParent(); disposeTree(top);
          dst.visible = true;
          return;
        }
      }
      // 손을 놓으면 중력으로 떨어져 퐁당 (h = ½gt² 그대로의 시간)
      const land = potW.clone().add(V(0.02, 0.13, 0.02));
      const from = model.position.clone();
      this.pawAt(R, null);
      const fall = Math.sqrt((2 * Math.max(0.02, from.y - land.y)) / GRAV);
      await tween(fall, (k) => { model.position.lerpVectors(from, land, k); model.rotation.x = k * 1.6; model.rotation.z = k * 0.8; }, { ease: ease.inQuad });
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

  // ── 그릇·냄비 ─────────────────────────────
  // 건더기 크기 기준: 냄비 속 달걀과 그릇 속 달걀이 같은 크기예요
  private readonly TOP = 0.17 * 0.86 * 0.97;

  // 면이 닿는 바닥(국물 면 + 소복한 면 더미)과 벽을 알려 주는 그릇 정보
  private box(food: THREE.Object3D, prof: Profile, liq: Liquid | null, nest: THREE.Object3D | null | undefined, dome: number): Container {
    const total = nest ? nest.children.length : 0;
    return {
      obj: food, prof,
      level: () => (liq && liq.mesh.visible ? liq.level : prof.floorAt(0)),
      mound: () => {
        if (!nest || !nest.visible || !total) return 0;
        const vis = nest.children.filter((c) => c.visible && !c.userData.loose).length;
        return dome * nest.scale.y * Math.min(1, vis / total);
      },
    };
  }
  private addLiquid(food: THREE.Object3D, prof: Profile) {
    const disc = food.getObjectByName('broth') as THREE.Mesh | undefined;
    if (!disc) return null;
    const L = new Liquid(disc, prof);
    this.liquids.push(L);
    return L;
  }
  private liquidColor(L: Liquid | null) {
    const u = L ? (L.mesh.material as THREE.ShaderMaterial).uniforms?.uColor : null;
    return u ? '#' + (u.value as THREE.Color).getHexString() : '#E9B66A';
  }

  private makeBowlFull(picks: Picks): BowlInfo {
    const { group, surfaceY, innerR } = makeBowl(0.17);
    const fr = innerR * 0.97;
    const food = buildRamen(picks, fr, 11, this.TOP);
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
    const prof = bowlProfile(0.17, fr);
    const liquid = this.addLiquid(food, prof);
    const box = this.box(food, prof, liquid, food.getObjectByName('noodles'), 0.14 * 0.92 * fr);
    return { group, food, surfaceY, innerR, steam, kind: 'bowl', liquid, box, grips: [V(-0.165, 0.075, 0), V(0.165, 0.075, 0)], shared: false };
  }

  private makePotFull(picks: Picks): BowlInfo {
    const group = new THREE.Group();
    group.add(makePot());
    const fr = POT_R * 0.93;
    const food = buildRamen(picks, fr, 11, this.TOP);
    food.position.y = 0.12;
    group.add(food);
    const steam = makeSteam(wispTex(), 8);
    steam.group.position.y = 0.17;
    steam.set(1);
    group.add(steam.group);
    const sh = makeShadow(0.62, 0.62, 0.5);
    sh.position.y = 0.002;
    group.add(sh);
    group.userData.food = food;
    const prof = potProfile(POT_R, fr);
    const liquid = this.addLiquid(food, prof);
    const box = this.box(food, prof, liquid, food.getObjectByName('noodles'), 0.14 * 0.92 * fr);
    return { group, food, surfaceY: 0.12, innerR: fr, steam, kind: 'pot', liquid, box, grips: [V(-(POT_R + 0.062), 0.14, 0), V(POT_R + 0.062, 0.14, 0)], shared: false };
  }

  // 면 종류마다 굵기·꼬불거림·뻣뻣함이 달라요
  private noodleLook(picks: Picks | null, small = false): NoodleLook {
    const ing = picks?.noodle ? ING.get(picks.noodle)! : null;
    const style = ing?.look.style ?? 'curly';
    const colors = style === 'rainbow' ? RAINBOW : [ing?.look.color ?? '#F0D088'];
    const radius = (style === 'thick' || style === 'chewy' ? 0.0062 : style === 'thin' ? 0.0034 : 0.0046) * (small ? 0.9 : 1);
    const wig = style === 'curly' || style === 'rainbow' ? 0.0055 : style === 'long' ? 0.0008 : 0.0025;
    const len = (style === 'long' ? 0.42 : 0.32) * (small ? 0.72 : 1);
    const bend = style === 'thick' || style === 'chewy' ? 0.3 : 0.12;
    return { colors, radius, wig, len, bend };
  }

  // 국물에 무언가 떨어졌을 때: 물결, 튀는 물방울, 살짝 출렁
  private splash(B: { food: THREE.Object3D; liquid: Liquid | null; box: Container }, p: THREE.Vector3, speed: number, color: string) {
    const L = B.liquid;
    if (!L || !L.mesh.visible) return;
    const lp = B.food.worldToLocal(p.clone());
    addRipple(L.mesh.material as THREE.ShaderMaterial, lp.x / B.box.prof.refR, -lp.z / B.box.prof.refR, Math.min(1.4, 0.4 + speed));
    L.kick(lp.x * speed * 0.6, lp.z * speed * 0.6);
    const n = Math.min(7, Math.round(speed * 6));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * PI * 2, s = 0.15 + Math.random() * 0.35 * speed;
      this.spawn(this.texSteam, p.clone().add(V(0, 0.005, 0)), V(Math.cos(a) * s * 0.5, s * 1.4, Math.sin(a) * s * 0.5), 0.35, 0.01 + Math.random() * 0.008, -GRAV, color);
    }
  }
  // 면 끝에서 떨어지는 국물 방울
  private drip(p: THREE.Vector3, color: string) { this.spawn(this.texSteam, p.clone(), V(0, -0.05, 0), 0.45, 0.009, -GRAV, color); }

  // 손님 수만큼, 그릇째 또는 냄비째 랜덤으로 내어 줘요
  serveMode: 'bowl' | 'pot' | null = null; // 시험할 때만 정해 둬요
  servedIn: 'bowl' | 'pot' = 'bowl';
  async serve(picks: Picks) {
    this.served = JSON.parse(JSON.stringify(picks));
    this.clearBowls();
    const mode = this.serveMode ?? (Math.random() < 0.5 ? 'pot' : 'bowl');
    this.servedIn = mode;
    if (mode === 'pot') await this.servePot(picks);
    else await this.serveBowls(picks);
  }

  // ── 냄비째: 불을 끄고, 손잡이를 잡아 받침 위로 ─────────────
  private async servePot(picks: Picks) {
    const n = Math.max(1, this.guests.length);
    this.phase = 'potlift';
    // 불을 끄면 끓던 거품이 금세 잦아들어요
    this.shop.flames.visible = false;
    stopBubble();
    const bm = this.brothMat(), bub = this.bubbles;
    tween(0.8, (k) => { if (bub) bub.on = 1 - k; if (bm) bm.uniforms.uHot.value = 1 - k; }, { ease: ease.outCubic });
    // 냄비째 낼 때는 그릇에 덜 일이 없으니 냄비만 비추다가 손님 쪽으로 가요
    if (this.view !== 'pot') await this.setView('pot', 0.6);
    // 받침은 손님 앞 카운터에 미리 놓아요
    const seatX = n > 1 ? 0 : this.shop.seat(0, 1).x;
    // 냄비는 그릇보다 크고 높아서, 손님 쪽으로 붙이면 쉬는 손과 얼굴이 냄비 속으로 들어가요. 사장님 쪽으로 조금 당겨 놓아요
    // (두 손님이 같이 먹는 냄비는 두 사람 사이라 덜 당겨요. 너무 멀면 팔이 길게 늘어나요)
    const spot = V(seatX, 1.035, n > 1 ? POT_SPOT_Z2 : POT_SPOT_Z);
    const trivet = makeTrivet(0.2);
    trivet.position.copy(spot);
    this.scene.add(trivet);
    this.extras.push(trivet);
    // 가게 냄비 자리에 똑같은 '내는 냄비'를 두고, 그 냄비를 들어요
    const P = this.makePotFull(picks);
    P.shared = n > 1;
    const potW = this.shop.pot.getWorldPosition(V());
    P.group.position.copy(potW);
    this.scene.add(P.group);
    this.shop.pot.visible = false;
    this.bowls.push(P.group); this.bowlInfo.push(P); this.bowlSteam.push(P.steam);
    this.showPaws(true);
    const L = this.paws.L, R = this.paws.R;
    L.maxLen = R.maxLen = 1.8;
    // 뜨거운 냄비는 냄비집게 두 개로 앞쪽 테두리를 물어서 들어요
    const clampPose = (sd: number) => {
      const th = sd * 0.9, out = V(Math.sin(th), 0, Math.cos(th));
      const z = V(0, Math.cos(0.75), 0).addScaledVector(out, Math.sin(0.75)).normalize();
      const y = out.clone().addScaledVector(z, -out.dot(z)).normalize();
      const x = y.clone().cross(z);
      const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(out.multiplyScalar(POT_R).add(V(0, 0.148, 0)));
      const pos = V(), q = new THREE.Quaternion(), sc = V();
      m.decompose(pos, q, sc);
      return { pos, q };
    };
    const tongs = [-1, 1].map((sd) => {
      const t = makePotGripper();
      t.scale.setScalar(1.3);
      (t.userData.setOpen as (v: number) => void)(1);
      this.scene.add(t);
      this.extras.push(t);
      const pose = clampPose(sd);
      return { t, sd, pose, paw: sd < 0 ? L : R };
    });
    const hold = () => tongs.forEach(({ t, paw }) => { t.updateMatrixWorld(); this.pawAt(paw, t.localToWorld((t.userData.grip as THREE.Vector3).clone())); });
    // 화면 아래에서 집게를 들고 와 테두리에 대고, 꽉 물어요
    P.group.updateMatrixWorld();
    const pq = P.group.getWorldQuaternion(new THREE.Quaternion());
    const starts = tongs.map(({ sd }) => this.camPoint(sd * 0.35, -0.45, -0.5));
    await tween(0.55, (k) => {
      tongs.forEach(({ t, pose }, i) => {
        const end = P.group.localToWorld(pose.pos.clone());
        t.position.lerpVectors(starts[i], end.clone().add(V(0, 0.06 * (1 - k), 0)), k);
        t.quaternion.copy(pq).multiply(pose.q);
      });
      hold();
    });
    sfx.tap();
    await tween(0.15, (k) => tongs.forEach(({ t }) => (t.userData.setOpen as (v: number) => void)(1 - k)), { ease: ease.linear });
    tongs.forEach(({ t }) => P.group.attach(t));
    // 들어 올리기 (무거우니 천천히 힘을 줘요)
    const from = P.group.position.clone(), up = from.clone().add(V(0, 0.11, 0));
    await tween(0.5, (k) => { P.group.position.lerpVectors(from, up, k); hold(); });
    this.phase = 'deliver';
    sfx.whoosh();
    const cam = this.setView('guest', 1.7);
    const end = spot.clone().add(V(0, 0.022, 0));
    const mid = V((up.x + end.x) / 2, Math.max(up.y, end.y) + 0.13, (up.z + end.z) / 2);
    await tween(1.7, (k) => {
      const e = ease.inOutCubic(k), a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
      P.group.position.set(a * up.x + b * mid.x + c * end.x, a * up.y + b * mid.y + c * end.y, a * up.z + b * mid.z + c * end.z);
      hold();
    }, { ease: ease.linear });
    sfx.soft();
    P.liquid?.kick(0, 0.25);
    await cam;
    // 집게를 벌려 놓고 거둬 가요
    sfx.tap();
    await tween(0.15, (k) => tongs.forEach(({ t }) => (t.userData.setOpen as (v: number) => void)(k)), { ease: ease.linear });
    tongs.forEach(({ t }) => this.scene.attach(t));
    const t0 = tongs.map(({ t }) => t.position.clone());
    const away = tongs.map(({ sd }) => this.camPoint(sd * 0.4, -0.55, -0.45));
    await tween(0.45, (k) => { tongs.forEach(({ t }, i) => { t.position.lerpVectors(t0[i], away[i], k); t.position.y += Math.sin(k * PI) * 0.06; }); hold(); });
    tongs.forEach(({ t }) => { t.visible = false; });
    this.showPaws(false);
    setTimeout(() => { L.maxLen = R.maxLen = 0.5; }, 700);
    this.resetPot();
  }

  // ── 그릇째: 국자로 국물, 젓가락으로 면과 건더기 ─────────────
  private async serveBowls(picks: Picks) {
    const n = Math.max(1, this.guests.length);
    await this.setView('serve', 0.7);
    this.showPaws(true);
    const B = this.makeBowlFull(picks);
    const bowlHome = V(-0.46, 0.89, 0.64);
    B.group.position.copy(bowlHome);
    B.group.scale.setScalar(0.01);
    this.scene.add(B.group);
    this.bowls.push(B.group); this.bowlInfo.push(B); this.bowlSteam.push(B.steam);
    const bf = B.food;
    const hideKids = bf.children.filter((c) => c.name !== 'broth');
    hideKids.forEach((c) => { c.visible = false; });
    if (B.liquid) B.liquid.level = B.box.prof.floorAt(0) - 0.003; // 빈 그릇
    B.steam.set(0);
    sfx.pop();
    await tween(0.35, (k) => B.group.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack });

    const R = this.paws.R;
    const bowlTop = () => B.group.localToWorld(V(0, B.surfaceY, 0));
    await this.ladleBroth(B, R, bowlTop);
    B.steam.set(1);
    await this.chopTransfer(picks, B, R, bowlTop);
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

    // 두 손님이면 한 그릇 더 (왼쪽 손님 몫)
    if (n > 1) {
      const B2 = this.makeBowlFull(picks);
      B2.group.position.copy(bowlHome).add(V(-0.38, 0, 0.04));
      B2.group.scale.setScalar(0.01);
      this.scene.add(B2.group);
      this.bowls.unshift(B2.group); this.bowlInfo.unshift(B2); this.bowlSteam.push(B2.steam);
      sfx.pop();
      await tween(0.35, (k) => B2.group.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack });
    }
    await this.deliverBowls(n);
  }

  // 국자: 떠서 → 그릇 위에서 기울이면 넘치는 만큼 흘러 나와 포물선으로 떨어져요
  private async ladleBroth(B: BowlInfo, R: Paw, bowlTop: () => THREE.Vector3) {
    const PL = this.potLiquid, box = this.potBox;
    if (!PL || !box || !PL.mesh.visible) return;
    this.phase = 'ladle';
    const color = this.liquidColor(PL);
    const potW = this.shop.pot.getWorldPosition(V());
    const ladle = makeLadle();
    const liquid = ladle.getObjectByName('liquid') as THREE.Mesh;
    liquid.material = Mu(color, { rim: 0, flat: 0.3, spec: 0.5 });
    this.scene.add(ladle);
    this.scene.attach(liquid);
    const grip = V(0, 0.16, -0.3), Rc = 0.055, TILT = 1.7; // TILT: 옆으로 기울이는 각(라디안). 손잡이가 비스듬해서 90°보다 조금 더 돌려야 다 흘러요
    // 붓기: 국자를 앞으로 엎지 않고, 손목을 돌려 손잡이를 축으로 옆으로 기울여요.
    // 오른손이라 손등이 왼쪽으로 넘어가며 국자의 왼쪽(내 쪽에서 볼 때) 테두리로 국물이 흘러요
    const HANDLE = V(0, Math.cos(1.0), -Math.sin(1.0)); // 국자 속 → 손잡이 끝 (makeLadle 손잡이 기울기와 같아요)
    const qYaw = new THREE.Quaternion(), qRoll = new THREE.Quaternion();
    const UPV = V();
    let tilt = 0, vol = 0, pouring = true, fillTo = B.box.prof.floorAt(0), lastRip = 0;
    const follow = () => {
      const base = this.camPoint(0.3, -0.4, -0.28);
      qYaw.setFromAxisAngle(V(0, 1, 0), Math.atan2(-(base.x - ladle.position.x), -(base.z - ladle.position.z)));
      qRoll.setFromAxisAngle(HANDLE, tilt);
      ladle.quaternion.copy(qYaw).multiply(qRoll);
      ladle.updateMatrixWorld();
      R.roll = tilt * 0.7;
      this.pawAt(R, ladle.localToWorld(grip.clone()));
    };
    const stream = new Stream(color, 0.0062);
    this.scene.add(stream.group);
    const BL = B.liquid, prof = B.box.prof;
    const bowlY = () => B.food.localToWorld(V(0, BL && BL.mesh.visible ? BL.level : prof.floorAt(0), 0)).y;
    // 매 순간: 국자 속 국물은 수평, 가장 낮은 테두리보다 높아진 만큼 흘러 넘쳐요 (Q ∝ h^1.5)
    this.run((dt) => {
      ladle.updateMatrixWorld();
      const C = ladle.getWorldPosition(V());
      const d = THREE.MathUtils.lerp(Rc, 0.012, vol);
      const surfY = C.y - d;
      let lip: THREE.Vector3 | null = null, flow = 0;
      const vel = V();
      if (vol > 0.004) {
        let low = V(0, 1e3, 0);
        for (let i = 0; i < 20; i++) { const a = (i / 20) * PI * 2; const w = ladle.localToWorld(V(Math.cos(a) * Rc, 0, Math.sin(a) * Rc)); if (w.y < low.y) low = w; }
        const ex = surfY - low.y;
        if (ex > 0) {
          flow = Math.min(1, 140 * Math.pow(ex, 1.5));
          vol = Math.max(0, vol - flow * dt * 1.5);
          lip = low;
          vel.copy(low).sub(C).setY(0).normalize().multiplyScalar(Math.sqrt(2 * GRAV * ex) + 0.12).add(V(0, -0.05, 0));
        }
      }
      // 국자 속 국물 면은 국자가 바로 서 있을 때만 보여요. 옆으로 많이 기울면 국물 면이 국자 밖으로 삐져나와 보이니,
      // 기울수록 작아지다가 사라지고 흘러내리는 줄기만 보여요
      const cupUp = UPV.set(0, 1, 0).applyQuaternion(ladle.quaternion).y;
      const inCup = THREE.MathUtils.smoothstep(cupUp, 0.35, 0.8);
      liquid.visible = vol > 0.01 && inCup > 0.02;
      if (liquid.visible) {
        liquid.position.set(C.x, surfY, C.z);
        liquid.rotation.set(-PI / 2, 0, 0);
        liquid.scale.setScalar((Math.sqrt(Math.max(0, Rc * Rc - d * d)) / 0.05) * 0.95 * inCup);
      }
      lastRip += dt;
      stream.update(dt, lip, vel, flow, () => bowlY(), (p) => {
        if (BL) BL.level = Math.min(fillTo, Math.max(BL.level, prof.floorAt(0) + 0.003) + 0.0009);
        if (lastRip > 0.12) { lastRip = 0; this.splash(B, p, 0.5, '#FFFFFF'); }
      });
      return pouring || !stream.empty;
    });
    ladle.position.copy(this.camPoint(0.25, -0.25, -0.6));
    follow();
    const empty = prof.floorAt(0);
    for (let s = 0; s < 2; s++) {
      const above = potW.clone().add(V(0.02, 0.24, 0.02));
      const dip = potW.clone().add(V(0.04 - s * 0.06, 0.1, 0.02));
      const p0 = ladle.position.clone();
      await tween(0.4, (k) => { ladle.position.lerpVectors(p0, above, k); follow(); });
      await tween(0.3, (k) => { ladle.position.lerpVectors(above, dip, k); follow(); }, { ease: ease.inQuad });
      // 잠기면 국물이 국자에 차오르고, 냄비 국물은 그만큼 줄어요
      sfx.plop();
      this.splash({ food: box.obj, liquid: PL, box }, dip.clone().add(V(0, 0.03, 0)), 0.6, '#FFFFFF');
      PL.level -= 0.011;
      await tween(0.25, (k) => { vol = k; follow(); }, { ease: ease.linear });
      await tween(0.35, (k) => { ladle.position.lerpVectors(dip, above, k); follow(); });
      // 왼쪽 테두리로 흘러 나오니, 국자는 그릇 가운데보다 오른쪽(내 쪽에서 볼 때)에 대요
      const camRight = V(1, 0, 0).applyQuaternion(this.cam.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
      const over = bowlTop().addScaledVector(camRight, 0.075).add(V(0, 0.15, 0));
      await tween(0.55, (k) => { ladle.position.lerpVectors(above, over, k); ladle.position.y += Math.sin(k * PI) * 0.05; follow(); });
      fillTo = lerp(empty, 0, s === 0 ? 0.5 : 1);
      sfx.pour();
      await tween(0.7, (k) => { tilt = TILT * k; follow(); }, { ease: ease.outQuad });
      await this.until(() => vol < 0.02, 1.6);
      if (BL) BL.level = Math.max(BL.level, fillTo - 0.004);
      await tween(0.3, (k) => { tilt = TILT * (1 - k); follow(); });
    }
    pouring = false;
    const p0 = ladle.position.clone();
    await tween(0.3, (k) => { ladle.position.lerpVectors(p0, this.camPoint(0.25, -0.25, -0.6), k); follow(); });
    await this.until(() => stream.empty, 0.6);
    stream.dispose();
    liquid.removeFromParent(); disposeTree(liquid);
    ladle.removeFromParent(); disposeTree(ladle);
    R.roll = 0;
  }

  // 긴 젓가락: 면은 두 번 나눠 집고(면발 물리), 건더기는 하나씩 놓아 떨어뜨려요
  private async chopTransfer(picks: Picks, B: BowlInfo, R: Paw, bowlTop: () => THREE.Vector3) {
    const bf = B.food;
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
    const moveTip = async (to: THREE.Vector3, dur: number, arc = 0, carry?: THREE.Object3D, carryOff = V(), each?: () => void) => {
      chop.updateMatrixWorld();
      const from = tipW();
      await tween(dur, (k) => {
        const p = from.clone().lerp(to, k); p.y += Math.sin(k * PI) * arc;
        putTip(p);
        if (carry) carry.position.copy(p).add(carryOff);
        each?.();
      });
    };
    const color = this.liquidColor(this.potLiquid);
    const nest = this.potFood.getObjectByName('noodles');
    const bNest = bf.getObjectByName('noodles');
    this.phase = 'noodle';
    if (nest && bNest && this.potBox) {
      const look = this.noodleLook(picks);
      const potStrands = [...nest.children], bowlStrands = [...bNest.children];
      bowlStrands.forEach((c) => { c.visible = false; });
      bNest.visible = true;
      const nestC = nest.getWorldPosition(V());
      const potBox = this.potBox;
      for (let t = 0; t < 2; t++) {
        const spot = nestC.clone().add(V(t ? -0.035 : 0.03, 0, t ? 0.02 : -0.015));
        spot.y = potBox.obj.localToWorld(V(0, Math.max(potBox.level(), potBox.mound() * 0.85), 0)).y;
        await moveTip(spot.clone().add(V(0, 0.12, 0)), 0.28);
        await moveTip(spot.clone().add(V(0, -0.008, 0)), 0.18);
        const bundle = new NoodleBundle(look, [potBox, B.box]);
        this.scene.add(bundle.group);
        this.bundles.push(bundle);
        bundle.lay(spot, 7, potBox, tipW());
        // 집은 만큼 냄비 속 면 더미가 줄어요
        potStrands.splice(0, Math.ceil(potStrands.length / (2 - t))).forEach((c) => { c.visible = false; });
        if (!potStrands.length) nest.visible = false;
        // 들어 올리면 끝이 국물에서 끌려 올라오다 떨어져 출렁여요 (국물 방울도 떨어져요)
        const up = spot.clone().add(V(0, 0.3, 0));
        let dt0 = 0;
        await tween(0.85, (k) => {
          putTip(spot.clone().lerp(up, ease.inOutCubic(k)));
          bundle.hold(tipW());
          if (k > 0.4 && (dt0 += 1) % 5 === 0) { const e = bundle.ends(); this.drip(e[(Math.random() * e.length) | 0], color); }
        }, { ease: ease.linear });
        await wait(0.2);
        // 그릇 위로 (움직이면 면이 관성으로 뒤로 쏠렸다 흔들려요)
        const over = bowlTop().add(V(0, 0.27, 0));
        await tween(0.75, (k) => {
          const p = up.clone().lerp(over, ease.inOutCubic(k)); p.y += Math.sin(k * PI) * 0.04;
          putTip(p); bundle.hold(tipW());
        }, { ease: ease.linear });
        await wait(0.15);
        const down = bowlTop().add(V(0, 0.04, 0));
        await tween(0.5, (k) => { putTip(over.clone().lerp(down, ease.inOutCubic(k))); bundle.hold(tipW()); }, { ease: ease.linear });
        // 젓가락을 벌리면 면이 그릇에 내려앉아 자리를 잡아요
        bundle.release();
        sfx.plop();
        this.splash(B, down.clone().add(V(0, -0.03, 0)), 0.5, '#FFFFFF');
        bowlStrands.splice(0, Math.ceil(bowlStrands.length / (2 - t))).forEach((c) => {
          c.visible = true; c.scale.set(1, 0.4, 1);
          tween(0.4, (q) => c.scale.set(1, 0.4 + 0.6 * q, 1), { ease: ease.outCubic });
        });
        await moveTip(down.clone().add(V(0.02, 0.1, 0.02)), 0.25);
        await wait(0.45);
        // 다 내려앉은 면은 그릇 속 면으로 남겨 두어요 (그릇과 함께 움직여요)
        bundle.frozen = true;
        for (const tb of bundle.tubes) { tb.mesh.userData.loose = true; bNest.attach(tb.mesh); }
        this.bundles.splice(this.bundles.indexOf(bundle), 1);
        bundle.group.removeFromParent(); // 가닥은 그릇으로 옮겼으니 빈 묶음은 치워요
      }
      nest.visible = false;
      bowlStrands.forEach((c) => { c.visible = true; });
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
      const dp = dst.getWorldPosition(V()), dq = dst.getWorldQuaternion(new THREE.Quaternion());
      dst.visible = false;
      const off = src.position.clone().sub(tipW());
      await moveTip(dp.clone().add(V(0, 0.08, 0)), 0.5, 0.1, src, off);
      // 젓가락을 놓으면 중력으로 떨어져 퐁당, 국물 위에서 둥둥 흔들리다 멈춰요
      const drop = new Drop(src, dp, dq, (p, s) => { sfx.plop(); this.splash(B, p, s, '#FFFFFF'); }, V(0, -0.05, 0));
      this.drops.push(drop);
      await moveTip(tipW().add(V(0.03, 0.05, 0.03)), 0.2);
      await this.until(() => drop.done, 1.4);
      src.removeFromParent(); disposeTree(src);
      dst.visible = true;
    }
    const away = this.camPoint(0.3, -0.35, -0.6);
    await moveTip(away, 0.3);
    chop.removeFromParent(); disposeTree(chop);
    this.pawAt(R, null);
  }

  // 앞발로 그릇을 들어 손님 앞 카운터에 내려놓아요 (국물이 출렁)
  private async deliverBowls(n: number) {
    this.phase = 'deliver';
    this.showPaws(true);
    const L = this.paws.L, R = this.paws.R;
    L.maxLen = R.maxLen = 1.8;
    const one = this.bowlInfo.length === 1;
    const plans = this.bowlInfo.map((B, i) => {
      const seat = this.shop.seat(i, n);
      return { B, from: B.group.position.clone(), end: V(seat.x, 1.035, -0.24), paw: one ? null : i === 0 ? L : R };
    });
    const grip = () => plans.forEach((pl) => {
      pl.B.group.updateMatrixWorld();
      if (!pl.paw) { this.pawAt(L, pl.B.group.localToWorld(pl.B.grips[0].clone())); this.pawAt(R, pl.B.group.localToWorld(pl.B.grips[1].clone())); }
      else this.pawAt(pl.paw, pl.B.group.localToWorld(V(0, 0.075, 0.16)));
    });
    await tween(0.35, () => grip(), { ease: ease.linear });
    sfx.whoosh();
    const cam = this.setView('guest', 1.6);
    await tween(1.6, (k) => {
      for (const pl of plans) {
        const e = ease.inOutCubic(k), a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
        const mid = V((pl.from.x + pl.end.x) / 2, Math.max(pl.from.y, pl.end.y) + 0.12, (pl.from.z + pl.end.z) / 2);
        pl.B.group.position.set(a * pl.from.x + b * mid.x + c * pl.end.x, a * pl.from.y + b * mid.y + c * pl.end.y, a * pl.from.z + b * mid.z + c * pl.end.z);
      }
      grip();
    }, { ease: ease.linear });
    sfx.soft();
    await cam;
    await wait(0.15);
    this.showPaws(false);
    setTimeout(() => { L.maxLen = R.maxLen = 0.5; }, 700);
  }

  // ── 젓가락으로 먹기 ─────────────────────────────
  async eat(onSlurp?: () => void) {
    this.phase = 'eat';
    await this.setView(this.guests.length > 1 ? 'eat2' : 'eat', 0.8);
    await Promise.all(this.guests.map((g, i) => this.eatOne(g, this.bowlInfo[i] ?? this.bowlInfo[0], i, i * 0.5, onSlurp)));
    await this.setView('guest', 0.8);
    this.phase = 'done';
  }

  private async eatOne(ch: Chibi, B: BowlInfo | undefined, gi: number, delay: number, onSlurp?: () => void) {
    if (!B) return;
    await wait(delay);
    const bowl = B.group, food = B.food;
    const sc = ch.root.scale.x;
    const side = B.shared ? (gi === 0 ? -1 : 1) : 0;
    const surf = () => food.localToWorld(V(side * 0.07, Math.max(B.box.level(), B.box.mound() * 0.6) + 0.004, 0));
    // 냄비는 높고 커서 그릇처럼 숙여 내려다보면 얼굴이 냄비 속으로 들어가요. 몸은 조금만 숙이고, 냄비 위쪽을 바라봐요
    const pot = B.kind === 'pot';
    // 주둥이·부리가 긴 손님은 덜 숙이고, 조금 더 위를 보고, 음식을 주둥이 끝까지 가져가요
    const R = ch.faceReach * sc;
    // 머리가 큰 손님이 그릇에 얼굴을 파묻은 것처럼 보이지 않게 조금만 숙여요
    const LEAN = (pot ? 0.05 : 0.11) * Math.max(0.15, 1 - R * 4);
    const view = () => (pot ? surf().add(V(0, 0.1 + R * 1.2, 0)) : surf().add(V(0, R * 1.6, 0)));
    const noodles = food.getObjectByName('noodles');
    const p = this.served;
    const color = this.liquidColor(B.liquid);
    ch.manual = true;
    ch.talking = false;
    ch.look = view();
    // 주둥이가 아주 긴 손님(펠리컨·악어·코끼리)은 젓가락·그릇을 들지 않고 고개를 숙여 먹어요
    const longSnout = R >= LONG_SNOUT;
    if (!longSnout) {
      ch.showChop(true);
      ch.chop.scale.setScalar(0.01);
      tween(0.3, (k) => ch.chop.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack });
    }
    // 왼손은 그릇 옆을 살짝 잡아요. 뜨거운 냄비는 만지지 않고 카운터에 얹어 둬요
    if (pot) {
      // 쉬는 손은 냄비 옆 카운터에 얹어요. 같이 먹는 냄비라 손이 냄비 쪽에 있으면, 손끝까지 냄비 밖에 오도록 밀어 두고 손끝도 바깥을 향해요
      const want = ch.toWorld(V(-0.32, 0.5, 0.46));
      const c = bowl.position, out = V(want.x - c.x, 0, want.z - c.z);
      const minR = POT_R + 0.16;
      if (out.length() >= minR) ch.setHand(0, V(-0.32, 0.5, 0.46), V(0.4, 0, 1));
      else {
        const dir = out.lengthSq() > 1e-6 ? out.normalize() : V(-1, 0, 0);
        ch.setHandWorld(0, V(c.x, want.y, c.z).addScaledVector(dir, minR), dir.clone().add(V(0, -0.2, 0)));
      }
    } else {
      const lh = bowl.localToWorld(B.grips[0].clone().add(V(0, 0.01, 0)));
      ch.setHandWorld(0, lh, V(1, 0.1, 0));
    }
    // 건더기 하나 고르기: 같이 먹는 냄비는 저마다 자기 쪽에 가까운 건더기 (짝꿍 얼굴 앞으로 팔을 뻗지 않게)
    const pickTop = (): THREE.Object3D | null => {
      if (!B.shared) return p?.toppings[0] ? food.getObjectByName(p.toppings[0]) ?? null : null;
      const sx = ch.root.position.x;
      const cands = (p?.toppings ?? []).map((id) => food.getObjectByName(id)).filter((o): o is THREE.Object3D => !!o && o.visible);
      return cands.sort((x, y) => Math.abs(x.getWorldPosition(V()).x - sx) - Math.abs(y.getWorldPosition(V()).x - sx))[0] ?? null;
    };
    if (longSnout) await this.eatHeadDown(ch, B, surf, pickTop, onSlurp);
    else {
    // 젓가락 끝을 tip에 대요. 손이 어깨에서 너무 멀면(팔이 길게 늘어나 보이면)
    //  1) 먼저 젓가락을 어깨 → 끝 방향 쪽으로 기울여요 (손이 어깨와 끝 사이로 들어와요. 입에 가져갈 때는 옆에서 들어오는 모양)
    //  2) 그래도 멀면 젓가락을 길게 늘여요 (두 배까지). 그릇·냄비 위에서는 손이 늘 테두리보다 위에 있어요
    // (숟가락도 같은 방법으로, 늘이는 건 1.4배까지)
    const MAXR = 0.5 * sc;
    // 그릇·냄비 위에서는 손이 테두리보다 높아야 해요 (앞발이 음식에 빠져 보이지 않게)
    // (그릇 무리에는 김도 들어 있어서 크기 대신 그릇 안쪽 모양으로 테두리를 재요)
    const vc = food.localToWorld(V(0, B.box.prof.rimY, 0)), rimY = vc.y;
    const rimR = food.localToWorld(V(B.box.prof.rimR, B.box.prof.rimY, 0)).distanceTo(vc) + 0.02, PAW = 0.07 * sc;
    const aboveRim = (hp: THREE.Vector3) => Math.hypot(hp.x - vc.x, hp.z - vc.z) > rimR + PAW || hp.y > rimY + PAW;
    // 입으로 가져갈 때 옆에서 들어오는 방향 (오른손 쪽에서 입 쪽으로, 살짝 위로)
    const fromSide = () => V(-0.9, 0.25, -0.35).normalize().applyQuaternion(ch.root.quaternion);
    const placeTip = (tip: THREE.Vector3, aimW: THREE.Vector3, reach = 0.23, tool: THREE.Object3D | null = ch.chop, maxExt = 2) => {
      let a = aimW.clone().normalize();
      const L0 = reach * sc;
      let L = L0;
      if (tool) {
        const S = ch.toWorld(ch.arms[1].shoulder);
        const d = tip.clone().sub(S);
        const handOf = (v: THREE.Vector3, l: number) => tip.clone().addScaledVector(v, -l);
        const good = (v: THREE.Vector3, l: number) => { const hp = handOf(v, l); return hp.distanceTo(S) <= MAXR && aboveRim(hp); };
        if (!good(a, L0)) {
          // 찾는 차례: 젓가락 길이 그대로 → 조금씩 길게(그만큼까지), 방향은 원래 방향 → 어깨 쪽 / 옆에서 들어오는 쪽으로 조금씩
          const base = a.clone(), goals = [d.clone().normalize(), fromSide()];
          const lens = [1, 1.2, 1.4, 1.6, 1.8, 2].filter((k) => k <= maxExt + 1e-6).map((k) => k * L0);
          let best: [THREE.Vector3, number] | null = null;
          search: for (const l of lens) {
            for (let i = 0; i <= 12; i++) {
              for (const g of goals) {
                const v = base.clone().lerp(g, i / 12).normalize();
                if (good(v, l)) { best = [v, l]; break search; }
              }
            }
          }
          if (best) [a, L] = best;
          else {
            // 어디서도 안 되면: 손이 그릇 속에 들어가지 않는 자리 가운데 어깨에 가장 가까운 곳 (팔이 조금 늘어나요)
            let bd = Infinity;
            for (const l of lens) for (let i = 0; i <= 12; i++) for (const g of goals) {
              const v = base.clone().lerp(g, i / 12).normalize(), hp = handOf(v, l);
              const cost = hp.distanceTo(S) + (aboveRim(hp) ? 0 : 10);
              if (cost < bd) { bd = cost; a = v; L = l; }
            }
          }
        }
        // 젓가락은 손 안으로 밀어 넣지 않아요 (손가락에 묻혀 보이지 않게). 필요하면 길게만 늘여요
        const s0 = Math.max(0.01, tool.scale.x);
        tool.scale.z = s0 * (L / L0); tool.position.z = 0;
      }
      ch.setHandWorld(1, tip.clone().addScaledVector(a, -L), a);
    };
    // 냄비는 테두리가 입 높이에 가까워요. 고개를 조금 더 들고 젓가락을 눕혀야 손이 냄비 속으로 내려가지 않아요
    const DOWN = V(-0.12, -1, 0.25).normalize(), MOUTH = pot ? V(-0.15, 0.3, -0.94).normalize() : V(-0.15, 0.62, -0.77).normalize();
    const UP = (pot ? 0.22 : 0.08) + R * 0.6;
    const bites = noodles ? (B.shared ? 2 : 3) : 1;
    for (let b = 0; b < bites; b++) {
      ch.lean = LEAN;
      ch.headExtra.x = -0.05;
      ch.look = view();
      const dipTip = surf().add(V((Math.random() - 0.5) * 0.05, -0.006, (Math.random() - 0.5) * 0.04));
      placeTip(dipTip, DOWN);
      await wait(0.5);
      if (!noodles) break;
      // 면 몇 가닥을 젓가락에 걸어요 (면발 물리)
      const bundle = new NoodleBundle(this.noodleLook(p, true), [B.box]);
      this.scene.add(bundle.group);
      this.bundles.push(bundle);
      bundle.lay(dipTip, 4, B.box, ch.chopTipWorld());
      noodles.scale.multiplyScalar(0.86);
      const loose = noodles.children.filter((c) => c.userData.loose && c.visible);
      loose.slice(0, Math.ceil(loose.length / (bites - b))).forEach((c) => { c.visible = false; });
      this.phase = 'lift';
      ch.look = null;
      // 입 앞까지 들어 올려요: 면 끝이 국물에서 끌려 나와 대롱대롱
      let tick = 0;
      await tween(0.8, (k) => {
        const e = ease.inOutCubic(k);
        const mouth = ch.mouthWorld();
        placeTip(dipTip.clone().lerp(mouth.clone().add(V(0.02, -0.03, 0.07 + R)), e), DOWN.clone().lerp(MOUTH, e));
        ch.headExtra.x = -0.05 - UP * k;
        ch.lean = LEAN * (1 - 0.875 * k);
        bundle.hold(ch.chopTipWorld());
        if (k > 0.5 && ++tick % 6 === 0) { const en = bundle.ends(); this.drip(en[(Math.random() * en.length) | 0], color); }
      }, { ease: ease.linear });
      this.phase = 'slurp';
      // 후루룩: 입이 빨아들이는 힘에 면이 짧아지며 딸려 올라와요
      sfx.slurp();
      onSlurp?.();
      ch.setMood('surprised');
      await tween(0.75, (k) => {
        const m = ch.mouthWorld();
        bundle.hold(ch.chopTipWorld().lerp(m, Math.min(1, k * 2.5)));
        bundle.setReel(Math.max(0.03, 1 - 0.97 * ease.inQuad(k)));
      }, { ease: ease.linear });
      bundle.dispose();
      this.bundles.splice(this.bundles.indexOf(bundle), 1);
      ch.setMood('eat');
      ch.chewing = true;
      await wait(0.55);
      ch.chewing = false;
    }
    // 건더기 하나 집어 먹기 (같이 먹는 냄비면 각자 다른 건더기)
    this.phase = 'topbite';
    const top = pickTop();
    if (top && top.visible) {
      ch.lean = LEAN * 0.875; ch.look = view(); ch.headExtra.x = -0.05;
      const tp = top.getWorldPosition(V()).add(V(0, 0.02, 0));
      placeTip(tp, DOWN);
      await wait(0.5);
      this.scene.attach(top);
      ch.look = null;
      this.splash(B, tp.clone().add(V(0, -0.02, 0)), 0.25, '#FFFFFF');
      await tween(0.6, (k) => {
        const e = ease.inOutCubic(k);
        const mouth = ch.mouthWorld();
        placeTip(tp.clone().lerp(mouth.clone().add(V(0.02, -0.02, 0.06 + R)), e), DOWN.clone().lerp(MOUTH, e));
        top.position.copy(ch.chopTipWorld()).add(V(0, -0.012, 0));
        ch.lean = LEAN * 0.875 * (1 - 0.857 * k);
        ch.headExtra.x = -0.05 - UP * k;
      }, { ease: ease.linear });
      sfx.pop();
      top.removeFromParent(); disposeTree(top);
      ch.look = null;
      ch.chewing = true;
      await wait(0.6);
      ch.chewing = false;
    }
    // 국물 마시기
    this.phase = 'drink';
    ch.showChop(false);
    ch.chop.scale.setScalar(1); ch.chop.position.set(0, 0, 0);
    if (B.kind === 'pot') await this.sipWithSpoon(ch, B, side, placeTip, color, onSlurp, R);
    else await this.drinkFrom(ch, B, onSlurp, R);
    }
    food.children.forEach((c) => { if (c.name !== 'broth') c.visible = false; });
    B.steam.set(0.15);
    ch.manual = false;
    ch.look = null;
    ch.headExtra.set(0, 0, 0);
    ch.setMood('eat');
    ch.play('full');
    await wait(0.6);
  }

  // 주둥이가 아주 긴 손님: 그릇은 카운터에 둔 채 고개를 숙여 주둥이 끝으로 면·건더기·국물을 먹어요.
  // 주둥이 끝이 국물 면(또는 건더기)에 닿도록 몸을 숙이는 정도를 매 순간 조금씩 맞춰요
  private async eatHeadDown(ch: Chibi, B: BowlInfo, surf: () => THREE.Vector3, pickTop: () => THREE.Object3D | null, onSlurp?: () => void) {
    const pot = B.kind === 'pot', bowl = B.group, food = B.food;
    const sc = ch.root.scale.x;
    const noodles = food.getObjectByName('noodles');
    // 오른손도 쉬어요: 그릇이면 양옆을 잡고, 냄비면 냄비 밖 카운터에
    if (!pot) ch.setHandWorld(1, bowl.localToWorld(B.grips[1].clone().add(V(0, 0.01, 0))), V(-1, 0.1, 0));
    else {
      const want = ch.toWorld(V(0.32, 0.5, 0.46)), c = bowl.position, out = V(want.x - c.x, 0, want.z - c.z), minR = POT_R + 0.16;
      if (out.length() >= minR) ch.setHand(1, V(0.32, 0.5, 0.46), V(-0.4, 0, 1));
      else { const dir = out.lengthSq() > 1e-6 ? out.normalize() : V(1, 0, 0); ch.setHandWorld(1, V(c.x, want.y, c.z).addScaledVector(dir, minR), dir.clone().add(V(0, -0.2, 0))); }
    }
    const tipW = () => ch.head.localToWorld(V(0, -0.1, HR + ch.faceReach / sc));
    let lean = Math.max(0.05, ch.lean);
    const NOD = 0.45;
    // 숙이기: 고개를 끄덕이듯 숙이고, 주둥이 끝 높이를 보며 몸을 조금씩 더 숙이거나 펴요
    const dip = (to: () => THREE.Vector3, dur: number, every?: (k: number) => void) => tween(dur, (k) => {
      ch.look = null;
      ch.headExtra.x = Math.min(NOD, ch.headExtra.x + 0.05);
      const err = tipW().y - (to().y + 0.012 * sc);
      lean = THREE.MathUtils.clamp(lean + THREE.MathUtils.clamp(err * 0.35, -0.025, 0.025), 0.02, 0.85);
      ch.lean = lean;
      every?.(k);
    }, { ease: ease.linear });
    const rise = (dur: number) => { const l0 = lean, h0 = ch.headExtra.x; return tween(dur, (k) => { lean = lerp(l0, 0.06, k); ch.lean = lean; ch.headExtra.x = h0 * (1 - k); }, { ease: ease.inOutCubic }); };
    // 면: 두세 번 후루룩
    const bites = noodles ? 2 : 1;
    for (let b = 0; b < bites; b++) {
      this.phase = 'slurp';
      await dip(surf, 0.7);
      sfx.slurp();
      onSlurp?.();
      ch.setMood('surprised');
      this.splash(B, surf(), 0.2, '#FFFFFF');
      if (noodles) {
        noodles.scale.multiplyScalar(0.82);
        const loose = noodles.children.filter((c) => c.userData.loose && c.visible);
        loose.slice(0, Math.ceil(loose.length / (bites - b))).forEach((c) => { c.visible = false; });
      }
      await dip(surf, 0.45);
      await rise(0.4);
      ch.setMood('eat');
      ch.chewing = true;
      await wait(0.5);
      ch.chewing = false;
    }
    // 건더기 하나
    this.phase = 'topbite';
    const top = pickTop();
    if (top && top.visible) {
      const tp = top.getWorldPosition(V());
      await dip(() => tp, 0.6);
      sfx.pop();
      top.removeFromParent(); disposeTree(top);
      await rise(0.35);
      ch.chewing = true;
      await wait(0.5);
      ch.chewing = false;
    }
    // 국물: 고개를 숙인 채 쭉 들이켜요
    this.phase = 'drink';
    const L = B.liquid, L0 = L ? L.level : 0, Lend = B.box.prof.floorAt(0) + 0.006;
    await dip(surf, 0.5);
    sfx.slurp();
    onSlurp?.();
    ch.chewing = true;
    await dip(surf, 1.2, (k) => { if (L) L.level = lerp(L0, Lend, k); if (noodles && k > 0.5) noodles.visible = false; });
    ch.chewing = false;
    await rise(0.5);
    sfx.soft();
    L?.kick(0, -0.2);
  }

  // 그릇을 두 손으로 들고 기울여 마셔요. 국물 면은 기울여도 수평이라 입 쪽 테두리로 모여요
  private async drinkFrom(ch: Chibi, B: BowlInfo, onSlurp?: () => void, R = 0) {
    const bowl = B.group;
    const home = bowl.position.clone();
    const pot = B.kind === 'pot';
    // 마실 때는 그릇 아래쪽 옆면을 몸 쪽에서 감싸 쥐어요 (손이 덜 멀어서 팔이 길어 보이지 않게)
    const G = pot ? B.grips : [V(-0.135, 0.045, -0.035), V(0.135, 0.045, -0.035)];
    const hands = () => {
      bowl.updateMatrixWorld();
      const l = bowl.localToWorld(G[0].clone()), r = bowl.localToWorld(G[1].clone());
      ch.setHandWorld(0, l, r.clone().sub(l)); ch.setHandWorld(1, r, l.clone().sub(r));
    };
    hands();
    ch.lean = 0.12;
    await wait(0.35);
    // 손님 쪽 테두리를 입술 바로 앞에 대요. 고개를 젖히거나 몸을 펴도 매 순간 입 위치를 다시 봐서 따라가요
    // (주둥이가 긴 손님은 주둥이 끝에 대요). 그릇 테두리: 높이 0.105, 반지름 0.165
    const RIM = pot ? V(0, 0.2, -(POT_R + 0.01)) : V(0, 0.105, -0.165);
    const AX = V(1, 0, 0);
    const at = (rot: number) => ch.mouthWorld().add(V(0, -0.02, 0.012 + R * 0.9)).sub(RIM.clone().applyAxisAngle(AX, rot));
    // 고개는 젖히지 않고 그릇 쪽으로 살짝 숙여요 (입이 내려와서 팔을 덜 뻗어요). 대신 그릇을 더 기울여요
    const tilt = -0.12;
    await tween(pot ? 0.75 : 0.55, (k) => { bowl.rotation.x = -0.15 * k; bowl.position.lerpVectors(home, at(bowl.rotation.x), k); hands(); ch.lean = 0.12 - 0.08 * k; ch.headExtra.x = -tilt * k * 0.5; }, { ease: ease.inOutCubic });
    sfx.slurp();
    onSlurp?.();
    ch.chewing = true;
    const L = B.liquid, L0 = L ? L.level : 0, Lend = B.box.prof.floorAt(0) + 0.006;
    const tiltMax = pot ? 0.42 : 0.62;
    const noodles = B.food.getObjectByName('noodles');
    await tween(1.1, (k) => {
      const s = Math.sin(k * PI * 0.5);
      bowl.rotation.x = -0.15 - tiltMax * s;
      ch.headExtra.x = -tilt * (0.5 + 0.5 * s);
      bowl.position.copy(at(bowl.rotation.x));
      hands();
      if (L) L.level = lerp(L0, Lend, k);
      if (noodles && k > 0.5) noodles.visible = false;
    }, { ease: ease.linear });
    ch.chewing = false;
    const r0 = bowl.rotation.x, p0 = bowl.position.clone();
    await tween(0.55, (k) => { bowl.position.lerpVectors(p0, home, k); bowl.rotation.x = r0 * (1 - k); hands(); ch.headExtra.x = -tilt * (1 - k); ch.lean = 0.04 * (1 - k); }, { ease: ease.inOutCubic });
    bowl.rotation.x = 0;
    sfx.soft();
    L?.kick(0, -0.2);
  }

  // 뜨거운 냄비는 들지 않고 숟가락으로 떠 마셔요
  private async sipWithSpoon(ch: Chibi, B: BowlInfo, side: number, placeTip: (tip: THREE.Vector3, aim: THREE.Vector3, reach?: number, tool?: THREE.Object3D | null, maxExt?: number) => void, color: string, onSlurp?: () => void, R = 0) {
    const spoon = makeSpoon();
    ch.arms[1].hand.add(spoon);
    const sl = spoon.getObjectByName('liquid') as THREE.Mesh;
    sl.material = Mu(color, { rim: 0, flat: 0.3, spec: 0.5 });
    spoon.scale.setScalar(0.01);
    await tween(0.25, (k) => spoon.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack });
    const L = B.liquid;
    const DOWN = V(-0.1, -1, 0.3).normalize(), MOUTH = V(-0.15, 0.3, -0.94).normalize();
    for (let i = 0; i < 2; i++) {
      const s = B.food.localToWorld(V(side * 0.09 + (Math.random() - 0.5) * 0.03, (L ? L.level : 0) + 0.002, 0.04));
      const lean = 0.05 * Math.max(0.15, 1 - R * 4);
      ch.lean = lean; ch.look = s.clone().add(V(0, 0.1 + R * 1.2, 0)); ch.headExtra.x = -0.05;
      placeTip(s, DOWN, 0.2, spoon, 1.4);
      await wait(0.45);
      sl.visible = true;
      this.splash(B, s, 0.25, '#FFFFFF');
      if (L) L.level = Math.max(B.box.prof.floorAt(0) + 0.01, L.level - 0.008);
      ch.look = null;
      await tween(0.6, (k) => {
        const e = ease.inOutCubic(k);
        placeTip(s.clone().lerp(ch.mouthWorld().add(V(0.02, -0.02, 0.06 + R)), e), DOWN.clone().lerp(MOUTH, e), 0.2, spoon, 1.4);
        ch.lean = lean * (1 - 0.875 * k); ch.headExtra.x = -0.05 - (0.22 + R * 0.6) * k;
      }, { ease: ease.linear });
      sfx.slurp();
      onSlurp?.();
      sl.visible = false;
      ch.chewing = true;
      await wait(0.4);
      ch.chewing = false;
    }
    await tween(0.2, (k) => spoon.scale.setScalar(Math.max(0.01, 1 - k)));
    spoon.removeFromParent(); disposeTree(spoon);
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

  // 손님 머리 위치 (문 위 천이 닿으면 밀려나요)
  private heads: { c: THREE.Vector3; r: number }[] = [];
  private headBalls() {
    while (this.heads.length < this.guests.length) this.heads.push({ c: V(), r: 0 });
    this.heads.length = this.guests.length;
    this.guests.forEach((g, i) => {
      const b = this.heads[i];
      g.head.getWorldPosition(b.c);
      this.shop.root.worldToLocal(b.c);
      b.r = HR * g.root.scale.x * 1.05;
    });
    return this.heads;
  }

  update(dt: number) {
    this.t += dt;
    // 팔이 모자라면 카메라가 다가가요 (천천히 따라가서 멀미 나지 않게)
    this.reachDolly(this.dollyWant);
    this.dolly.lerp(this.dollyWant, 1 - Math.exp(-dt * 4.5));
    if (this.dolly.lengthSq() < 1e-8 && this.dollyWant.lengthSq() === 0) this.dolly.set(0, 0, 0);
    this.placeCam();
    this.focusShift = this.dolly.dot(V(0, 0, -1).applyQuaternion(this.cam.quaternion));
    if (Math.abs(this.shift - this.shiftTarget) > 0.5 || this.shift !== 0) {
      this.shift += (this.shiftTarget - this.shift) * Math.min(1, dt * 5);
      this.applyShift();
    }
    this.shop.update(dt, this.headBalls(), this.view !== 'pot' && this.view !== 'serve');
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
    // 물리 한 걸음
    if (this.jobs.length) { const js = this.jobs; this.jobs = []; this.jobs.push(...js.filter((j) => j(dt))); }
    for (const b of this.bundles) b.update(dt);
    if (this.drops.length) { for (const d of this.drops) d.update(dt); this.drops = this.drops.filter((d) => !d.done); }
    this.liquids = this.liquids.filter((L) => this.inScene(L.mesh));
    for (const L of this.liquids) L.update(dt);
    animateRamen(this.potFood, this.t);
    for (const b of this.bowls) animateRamen(b, this.t);
    if (this.shop.flames.visible) this.shop.flames.children.forEach((f) => { if (f.userData.phase !== undefined) f.scale.y = 0.8 + Math.sin(this.t * 20 + f.userData.phase) * 0.25; });
    this.paws.sync(this.cam, dt);
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
