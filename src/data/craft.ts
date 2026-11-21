import { MINI, type MiniKind } from './craftMini';
import { FX } from './effects';
import type { ChibiSpec, Customer, Effect, Family } from './types';

// 마음 골목 '가게 봐 주기' (수업용): 빵집·꽃집 주인이 잠깐 자리를 비운 동안 손님 세 분을 맞아요.
// 놀이 방식은 라면 가게와 같아요. 손님 이야기를 듣고, 단계마다 재료를 골라 만들어 건네면
// 고른 재료의 마음 효과로 별을 받아요 (라면과 같은 셈법).
// 미니 가게(아이스크림·문구점·책방·찻집·과일가게)는 손님 한 분, 단계마다 하나씩 세 번 골라요 (craftMini.ts)
export type CraftKind = 'bread' | 'flower' | MiniKind;
export interface CStep { id: string; label: string; info: string; max: number; optional?: boolean }
export interface CItem { id: string; kind: CraftKind; step: string; name: string; effects: Effect[]; note: string; color: string; color2?: string; shape: string }
export type CPicks = Record<string, string[]>;

const B = (id: string, step: string, name: string, effects: Effect[], note: string, color: string, shape: string, color2?: string): CItem => ({ id, kind: 'bread', step, name, effects, note, color, color2, shape });
const F = (id: string, step: string, name: string, effects: Effect[], note: string, color: string, shape: string, color2?: string): CItem => ({ id, kind: 'flower', step, name, effects, note, color, color2, shape });

export interface CraftShop {
  kind: CraftKind; shop: string; short: string; product: string; owner: { name: string; spec: ChibiSpec };
  steps: CStep[]; items: CItem[]; order: string; go: string; done: string; plaques: string[];
  // 미니 가게: 이름은 nameStep 칸에서 고른 것 + nameTail, 먹고 난 말은 taste[별 셋, 둘, 하나]
  mini?: boolean; nameStep?: string; nameTail?: string; nameStrip?: RegExp; taste?: [string[], string[], string[]];
}

export const CRAFT: Record<CraftKind, CraftShop> = {
  ...MINI,
  bread: {
    kind: 'bread', shop: '폭신 빵집', short: '빵', product: '빵',
    owner: { name: '너굴 제빵사', spec: { kind: 'raccoon', fur: '#9C8F84', fur2: '#F4EEE6', mark: '#4E443C', cloth: '#FFF4E6' } },
    order: '어서 와요. 마음까지 든든해지는 빵 하나 부탁해요.', go: '빵 만들러 가기!', done: '오븐에 굽기 ▶',
    plaques: ['토닥 빵', '용기 빵', '웃음 빵', '꿀잠 빵'],
    steps: [
      { id: 'dough', label: '반죽', info: '빵의 바탕이 될 반죽을 하나 골라요.', max: 1 },
      { id: 'fill', label: '속', info: '빵 속에 넣을 속재료를 하나 골라요.', max: 1 },
      { id: 'top', label: '토핑', info: '빵 위에 올릴 토핑을 세 가지까지 골라요.', max: 3 },
      { id: 'finish', label: '마무리', info: '마지막에 바르거나 뿌릴 것을 골라요. 안 해도 돼요.', max: 1, optional: true },
    ],
    items: [
      B('bd_milk', 'dough', '포근 우유 반죽', ['포옹', '곁에 있기'], '우유처럼 부드럽게 꼭 안아 주는 마음이에요.', '#F6E7C8', 'loaf'),
      B('bd_wheat', 'dough', '든든 통밀 반죽', ['자신감', '씩씩함'], '꼭꼭 씹을수록 힘이 나는 든든한 반죽이에요.', '#D9B98C', 'loaf'),
      B('bd_cocoa', 'dough', '토닥 코코아 반죽', ['토닥임', '눈물 닦기'], '따뜻한 코코아처럼 속상한 마음을 토닥여 줘요.', '#A47258', 'loaf'),
      B('bd_matcha', 'dough', '살랑 녹차 반죽', ['깊은 숨', '차분함'], '녹차 향을 맡으며 숨을 천천히 쉬어요.', '#B9D38E', 'loaf'),
      B('bd_rice', 'dough', '쫀득 찹쌀 반죽', ['용서', '친구 되기'], '쫀득하게 다시 붙는 찹쌀처럼 마음도 다시 이어져요.', '#F7F1E6', 'loaf'),
      B('bd_butter', 'dough', '사르르 버터 반죽', ['느긋함', '쉼'], '버터가 사르르 녹듯 바쁜 마음도 녹여요.', '#F5D98A', 'loaf'),
      B('bd_berry', 'dough', '두근 딸기 반죽', ['설렘', '웃음'], '분홍빛 반죽에 기대되는 마음이 몽글몽글해요.', '#F7C3CC', 'loaf'),
      B('bd_potato', 'dough', '달콤 고구마 반죽', ['그리움 달래기', '소중함'], '할머니가 쪄 주던 고구마처럼 따뜻한 기억이 떠올라요.', '#E8A86E', 'loaf'),

      B('bf_redbean', 'fill', '꼭꼭 단팥 속', ['그리움 달래기', '곁에 있기'], '단팥처럼 달콤한 기억이 곁에 오래 남아요.', '#8A453A', 'blob'),
      B('bf_custard', 'fill', '포근 커스터드 속', ['포옹', '토닥임'], '노란 커스터드가 마음을 포근히 감싸요.', '#F6D46A', 'blob'),
      B('bf_cream', 'fill', '사르르 생크림 속', ['쉼', '단잠'], '구름 같은 생크림처럼 푹 쉬어요.', '#FFF8EE', 'blob'),
      B('bf_choco', 'fill', '불끈 초코 속', ['자신감', '다시 해 보기'], '진한 초코 한 입에 다시 해 볼 힘이 나요.', '#5A3426', 'blob'),
      B('bf_jam', 'fill', '새콤 사과잼 속', ['사과', '입장 바꾸기'], '새콤달콤 사과잼처럼 "미안해"도 끝은 달콤해요.', '#C9474A', 'blob'),
      B('bf_lemon', 'fill', '시원 꿀레몬 속', ['화 식히기', '잠깐 멈춤'], '시원한 레몬처럼 뜨거운 화가 식어요.', '#F2D25A', 'blob'),
      B('bf_cheese', 'fill', '쭉쭉 치즈 속', ['칭찬', '고마움'], '쭉 늘어나는 치즈처럼 고마운 마음이 길게 남아요.', '#F7C948', 'blob'),
      B('bf_corn', 'fill', '반짝 옥수수 속', ['축하', '뿌듯함'], '톡톡 터지는 옥수수처럼 기쁜 일을 함께 축하해요.', '#F6CF3E', 'blob'),

      B('bt_almond', 'top', '고소 아몬드', ['귀 기울이기', '마음 말하기'], '고소한 아몬드를 나눠 먹으며 이야기를 들어 줘요.', '#D6A774', 'slice'),
      B('bt_blueberry', 'top', '두근 블루베리', ['설렘', '차분함'], '작고 동그란 블루베리처럼 두근대는 마음을 살살 달래요.', '#5B6FC2', 'berry'),
      B('bt_strawberry', 'top', '방긋 딸기', ['웃음', '친구 되기'], '빨간 딸기처럼 방긋 웃으며 친구가 돼요.', '#E5484D', 'berry'),
      B('bt_chip', 'top', '불끈 초코칩', ['씩씩함', '걱정 줄이기'], '초코칩을 하나씩 먹을 때마다 걱정이 하나씩 줄어요.', '#4E2E22', 'dots'),
      B('bt_sprinkle', 'top', '알록 스프링클', ['축하', '소속감'], '알록달록 모인 스프링클처럼 우리는 함께예요.', '#F28CB8', 'sprinkle'),
      B('bt_banana', 'top', '느긋 바나나', ['느긋함', '쉼'], '바나나처럼 둥글게 몸을 쭉 펴고 쉬어요.', '#F6E08A', 'slice'),
      B('bt_walnut', 'top', '꼭 잡아 호두', ['손 내밀기', '용서'], '단단한 호두처럼 먼저 손을 내밀어요.', '#9C6B45', 'nut'),
      B('bt_mint', 'top', '후~ 민트 잎', ['깊은 숨', '화 식히기'], '민트 향을 크게 들이마시면 마음이 시원해져요.', '#7CC79A', 'leaf'),
      B('bt_heart', 'top', '하트 쿠키', ['소중함', '칭찬'], '하트처럼 너는 소중한 사람이라는 마음을 담아요.', '#E9767E', 'heart'),
      B('bt_sesame', 'top', '토닥 깨', ['토닥임', '곁에 있기'], '작은 깨처럼 작은 토닥임도 큰 힘이 돼요.', '#F1E3C0', 'seed'),
      B('bt_apple', 'top', '미안해 사과 조각', ['사과', '좋은 점 찾기'], '사과 조각과 함께 "미안해" 하고 좋은 점을 찾아 말해요.', '#F2C46B', 'slice'),
      B('bt_marshmallow', 'top', '말랑 마시멜로', ['눈물 닦기', '포옹'], '말랑한 마시멜로처럼 눈물을 살살 닦아 줘요.', '#FFF4F6', 'puff'),
      B('bt_star', 'top', '반짝 별 사탕', ['뿌듯함', '자신감'], '해낸 나에게 반짝 별 하나를 달아 줘요.', '#FFD95E', 'star'),
      B('bt_oat', 'top', '새근 귀리', ['단잠', '차분함'], '고소한 귀리처럼 마음을 차분히 가라앉혀요.', '#E3CFA2', 'seed'),

      B('bz_sugar', 'finish', '하얀 슈가파우더', ['차분함', '잠깐 멈춤'], '눈처럼 내려앉는 가루를 보며 잠깐 멈춰요.', '#FFFFFF', 'powder'),
      B('bz_honey', 'finish', '반들 꿀 바르기', ['고마움', '소중함'], '반들반들 꿀처럼 고마운 마음이 빛나요.', '#E9B54A', 'glaze'),
      B('bz_choco', 'finish', '초코 줄무늬', ['다시 해 보기', '씩씩함'], '삐뚤어져도 괜찮아요. 다시 그으면 돼요.', '#5A3426', 'drizzle'),
      B('bz_pink', 'finish', '분홍 아이싱', ['웃음', '설렘'], '분홍 줄무늬에 웃음이 퐁퐁 나요.', '#F7B3C8', 'drizzle'),
      B('bz_milk', 'finish', '우유 아이싱', ['마음 말하기', '용서'], '하얀 아이싱처럼 마음을 솔직하게 말해요.', '#FFF8EE', 'glaze'),
      B('bz_cinnamon', 'finish', '따뜻 시나몬 가루', ['그리움 달래기', '소속감'], '시나몬 냄새가 온 동네에 퍼지듯 함께라는 마음이 퍼져요.', '#B8763E', 'powder'),
    ],
  },
  flower: {
    kind: 'flower', shop: '방긋 꽃집', short: '꽃', product: '꽃다발',
    owner: { name: '다람 꽃집지기', spec: { kind: 'squirrel', fur: '#D98A4E', fur2: '#FFF1DE', cloth: '#9FD8B8' } },
    order: '어서 와요. 제 마음에 꼭 맞는 꽃다발 하나 부탁해요.', go: '꽃다발 만들러 가기!', done: '꽃다발 묶기 ▶',
    plaques: ['위로 꽃', '용기 꽃', '웃음 꽃', '단잠 꽃'],
    steps: [
      { id: 'main', label: '주인공 꽃', info: '꽃다발 가운데 들어갈 주인공 꽃을 하나 골라요.', max: 1 },
      { id: 'side', label: '곁들일 꽃', info: '주인공 꽃 곁에 놓을 꽃을 두 가지까지 골라요.', max: 2 },
      { id: 'leaf', label: '잎·풀', info: '꽃 사이를 채울 잎이나 풀을 하나 골라요.', max: 1 },
      { id: 'wrap', label: '포장지', info: '꽃다발을 감쌀 포장지를 하나 골라요.', max: 1 },
      { id: 'ribbon', label: '리본', info: '마지막에 묶을 리본을 골라요. 안 묶어도 돼요.', max: 1, optional: true },
    ],
    items: [
      F('fm_rose', 'main', '꼭 안아 장미', ['포옹', '소중함'], '겹겹이 감싼 꽃잎처럼 꼭 안아 줘요.', '#E8506A', 'rose'),
      F('fm_sunflower', 'main', '씩씩 해바라기', ['씩씩함', '자신감'], '해를 보고 고개를 드는 해바라기처럼 씩씩하게!', '#F6C431', 'sun', '#7A4E2A'),
      F('fm_tulip', 'main', '두근 튤립', ['설렘', '축하'], '봄을 기다리는 튤립처럼 마음이 두근두근해요.', '#F28CB8', 'tulip'),
      F('fm_lily', 'main', '토닥 백합', ['토닥임', '눈물 닦기'], '하얀 백합이 눈물을 살며시 닦아 줘요.', '#FFF8EE', 'lily', '#F6D46A'),
      F('fm_hydrangea', 'main', '함께 수국', ['소속감', '친구 되기'], '작은 꽃이 모여 한 송이가 되는 수국처럼 우리는 함께예요.', '#9EB7F0', 'cluster'),
      F('fm_lavender', 'main', '새근 라벤더', ['단잠', '깊은 숨'], '라벤더 향을 맡으며 숨을 길게 쉬면 잠이 솔솔 와요.', '#B39DE8', 'spike'),
      F('fm_freesia', 'main', '사르르 프리지어', ['용서', '좋은 점 찾기'], '향긋한 프리지어처럼 미운 마음이 사르르 풀려요.', '#F7D774', 'tulip'),
      F('fm_cosmos', 'main', '살랑 코스모스', ['차분함', '화 식히기'], '바람에 살랑이는 코스모스처럼 마음을 가라앉혀요.', '#F7A9C9', 'daisy', '#F6D46A'),
      F('fm_carnation', 'main', '고마워 카네이션', ['고마움', '칭찬'], '"고마워" 한마디를 카네이션에 담아요.', '#F06B7C', 'rose'),

      F('fs_babys', 'side', '포근 안개꽃', ['곁에 있기', '귀 기울이기'], '안개꽃처럼 조용히 곁에서 이야기를 들어 줘요.', '#FFFFFF', 'cluster'),
      F('fs_daisy', 'side', '방긋 데이지', ['웃음', '친구 되기'], '방긋 웃는 데이지처럼 먼저 웃으며 다가가요.', '#FFFFFF', 'daisy', '#F6C431'),
      F('fs_forget', 'side', '보고픈 물망초', ['그리움 달래기', '소중함'], '"나를 잊지 마세요" 물망초처럼 좋은 기억을 간직해요.', '#7FB2F0', 'cluster'),
      F('fs_chamomile', 'side', '새근 캐모마일', ['쉼', '차분함'], '캐모마일 차를 마시듯 쉬어 가요.', '#FFF6D8', 'daisy', '#F6C431'),
      F('fs_gerbera', 'side', '불끈 거베라', ['다시 해 보기', '걱정 줄이기'], '쨍한 거베라처럼 다시 한번 힘을 내요.', '#F28A3C', 'daisy', '#7A4E2A'),
      F('fs_sweetpea', 'side', '미안해 스위트피', ['사과', '입장 바꾸기'], '나비 같은 스위트피에 "미안해"를 담아요.', '#D9A8F0', 'tulip'),
      F('fs_marigold', 'side', '해냈다 메리골드', ['뿌듯함', '축하'], '해낸 날은 메리골드처럼 환하게!', '#F6A23C', 'daisy', '#B8601E'),
      F('fs_bluestar', 'side', '말해요 블루스타', ['마음 말하기', '잠깐 멈춤'], '잠깐 멈추고 별처럼 또렷하게 마음을 말해요.', '#8DB8F5', 'daisy', '#FFFFFF'),
      F('fs_ranunculus', 'side', '꼭꼭 라넌큘러스', ['칭찬', '포옹'], '겹겹이 쌓인 꽃잎처럼 칭찬을 차곡차곡 건네요.', '#F5A3A3', 'rose'),
      F('fs_valley', 'side', '느긋 은방울꽃', ['느긋함', '쉼'], '고개 숙인 은방울처럼 천천히, 느긋하게.', '#FFFFFF', 'bell'),

      F('fl_eucalyptus', 'leaf', '후~ 유칼립투스', ['깊은 숨', '느긋함'], '상쾌한 잎 냄새를 맡으며 숨을 깊게 쉬어요.', '#9DBFA5', 'round'),
      F('fl_fern', 'leaf', '손잡이 고사리 잎', ['손 내밀기', '친구 되기'], '쭉 뻗은 고사리 잎처럼 먼저 손을 내밀어요.', '#6FAE5C', 'fern'),
      F('fl_olive', 'leaf', '화해 올리브 가지', ['용서', '화 식히기'], '올리브 가지는 다시 사이좋게 지내자는 뜻이에요.', '#8FA87A', 'long'),
      F('fl_clover', 'leaf', '행운 네잎클로버', ['설렘', '씩씩함'], '네잎클로버를 쥐면 "할 수 있어!" 하는 마음이 생겨요.', '#5FB85A', 'clover'),
      F('fl_ivy', 'leaf', '곁에 아이비', ['곁에 있기', '고마움'], '담장을 감싸는 아이비처럼 곁에 있어 줘요.', '#4E9A57', 'ivy'),

      F('fw_kraft', 'wrap', '포근 크라프트지', ['토닥임', '쉼'], '포근한 갈색 종이가 꽃을 토닥토닥 감싸요.', '#D8B98C', 'wrap'),
      F('fw_pink', 'wrap', '분홍 한지', ['포옹', '웃음'], '분홍 한지로 꼭 안듯 감싸요.', '#F7C6D2', 'wrap'),
      F('fw_sky', 'wrap', '하늘색 망사', ['차분함', '깊은 숨'], '하늘색 망사처럼 마음이 맑아져요.', '#BFE0FA', 'wrap'),
      F('fw_yellow', 'wrap', '노랑 종이', ['자신감', '축하'], '노란 종이처럼 마음이 환하게 빛나요.', '#FBE7A1', 'wrap'),
      F('fw_lilac', 'wrap', '연보라 종이', ['입장 바꾸기', '마음 말하기'], '연보라 종이에 친구 마음을 떠올려 봐요.', '#DCCBF6', 'wrap'),

      F('fr_red', 'ribbon', '빨강 리본', ['고마움', '칭찬'], '빨강 리본에 고마운 마음을 꼭 묶어요.', '#E3645A', 'ribbon'),
      F('fr_gold', 'ribbon', '금빛 리본', ['뿌듯함', '다시 해 보기'], '금빛 리본처럼 해낸 마음이 반짝여요.', '#E9B92A', 'ribbon'),
      F('fr_green', 'ribbon', '초록 리본', ['소속감', '손 내밀기'], '초록 리본처럼 우리는 함께 이어져 있어요.', '#47AE7A', 'ribbon'),
      F('fr_white', 'ribbon', '하양 리본', ['사과', '용서'], '하얀 리본처럼 깨끗하게 사과하고 받아 줘요.', '#FFFFFF', 'ribbon'),
    ],
  },
};
export const CITEM = new Map(Object.values(CRAFT).flatMap((s) => s.items).map((i) => [i.id, i]));
export const emptyPicks = (kind: CraftKind): CPicks => Object.fromEntries(CRAFT[kind].steps.map((s) => [s.id, []]));
export const pickedItems = (p: CPicks): CItem[] => Object.values(p).flat().map((id) => CITEM.get(id)!).filter(Boolean);

// 라면과 같은 별 셈법: 꼭 필요한 마음 묶음 재료 셋 이상 + 꼭 맞는 마음 + 더하면 좋은 묶음 재료 하나면 별 셋
export interface CraftScore { stars: 1 | 2 | 3; match: number; help: number; exact: boolean; glow: Map<string, 'main' | 'sub'> }
export function scoreCraft(c: Customer, p: CPicks): CraftScore {
  const main = FX.get(c.needs.effect)!.family;
  let match = 0, help = 0, exact = false;
  const glow = new Map<string, 'main' | 'sub'>();
  for (const it of pickedItems(p)) {
    const fams = new Set<Family>(it.effects.map((e) => FX.get(e)!.family));
    if (fams.has(main)) { match++; glow.set(it.id, 'main'); if (it.effects.includes(c.needs.effect)) exact = true; }
    else if (fams.has(c.needs.sub)) { help++; glow.set(it.id, 'sub'); }
  }
  const mini = pickedItems(p).some((it) => CRAFT[it.kind].mini);
  const stars: 1 | 2 | 3 = mini
    // 미니 가게(세 번 고르기): 같은 묶음 둘 + 꼭 맞는 마음이면 별 셋
    ? (match >= 2 && exact ? 3 : match >= 2 || (match >= 1 && (exact || help >= 1)) ? 2 : 1)
    : match >= 3 && exact && help >= 1 ? 3 : match >= 2 || (match >= 1 && help >= 2) ? 2 : 1;
  return { stars, match, help, exact, glow };
}

// 만든 것 이름: 빵은 반죽 이름에서, 꽃다발은 주인공 꽃 이름에서
export function craftName(kind: CraftKind, p: CPicks): string {
  const sh = CRAFT[kind];
  if (sh.mini) {
    const it = CITEM.get(p[sh.nameStep!]?.[0] ?? '');
    if (!it) return `마음 ${sh.product}`;
    const base = sh.nameStrip ? it.name.replace(sh.nameStrip, '') : it.name;
    return sh.nameTail ? `${base} ${sh.nameTail}` : base;
  }
  if (kind === 'bread') { const d = CITEM.get(p.dough?.[0] ?? ''); return d ? `${d.name.replace(/\s*반죽$/, '')} 빵` : '마음 빵'; }
  const m = CITEM.get(p.main?.[0] ?? ''); return m ? `${m.name} 꽃다발` : '마음 꽃다발';
}

// ── 라면 손님 말투를 가게에 맞게 ──
const ORDER = /(라면|국물|그릇)/;
const ORDER_LINE = /(부탁|주세요|주실|줄래|주시|줘요|먹으러|먹고 싶)/;
export function adaptStory(c: Customer, kind: CraftKind): string[] {
  const shop = CRAFT[kind], word = shop.product;
  let ordered = false;
  const out: string[] = [];
  for (const line of c.story) {
    const m = line.match(/^(@\d+\s+)?(.*)$/)!, sp = m[1] ?? '', body = m[2];
    if (ORDER.test(body) && ORDER_LINE.test(body)) {
      // 라면을 주문하는 말 → 가게 주문으로 (한 번만, 둘이 온 손님의 투정은 짧게 바꿔요)
      if (!ordered) { out.push(sp + (sp ? `${word}은 따로따로 주세요!` : shop.order)); ordered = true; }
      else out.push(sp + `${word}은 따로따로 주세요!`);
      continue;
    }
    out.push(sp + swapWords(body, kind));
  }
  if (!ordered) out.unshift(shop.order);
  return out;
}
function swapWords(s: string, kind: CraftKind) {
  const w = CRAFT[kind].product;
  return s.replace(/라면 가게/g, `${CRAFT[kind].shop}`).replace(/라면/g, w).replace(/두 그릇/g, '두 개').replace(/한 그릇/g, '하나').replace(/그릇/g, '개');
}
export function craftLines(c: Customer, kind: CraftKind, stars: 1 | 2 | 3, name: string): string[] {
  const fx = FX.get(c.needs.effect)!;
  const tail = (c.reactions[1][0] ?? '').split(/그런데\s*|그래도\s*/)[1]?.trim();
  const sh = CRAFT[kind];
  if (sh.mini && sh.taste) {
    const lines = sh.taste[3 - stars].map((l) => l.replace('{name}', name).replace('{fx}', fx.name));
    if (stars === 1 && tail) lines[1] = `그런데 ${tail}`;
    return lines;
  }
  if (kind === 'bread') {
    if (stars === 3) return [`(냠냠) ${name}을 한 입 먹으니 마음이 몽글몽글 차올라요.`, `제게 꼭 필요했던 '${fx.name}' 마음이 빵 속에 꽉 들어 있어요. 고마워요!`];
    if (stars === 2) return [`(냠냠) 따끈한 ${name}, 맛있어요.`, '마음이 조금 나아졌어요. 고마워요.'];
    return [`(냠냠) ${name} 고마워요.`, tail ? `그런데 ${tail}` : `그런데 제게는 '${fx.name}' 같은 마음이 더 필요했어요.`];
  }
  if (stars === 3) return [`와, ${name}이에요! 마음이 꽃처럼 활짝 피었어요.`, `제게 꼭 필요했던 '${fx.name}' 마음을 꽃마다 담아 주셨네요. 고마워요!`];
  if (stars === 2) return [`${name} 고마워요. 정말 예뻐요!`, '보고 있으니 마음이 조금 환해졌어요.'];
  return [`${name} 고마워요.`, tail ? `그런데 ${tail}` : `그런데 제게는 '${fx.name}' 같은 마음이 더 필요했어요.`];
}
