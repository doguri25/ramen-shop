import type { Family, Step } from './types';

// 튜토리얼에서 국숫집 할아버지가 하는 말
export const TUTOR_INTRO = [
  '어서 오게, 새 사장님! 나는 이 골목에서 오래 국숫집을 해 온 할아버지라네.',
  '이 가게 라면은 배만 채우지 않아. 손님 마음까지 채워 주지.',
  '오늘은 가게 첫날이니, 내가 첫 손님이 되어 주겠네.',
  '손님 이야기에 나오는 [[반짝이는 말]]을 잘 들어 보게. 그게 손님 마음의 단서라네.',
];
export const TUTOR_STEP: Record<Step | 'name' | 'serve' | 'note', string> = {
  broth: '먼저 국물을 고르게. 카드를 누르면 냄비에 쏙 들어가고, 위에 마음 설명이 나온다네. \'다음\'을 누르면 앞 단계는 다시 바꿀 수 없으니 잘 골라 보게. 축하하는 날엔 무엇이 좋을까?',
  noodle: '면은 하나만 고르면 돼. 다른 카드를 누르면 바꿔 넣을 수 있다네.',
  soup: '스프는 라면 맛의 중심이지. 카드에 있는 색깔 점은 어떤 마음 묶음인지 알려 준다네.',
  topping: '건더기는 세 가지까지 넣을 수 있어. 한 번 더 누르면 다시 빠진다네.',
  finish: '마무리 조미료는 넣고 싶을 때만 넣는다네. 두 가지까지 넣고 양도 정할 수 있지. 안 넣으려면 \'마무리 없이 이름 짓기\'를 누르게.',
  name: '이제 라면 이름을 지어 보세. 손님 마음이 담긴 말이 들어가면 손님이 더 기뻐한다네.',
  serve: '다 됐으면 \'내어 주기\'를 누르게!',
  note: '별은 손님 마음에 얼마나 꼭 맞았는지 알려 준다네. 마음 쪽지를 읽어 보고, 다음 손님부터는 자네 혼자 해 보게!',
};

// 이름 짓기 낱말
export const NAME_FRONT = ['슬픔', '그리움', '눈물', '외로움', '걱정', '떨림', '화', '짜증', '피곤함', '서운함', '미움', '기쁨', '웃음', '설렘'];
export const NAME_VERB = ['날려', '녹여', '덜어', '식혀', '채워', '나눠', '키워'];
export const NAME_ADJ = ['편안해', '따뜻해', '든든해', '가벼워', '시원해'];
// '○○ ○○맛 마음라면' 틀: 마음맛 낱말과 맛 낱말
export const NAME_MAT = ['용기', '사랑', '기쁨', '웃음', '화해', '축하', '설렘', '추억', '위로', '응원'];
export const NAME_TASTE = ['매콤', '얼큰', '달콤', '새콤', '새콤달콤', '짭짤', '단짠', '고소', '구수', '시원', '순한'];
// 넣은 재료로 맛 낱말을 추천해요 (★)
export const TASTE_OF: Record<string, string[]> = {
  b_anchovy: ['시원'], b_bone: ['구수'], b_kimchi: ['매콤', '얼큰'], b_doenjang: ['구수'], b_seafood: ['시원', '얼큰'], b_feast: ['짭짤'], b_chicken: ['순한', '고소'],
  s_sadness: ['순한'], s_calm: ['순한'], s_love: ['달콤'], s_cheer: ['매콤'], s_party: ['단짠'], s_cool: ['시원'], s_play: ['달콤'], s_apple: ['새콤달콤', '새콤'],
  t_egg: ['고소'], t_dumpling: ['짭짤'], t_scallion: ['시원'], t_fishcake: ['짭짤'], t_gim: ['짭짤'], t_shiitake: ['구수'], t_corn: ['달콤'], t_chili: ['매콤', '얼큰'],
  t_tofu: ['고소', '순한'], t_tteok: ['달콤'], t_sprout: ['시원'], t_yubu: ['단짠'], t_sausage: ['짭짤', '단짠'], t_quail: ['짭짤'],
  f_sesame: ['고소'], f_giggle: ['달콤'], f_pepper: ['매콤'], f_oil: ['고소'], f_salt: ['짭짤'], f_cheese: ['고소', '단짠'], f_gimflake: ['짭짤', '고소'], f_butter: ['고소', '달콤'], f_stargim: ['짭짤'],
  b_sprout: ['시원'], b_udon: ['순한', '구수'], b_pumpkin: ['달콤', '순한'], n_spinach: ['순한'], n_kalguksu: ['구수'], n_buckwheat: ['구수', '고소'],
  s_sleep: ['순한'], s_brave: ['매콤', '얼큰'], s_flutter: ['달콤', '새콤달콤'], s_thanks: ['구수', '고소'],
  t_potato: ['고소', '순한'], t_carrot: ['달콤'], t_broccoli: ['고소'], t_cucumber: ['시원'], t_peas: ['달콤'], f_honey: ['달콤'], f_chive: ['시원'], f_perilla: ['고소', '구수'],
};

export const FAMILY_WORDS: Record<Family, { front: string[]; verb: string[]; adj: string[]; mat: string[] }> = {
  comfort:   { front: ['슬픔', '그리움', '눈물'], verb: ['날려', '녹여', '덜어'], adj: ['따뜻해'], mat: ['위로', '추억'] },
  together:  { front: ['외로움'], verb: ['녹여', '날려'], adj: ['든든해'], mat: ['웃음', '기쁨'] },
  rest:      { front: ['피곤함'], verb: ['덜어', '날려'], adj: ['편안해', '가벼워'], mat: ['위로', '응원'] },
  courage:   { front: ['걱정', '떨림'], verb: ['덜어', '날려'], adj: ['든든해'], mat: ['용기', '응원'] },
  calm:      { front: ['화', '짜증'], verb: ['식혀', '날려'], adj: ['시원해', '편안해'], mat: ['위로'] },
  reconcile: { front: ['미움', '서운함'], verb: ['녹여'], adj: ['따뜻해'], mat: ['화해', '사랑'] },
  love:      { front: ['서운함'], verb: ['녹여', '덜어'], adj: ['따뜻해'], mat: ['사랑'] },
  joy:       { front: ['기쁨', '웃음', '설렘'], verb: ['나눠', '키워', '채워'], adj: ['가벼워'], mat: ['기쁨', '축하', '설렘'] },
};

// 고운 말 지킴이 (공백·숫자·기호를 뺀 뒤 비교)
export const BADWORDS = [
  '시발', '씨발', '씨빨', '시바', '씨바', 'ㅅㅂ', 'ㅆㅂ', '병신', '븅신', 'ㅂㅅ', '개새', '새끼', 'ㅅㄲ', '지랄', 'ㅈㄹ', '존나', '졸라', 'ㅈㄴ',
  '닥쳐', '꺼져', '미친', '미쳤', 'ㅁㅊ', '멍청', '등신', '찐따', '바보', '애미', '애비', '느금', '니미', '엠창', '썅', '쌍놈', '쌍년', '년아', '놈아',
  '죽어', '죽여', '죽을래', '꺼지', '돼지새', '똥개', '빡대가리', '대가리', '또라이', '돌아이', '변태', '섹스', '야동', '야사',
  'fuck', 'shit', 'bitch', 'damn', 'sex', 'stupid', 'idiot',
  '씨팔', '시팔', '십팔', 'ㅄ', '좆', '좃', '개같', '개소리', '꺼저', '뒤질래', '뒤져라', '디져', '닥치', '병쉰', '병싄', '븅', '시벌', '씨벌', '쉬발', '씌발', '씨이발',
  '씹새', '씹할', '미췬', '급식충', '맘충', '틀딱', 'tlqkf', 'qudtls', 'wlfkf', 'fxck',
  'ㅗㅗ', '새꺄', '시이발', '빙신', '싸가지', '개쉐', '좇같', 'sibal',
];

// 받침에 맞는 조사: josa('카드', '을', '를') → '카드를', josa('책', '을', '를') → '책을'
export function josa(word: string, withB: string, without: string): string {
  const core = word.replace(/[^가-힣0-9A-Za-z]+$/u, '');
  const ch = core.charCodeAt(core.length - 1);
  let has = false;
  if (ch >= 0xac00 && ch <= 0xd7a3) has = (ch - 0xac00) % 28 !== 0;
  else if (/[0-9]$/.test(core)) has = /[013678]$/.test(core);
  return word + (has ? withB : without);
}
