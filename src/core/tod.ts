import * as THREE from 'three';
import { EVENT } from '../event/flag';

// 시간대 (수업용): 낮 · 노을녘 · 밤
// 선생님이 교사 메뉴에서 기본값을 정하고(이 기기에 남아요), 학생은 마음 골목의 해·노을·달 단추로 바로 바꿔요.
// 바꾼 시간대는 앱을 다시 열 때까지 골목과 라면 가게에 함께 적용돼요. 행사용은 늘 낮이에요.
export type Tod = 'day' | 'dusk' | 'night';
export const TODS: Tod[] = ['day', 'dusk', 'night'];
export const TOD_NAME: Record<Tod, string> = { day: '낮', dusk: '노을녘', night: '밤' };

const KEY = 'ramen-tod-default';
export function todDefault(): Tod {
  try { const v = localStorage.getItem(KEY); return v === 'dusk' || v === 'night' ? v : 'day'; } catch { return 'day'; }
}
export function setTodDefault(t: Tod) {
  try { localStorage.setItem(KEY, t); } catch { /* 저장 못 해도 이번에는 바뀌어요 */ }
  setTod(t);
}
export const TOD_DOODLE = { day: 'sun', dusk: 'dusk', night: 'moon' } as const;

let cur: Tod | null = null;
const subs = new Set<(t: Tod) => void>();
export function getTod(): Tod { if (EVENT) return 'day'; if (!cur) cur = todDefault(); return cur; }
export function setTod(t: Tod) { if (EVENT || t === cur) return; cur = t; subs.forEach((f) => f(t)); }
export function onTod(f: (t: Tod) => void) { subs.add(f); return () => { subs.delete(f); }; }

// 재질 색에 곱하는 빛깔 (스스로 빛나는 창문·간판·하늘은 그대로), 해(달) 쪽 방향, 햇살 색
export interface TodLight { tint: THREE.Color; lightW: THREE.Vector3; sunCol: THREE.Color; haze: THREE.Vector4 }
export const TOD_LIGHT: Record<Tod, TodLight> = {
  day: { tint: new THREE.Color(1, 1, 1), lightW: new THREE.Vector3(0.4, 0.8, 0.5).normalize(), sunCol: new THREE.Color('#FFE6B0'), haze: new THREE.Vector4(1, 1, 1, 0) },
  dusk: { tint: new THREE.Color(1.0, 0.86, 0.84), lightW: new THREE.Vector3(-0.45, 0.75, 0.48).normalize(), sunCol: new THREE.Color('#FF9C5C'), haze: new THREE.Vector4(0.92, 0.55, 0.68, 0.24) },
  night: { tint: new THREE.Color(0.42, 0.46, 0.78), lightW: new THREE.Vector3(0.35, 0.75, 0.45).normalize(), sunCol: new THREE.Color('#BFD4FF'), haze: new THREE.Vector4(0.12, 0.15, 0.38, 0.42) },
};
// 라면 가게 안: 등불이 켜져 있어서 밖보다 덜 어두워요
export const TOD_SHOP_TINT: Record<Tod, THREE.Color> = {
  day: new THREE.Color(1, 1, 1),
  dusk: new THREE.Color(1.0, 0.9, 0.8),
  night: new THREE.Color(0.8, 0.78, 0.88),
};

// 마음 골목 화면 색감: 노을녘은 낮게 깔린 주황 햇살, 밤은 차분하게 (달빛 줄기는 약하게)
export const TOD_LOOK: Record<Tod, { sat: number; bright: number; lift: number; rayK: number; sunDir: THREE.Vector3 }> = {
  day: { sat: 1.18, bright: 1.04, lift: 0.35, rayK: 1, sunDir: new THREE.Vector3(0.4, 0.17, 0.5).normalize() },
  dusk: { sat: 1.12, bright: 1.05, lift: 0.35, rayK: 1.5, sunDir: new THREE.Vector3(-0.86, 0.07, 0.42).normalize() },
  night: { sat: 1.1, bright: 1.02, lift: 0.25, rayK: 0.45, sunDir: new THREE.Vector3(0.3, 0.55, -0.55).normalize() },
};
