import type { EffectInfo, Family, FamilyInfo } from './types';

export const FAMILIES: FamilyInfo[] = [
  { id: 'comfort',   name: '위로', color: '#E98BA3', soft: '#FBE3EA' },
  { id: 'together',  name: '함께', color: '#F0974A', soft: '#FDE8D4' },
  { id: 'rest',      name: '편안', color: '#8DC26F', soft: '#E7F3DD' },
  { id: 'courage',   name: '용기', color: '#E9B92A', soft: '#FBF0CC' },
  { id: 'calm',      name: '진정', color: '#6FB3E0', soft: '#DDEFFA' },
  { id: 'reconcile', name: '화해', color: '#A68BD6', soft: '#ECE5F7' },
  { id: 'love',      name: '다정', color: '#E3645A', soft: '#FADEDB' },
  { id: 'joy',       name: '기쁨', color: '#47AE7A', soft: '#D9F1E4' },
];

export const FAMILY = new Map<Family, FamilyInfo>(FAMILIES.map((f) => [f.id, f]));

const E = (family: Family, name: string, when: string, tip: string): EffectInfo => ({ id: name, family, name, when, tip });

export const EFFECTS: EffectInfo[] = [
  E('comfort', '토닥임', '속상해서 울적할 때', '슬플 때 울어도 괜찮아요. 누가 등을 토닥여 주면 슬픔이 작아져요.'),
  E('comfort', '그리움 달래기', '보고 싶은 사람이 멀리 있을 때', '함께한 좋은 기억을 이야기하면 그리운 마음이 따뜻해져요.'),
  E('comfort', '눈물 닦기', '많이 울고 난 뒤', '눈물은 마음을 씻어 줘요. 실컷 울고 나면 조금 가벼워져요.'),
  E('comfort', '곁에 있기', '걱정되는 일로 마음이 무거울 때', '아무 말 없이 옆에 있어 주는 것도 큰 위로예요.'),

  E('together', '친구 되기', '새로운 곳에서 친구가 없을 때', '"같이 놀래?" 한마디가 친구를 만들어요.'),
  E('together', '손 내밀기', '혼자 남겨진 것 같을 때', '혼자 있는 친구를 보면 먼저 다가가 봐요.'),
  E('together', '귀 기울이기', '내 말을 아무도 안 들어 줄 때', '끝까지 들어 주는 것만으로도 큰 힘이 돼요.'),
  E('together', '소속감', '우리 반, 우리 동네가 낯설 때', '내 자리가 있다고 느끼면 마음이 든든해져요.'),

  E('rest', '쉼', '몸과 마음이 지쳤을 때', '열심히 한 만큼 쉬는 것도 중요해요.'),
  E('rest', '깊은 숨', '숨이 가쁘고 답답할 때', '넷 세며 들이쉬고, 넷 세며 천천히 내쉬어요.'),
  E('rest', '단잠', '잠이 안 올 때', '잠들기 전에 화면을 끄고 좋았던 일 하나를 떠올려요.'),
  E('rest', '느긋함', '할 일이 많아 바쁠 때', '한 번에 하나씩 하면 마음이 덜 바빠요.'),

  E('courage', '씩씩함', '처음 하는 일 앞에서 떨릴 때', '떨리는 건 잘하고 싶다는 뜻이에요. "나는 할 수 있어!"'),
  E('courage', '걱정 줄이기', '걱정이 꼬리를 물 때', '걱정을 종이에 써 보면 머릿속이 가벼워져요.'),
  E('courage', '다시 해 보기', '실수하고 포기하고 싶을 때', '실수는 배우는 중이라는 뜻이에요.'),
  E('courage', '자신감', '틀릴까 봐 손을 못 들 때', '내가 잘하는 것 세 가지를 떠올려 봐요.'),

  E('calm', '화 식히기', '화가 확 치밀 때', '하나부터 다섯까지 세면 뜨거운 화가 식어요.'),
  E('calm', '잠깐 멈춤', '소리 지르거나 밀치고 싶을 때', '행동하기 전에 "잠깐!" 하고 멈춰요.'),
  E('calm', '마음 말하기', '억울하고 속이 부글부글할 때', '"나는 ~해서 속상해"라고 말로 해요.'),
  E('calm', '차분함', '시끄럽고 정신없을 때', '조용한 곳을 떠올리며 눈을 감아 봐요.'),

  E('reconcile', '사과', '내가 잘못했을 때', '먼저 "미안해"라고 말하는 건 큰 용기예요.'),
  E('reconcile', '용서', '사과를 받았는데 아직 속상할 때', '사과를 받아 주면 내 마음도 가벼워져요.'),
  E('reconcile', '입장 바꾸기', '친구 마음을 모르겠을 때', "'내가 저 친구라면?' 하고 생각해 봐요."),
  E('reconcile', '좋은 점 찾기', '미운 마음이 들 때', '다툰 친구에게도 좋은 점이 있어요.'),

  E('love', '포옹', '안기고 싶을 때', '꼭 안아 주면 "너는 소중해"라는 마음이 전해져요.'),
  E('love', '칭찬', '애쓴 걸 아무도 몰라줄 때', '잘한 점을 콕 집어 칭찬하면 마음에 오래 남아요.'),
  E('love', '고마움', '고맙다는 말을 못 했을 때', '"고마워" 한마디가 서로를 따뜻하게 해요.'),
  E('love', '소중함', '내가 작고 하찮게 느껴질 때', '나는 세상에 하나뿐인 소중한 사람이에요.'),

  E('joy', '축하', '좋은 일을 나누고 싶을 때', '친구의 좋은 일을 함께 축하하면 기쁨이 두 배가 돼요.'),
  E('joy', '웃음', '재미있는 일이 없을 때', '함께 웃으면 몸도 마음도 가벼워져요.'),
  E('joy', '설렘', '기대되는 일이 있을 때', '두근두근 기대하는 마음은 하루를 힘나게 해요.'),
  E('joy', '뿌듯함', '무언가를 해냈을 때', '끝까지 해낸 나에게 "잘했어!" 해 줘요.'),
];

export const FX = new Map(EFFECTS.map((e) => [e.id, e]));
export const familyOf = (effect: string): Family => FX.get(effect)!.family;
