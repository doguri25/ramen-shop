import { FX } from '../data/effects';
import { ING } from '../data/ingredients';
import type { Customer, Family, Ingredient, Picks } from '../data/types';

export const pickedList = (p: Picks): Ingredient[] =>
  [p.broth, p.noodle, p.soup, ...p.toppings, ...p.finish.map((f) => f.id)].filter(Boolean).map((id) => ING.get(id as string)!);

export interface ScoreResult { stars: 1 | 2 | 3; match: number; help: number; exact: boolean; mainFamily: Family; glow: Map<string, 'main' | 'sub'> }

export function score(c: Customer, picks: Picks): ScoreResult {
  const mainFamily = FX.get(c.needs.effect)!.family;
  let match = 0, help = 0, exact = false;
  const glow = new Map<string, 'main' | 'sub'>();
  for (const it of pickedList(picks)) {
    const fams = new Set(it.effects.map((e) => FX.get(e)!.family));
    if (fams.has(mainFamily)) {
      match++;
      glow.set(it.id, 'main');
      if (it.effects.includes(c.needs.effect)) exact = true;
    } else if (fams.has(c.needs.sub)) {
      help++;
      glow.set(it.id, 'sub');
    }
  }
  const stars: 1 | 2 | 3 = match >= 3 && exact && help >= 1 ? 3 : match >= 2 || (match >= 1 && help >= 2) ? 2 : 1;
  return { stars, match, help, exact, mainFamily, glow };
}

// 행사용 별 다섯 단계
// ★ 라면을 끓였어요 · ★★ 마음 묶음 재료 2가지 · ★★★ 3가지 이상
// ★★★★ 꼭 필요한 마음 재료 + 더하면 좋은 마음 재료 (수업용 별 셋) · ★★★★★ 여기에 이름 하트까지
export const fiveStars = (r: ScoreResult, heart: boolean) =>
  r.stars === 3 ? (heart ? 5 : 4) : r.stars === 2 ? (r.match >= 3 ? 3 : 2) : 1;

// 이름에 손님 마음 낱말이 들어 있으면 하트 도장
// 이름 틀에 늘 들어 있는 말('…마음라면', '속이 …', 예전 '친구')은 빼고 봐요. 그래야 누구나 하트를 받지 않아요
// ── 뜻이 거꾸로인 이름 ('슬픔을 키워', '기쁨을 날리는', '용기 없는', '마음이 슬퍼지는') ──
// 줄여야 할 마음(NEG)을 키우거나, 키워야 할 마음(POS)을 없애는 이름에는 하트를 주지 않아요.
// 다만 바른 이름은 막지 않아요: 때를 말하는 말('걱정이 생길 때', '…하면'), 친구를 꾸미는 말('웃음을 잃은 친구에게'),
// '…해도'로 이어지는 말('슬픔이 많아도 힘내는')
const NEG = '슬픔|그리움|눈물|외로움|걱정|떨림|화|짜증|피곤함|피곤|서운함|미움|속상함|억울함|질투|불안|두려움|무서움|부끄러움|답답함|우울|스트레스|긴장|고민|아픔|상처|분노';
const POS = '기쁨|웃음|설렘|용기|사랑|행복|자신감|힘|희망|평화|우정|고마움|감사|즐거움|따뜻함|편안함|위로|칭찬|응원|미소|기운|활력|자신|웃음꽃';
const ADV = '(?:(?:더|더욱|많이|가득|자꾸|계속|다시|또|쑥쑥|무럭무럭|펑펑|마구|막|확|팍팍|잔뜩|훨씬|점점|몽땅|싹|다)\\s*)?';
const PART = '(?:을|를|이|가|은|는|도|만|까지)?';
const GROW = '키우|키워|키울|키운|채우|채워|채울|채운|늘리|늘려|늘어|커지|커져|커진|커질|쌓이|쌓여|쌓인|쌓는|생기|생겨|생긴|많아지|많아져|넘치|넘쳐|넘친|샘솟|솟아|솟는|가득|더하|더해|불어나|부풀';
const LOSE = '날리|날려|날린|날릴|녹이|녹여|녹인|덜어|덜고|덜|식히|식혀|식힌|없애|없어|없는|없이|없을|줄이|줄여|줄어|줄인|사라지|사라져|사라진|사라질|지우|지워|지운|빼앗|뺏|잃|꺼지|꺼트|꺼뜨|멈추|멈춰|멈춘|망치|깨뜨|깨트|부수|빠지|빠져|빠진|떨어지|떨어져|떨어진|(?:안|못)\\s*(?:나|나오|생기|생겨|내|느끼|느껴|받)';
const SAD_ADJ = '슬퍼|외로워|무거워|답답해|우울해|불안해|속상해|쓸쓸해|서운해|아파|피곤해|무서워|두려워|짜증나|화나|떨려|불편해|차가워|싸늘해';
const BACK = [
  new RegExp(`(?:^|\\s)(?:${NEG})${PART}\\s*${ADV}(?:${GROW})([가-힣]*)(\\s+\\S+)?`, 'g'),
  new RegExp(`(?:^|\\s)(?:${POS})${PART}\\s*${ADV}(?:${LOSE})([가-힣]*)(\\s+\\S+)?`, 'g'),
  new RegExp(`(?:^|\\s|마음이)(?:${SAD_ADJ})\\s*(?:지|져|진|질)([가-힣]*)(\\s+\\S+)?`, 'g'),
];
// 때·조건·'…해도'로 끝나는 말, 그리고 뒤에 '친구에게'처럼 사람을 꾸미는 말이 오면 이름의 효과가 아니에요
const NOT_EFFECT_END = /(면|도|때|땐|지만|는데|어서|아서|니까|면서)$/;
const PERSON_NEXT = /^\s*(친구|너|나|우리|손님|아이|동생|형|누나|언니|오빠|사람|짝꿍|짝|선생님|엄마|아빠|할머니|할아버지|가족)(에게|한테|를|을|의|가|이|는|은|와|과|랑|도|들|위한|위해)/;
export const isBackward = (name: string) => {
  const t = name.trim().replace(/\s+/g, ' ');
  for (const re of BACK) {
    re.lastIndex = 0;
    for (let m = re.exec(t); m; m = re.exec(t)) {
      // 붙여 쓴 이름('…키워주는라면')은 끝의 '라면'을 떼고 봐요 ('면'으로 끝나는 조건 말과 헷갈리지 않게)
      const tail = (m[1] ?? '').replace(/(친구|마음)?라면.*$/, ''), next = m[2] ?? '';
      if (NOT_EFFECT_END.test(tail) || /^\s*(때|땐)/.test(next) || PERSON_NEXT.test(next)) continue;
      return true;
    }
  }
  return false;
};
// 한 글자 낱말('화', '힘', '잠')은 다른 낱말 속에 섞이기 쉬워서('대화', '손님') 낱말 맨 앞에 조사와 함께 있을 때만 봐요
const ONE = /^(.)(을|를|이|가|은|는|도|)$/;
export const hasHeart = (c: Customer, name: string) => {
  const raw = name.replace(/\s/g, '');
  if (isBackward(name)) return false;
  const n = raw.replace(/마음라면/g, '라면').replace(/친구|만들어|다시마/g, '').replace(/^(마음이|속이)/, ''); // '들어'·'다시'가 다른 낱말 속에 있을 때는 빼요
  const tokens = name.trim().split(/\s+/).map((t) => t.replace(/[^가-힣]/g, ''));
  return c.feelingWords.some((w0) => {
    const w = w0.replace(/\s/g, '');
    if (!w || w === '친구') return false;
    if (w.length === 1) return tokens.some((t) => { const m = t.match(ONE); return !!m && m[1] === w; });
    // '따뜻해' → '따뜻한 라면'도 알아봐요
    const stem = w.length >= 3 && /(해|워)$/.test(w) ? w.slice(0, -1) : w;
    return n.includes(stem);
  });
};
