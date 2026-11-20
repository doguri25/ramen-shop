import { FX } from './effects';
import type { Effect } from './types';

// 별 하나를 받은 손님에게 라면 옆에 곁들여 주는 마음 김밥 (수업용)
// 김이 속재료를 꼭 감싸듯 손님 마음을 감싸 줘요. 김발 위에 김 → 밥 → 속재료(세 가지까지) → 마무리 순서로 올려요
export type GStep = 'rice' | 'gim' | 'fill' | 'top';
export interface GIng { id: string; step: GStep; name: string; effects: Effect[]; note: string; color: string; icon: string }

const G = (id: string, step: GStep, name: string, effects: Effect[], note: string, color: string, icon: string): GIng => ({ id, step, name, effects, note, color, icon });

export const GSTEPS: { id: GStep; label: string; info: string; max: number; optional?: boolean }[] = [
  { id: 'gim', label: '김', info: '김발 위에 깔 김을 하나 골라요. 밥과 속재료를 꼭 감싸 줘요.', max: 1 },
  { id: 'rice', label: '밥', info: '김 위에 펼 밥을 하나 골라요.', max: 1 },
  { id: 'fill', label: '속재료', info: '손님에게 모자랐던 마음을 떠올리며 속재료를 세 가지까지 골라요.', max: 3 },
  { id: 'top', label: '마무리', info: '마지막에 바를 마무리를 골라요. 안 넣어도 돼요.', max: 1, optional: true },
];

export const GIMBAP: GIng[] = [
  G('gr_white', 'rice', '고슬고슬 흰밥', ['쉼', '느긋함'], '따끈한 밥 한 숟가락이면 마음이 느긋해져요.', '#FBF6EC', '🍚'),
  G('gr_grain', 'rice', '든든 잡곡밥', ['자신감', '씩씩함'], '꼭꼭 씹을수록 힘이 나요.', '#D9C2A3', '🌾'),
  G('gr_sesame', 'rice', '고소 깨밥', ['소속감', '웃음'], '고소한 냄새에 다 같이 모여 웃음이 솔솔 나요.', '#F1E3C8', '✨'),
  G('gg_hug', 'gim', '꼭 감싸 김', ['포옹', '곁에 있기'], '김이 재료를 감싸듯 마음을 꼭 안아 줘요.', '#2F4A35', '🌿'),
  G('gg_crisp', 'gim', '바삭 다시 김', ['다시 해 보기', '토닥임'], '구겨져도 다시 펴면 바삭해져요.', '#3E5A3C', '🍃'),
  G('gf_danmuji', 'fill', '아삭 용기 단무지', ['씩씩함', '걱정 줄이기'], '아삭 소리와 함께 걱정이 작아져요.', '#F6D23C', '🟨'),
  G('gf_egg', 'fill', '포근 지단', ['토닥임', '눈물 닦기'], '포근한 지단이 속상한 마음을 덮어 줘요.', '#F9DF7B', '🥚'),
  G('gf_burdock', 'fill', '꼭꼭 우엉', ['곁에 있기', '귀 기울이기'], '천천히 씹듯 친구 말을 끝까지 들어 줘요.', '#8A5A33', '🟫'),
  G('gf_carrot', 'fill', '알록달록 당근', ['손 내밀기', '친구 되기'], '알록달록한 색처럼 먼저 다가가 함께 어울려요.', '#F08A3C', '🥕'),
  G('gf_bulgogi', 'fill', '그리운 불고기', ['그리움 달래기', '소중함'], '그리운 사람이 해 주던 맛처럼 마음이 따뜻해져요.', '#9A5B3A', '🍖'),
  G('gf_spinach', 'fill', '살랑 시금치', ['깊은 숨', '단잠'], '숨을 크게 쉬면 마음이 살랑 가벼워져요.', '#3F8F3A', '🥬'),
  G('gf_cucumber', 'fill', '시원 오이', ['화 식히기', '차분함'], '시원한 오이처럼 뜨거운 화가 식어요.', '#8BC86A', '🥒'),
  G('gf_kimchi', 'fill', '아삭 김치', ['마음 말하기', '잠깐 멈춤'], '매운 마음은 잠깐 멈추고 말로 해 봐요.', '#D9482B', '🌶️'),
  G('gf_crab', 'fill', '사르르 맛살', ['용서', '좋은 점 찾기'], '사르르 풀리듯 미운 마음이 녹아요.', '#E8574B', '🦀'),
  G('gf_fishcake', 'fill', '미안해 어묵채', ['사과', '입장 바꾸기'], '"미안해" 한마디가 마음을 이어 줘요.', '#E2B27A', '🍥'),
  G('gf_cheese', 'fill', '쭉쭉 치즈', ['칭찬', '고마움'], '쭉 늘어나는 치즈처럼 고마운 마음이 길게 남아요.', '#F7C948', '🧀'),
  G('gf_ham', 'fill', '신나는 햄', ['축하', '웃음'], '분홍빛 햄처럼 기분이 말랑말랑 신나요.', '#F2A0A8', '🥓'),
  G('gf_tuna', 'fill', '든든 참치', ['자신감', '뿌듯함'], '든든한 참치처럼 해낸 나를 믿어요.', '#C9B08E', '🐟'),
  G('gt_oil', 'top', '반들반들 참기름', ['소중함'], '반들반들 빛나는 너는 소중한 사람이에요.', '#E0B24C', '💧'),
  G('gt_seed', 'top', '반짝 깨', ['설렘', '칭찬'], '반짝이는 깨처럼 좋은 점이 콕콕 보여요.', '#F4E6C0', '⭐'),
];
export const GING = new Map(GIMBAP.map((g) => [g.id, g]));

export interface GPicks { rice: string | null; gim: string | null; fills: string[]; top: string | null }
export const EMPTY_G = (): GPicks => ({ rice: null, gim: null, fills: [], top: null });
export const gList = (p: GPicks): GIng[] => [p.rice, p.gim, ...p.fills, p.top].filter((x): x is string => !!x).map((id) => GING.get(id)!).filter(Boolean);

// 김밥 이름: 손님에게 꼭 필요했던 마음을 담아요
export const gName = (effect: string) => `${effect} 마음김밥`;

// 손님에게 꼭 필요했던 마음과 같은 묶음 재료가 들어 있으면 정성 도장. 이름에는 꼭 맞는 마음 → 같은 묶음 마음 → 첫 속재료 마음 순서로 담아요
export function judgeGimbap(need: Effect, p: GPicks): { stamp: boolean; effect: Effect | null; name: string } {
  const fam = FX.get(need)?.family;
  const effs = gList(p).flatMap((g) => g.effects);
  const exact = effs.includes(need) ? need : null;
  const same = effs.find((e) => FX.get(e)?.family === fam) ?? null;
  const first = p.fills.length ? GING.get(p.fills[0])?.effects[0] ?? null : null;
  const effect = exact ?? same;
  return { stamp: !!effect, effect, name: gName(effect ?? first ?? '정성') };
}
