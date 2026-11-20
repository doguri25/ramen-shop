import type { Ingredient, Step } from './types';

const I = (id: string, step: Step, name: string, effects: string[], note: string, look: Ingredient['look'], tag?: string): Ingredient =>
  ({ id, step, name, effects, note, look, tag });

export const INGREDIENTS: Ingredient[] = [
  // 국물 10
  I('b_anchovy', 'broth', '토닥토닥 멸치 국물', ['토닥임'], '누가 등을 토닥여 주면 슬픈 마음이 조금 가벼워져요.', { model: 'broth', color: '#E9C47E' }),
  I('b_bone', 'broth', '뭉근 사골 국물', ['쉼', '단잠'], '오래 끓인 국물처럼 몸과 마음도 푹 쉬는 시간이 필요해요.', { model: 'broth', color: '#F1E7D4' }),
  I('b_kimchi', 'broth', '두근두근 김치 국물', ['씩씩함'], '가슴이 두근거리는 건 잘하고 싶은 마음이 있어서예요.', { model: 'broth', color: '#E2653E' }),
  I('b_doenjang', 'broth', '사이좋은 된장 국물', ['입장 바꾸기', '용서'], '콩과 소금이 어울려 맛을 내듯, 다른 마음끼리도 어울릴 수 있어요.', { model: 'broth', color: '#BF8E57' }),
  I('b_seafood', 'broth', '시원 바다 해물 국물', ['화 식히기', '차분함'], '화가 날 땐 넓은 바다를 떠올리며 숨을 크게 쉬어요.', { model: 'broth', color: '#EC9A72' }),
  I('b_feast', 'broth', '보글보글 잔치 국물', ['축하'], '좋은 날엔 다 같이 모여 잔치하듯 기쁨을 나눠요.', { model: 'broth', color: '#F2D27C' }),
  I('b_chicken', 'broth', '포근 닭 국물', ['포옹', '고마움'], '아플 때 누가 끓여 준 국물처럼, 돌봐 준 마음에 "고마워" 해요.', { model: 'broth', color: '#F4DFA6' }),
  I('b_sprout', 'broth', '맑은 숨 콩나물 국물', ['깊은 숨', '차분함'], '맑은 국물처럼 숨을 천천히 고르면 마음도 맑아져요.', { model: 'broth', color: '#F3EBC4' }),
  I('b_udon', 'broth', '두런두런 우동 국물', ['마음 말하기', '귀 기울이기'], '따뜻한 국물을 사이에 두고 두런두런 이야기하면 속이 풀려요.', { model: 'broth', color: '#E5C185' }),
  I('b_pumpkin', 'broth', '달콤 단호박 국물', ['뿌듯함', '소중함'], '오래 익힐수록 달콤해지는 단호박처럼, 애쓴 나는 참 소중해요.', { model: 'broth', color: '#F2B544' }),

  // 면 9
  I('n_curly', 'noodle', '꼬불꼬불 우정 면', ['친구 되기'], '꼬불꼬불 엮인 면처럼 우리는 서로 이어져 있어요.', { model: 'noodle', color: '#F0D088', style: 'curly' }),
  I('n_thick', 'noodle', '굵고 든든한 면', ['자신감', '걱정 줄이기'], '든든하게 먹고 나면 걱정이 조금 작아 보여요.', { model: 'noodle', color: '#EBD49C', style: 'thick' }),
  I('n_thin', 'noodle', '보들보들 실 면', ['느긋함'], '서두르지 않아도 괜찮아요. 천천히, 하나씩.', { model: 'noodle', color: '#F7ECCB', style: 'thin' }),
  I('n_rainbow', 'noodle', '알록달록 무지개 면', ['웃음'], '여러 빛깔이 모여 무지개가 되듯 웃음도 모일수록 커져요.', { model: 'noodle', color: '#F2B5B5', style: 'rainbow' }),
  I('n_chewy', 'noodle', '쫀득 이음 면', ['용서'], '끊어진 마음도 다시 이을 수 있어요.', { model: 'noodle', color: '#E4DED2', style: 'chewy' }),
  I('n_long', 'noodle', '길쭉 기억 면', ['그리움 달래기'], '길게 이어진 면처럼 좋은 기억은 오래오래 이어져요.', { model: 'noodle', color: '#EDCD8C', style: 'long' }),
  I('n_spinach', 'noodle', '불끈 시금치 면', ['자신감', '씩씩함'], '초록 시금치 면을 먹고 "나는 할 수 있어!" 하고 힘을 내요.', { model: 'noodle', color: '#9CC46A', style: 'thin' }),
  I('n_kalguksu', 'noodle', '넉넉 칼국수 면', ['곁에 있기', '토닥임'], '넓적한 면처럼 넉넉한 마음으로 곁에 있어 주고 토닥여 줘요.', { model: 'noodle', color: '#F1E6C6', style: 'chewy' }),
  I('n_buckwheat', 'noodle', '꼭꼭 메밀 면', ['사과', '용서'], '꼭꼭 씹을수록 고소한 메밀처럼, "미안해"와 "괜찮아"를 천천히 나눠요.', { model: 'noodle', color: '#A9957C', style: 'long' }),

  // 스프 12
  I('s_sadness', 'soup', '토닥토닥 위로맛 스프', ['눈물 닦기', '토닥임'], '슬픔을 꾹 참지 말고 이야기하면 마음이 가벼워져요.', { model: 'packet', color: '#E98BA3', color2: '#D8783F' }),
  I('s_calm', 'soup', '살랑살랑 편안맛 스프', ['깊은 숨'], '숨을 천천히 크게 쉬면 마음도 살랑살랑 풀려요.', { model: 'packet', color: '#8DC26F', color2: '#D99A4F' }),
  I('s_love', 'soup', '보물찾기 칭찬맛 스프', ['소중함', '좋은 점 찾기'], '나와 친구의 좋은 점을 보물처럼 하나씩 찾아 칭찬해 봐요.', { model: 'packet', color: '#E3645A', color2: '#D8643F' }),
  I('s_cheer', 'soup', '씩씩 응원맛 스프', ['씩씩함', '다시 해 보기'], '"힘내!" 한마디가 큰 힘이 될 때가 있어요.', { model: 'packet', color: '#E9B92A', color2: '#D9703A' }),
  I('s_party', 'soup', '반짝반짝 축하맛 스프', ['축하', '뿌듯함'], '해낸 일을 축하하면 다음에도 해낼 힘이 생겨요.', { model: 'packet', color: '#47AE7A', color2: '#E0A045' }),
  I('s_cool', 'soup', '후~ 차분맛 스프', ['잠깐 멈춤', '마음 말하기'], '뜨거운 국물을 후~ 불어 식히듯, 멈추고 숨 쉬고 나서 말해요.', { model: 'packet', color: '#6FB3E0', color2: '#D99257' }),
  I('s_play', 'soup', '같이 놀자 우정맛 스프', ['친구 되기', '소속감'], '"같이 놀자!" 한마디로 함께하는 자리가 생겨요.', { model: 'packet', color: '#F0974A', color2: '#D9763E' }),
  I('s_sleep', 'soup', '새근새근 단잠맛 스프', ['단잠', '쉼'], '푹 자고 나면 무거웠던 몸과 마음이 한결 가벼워져요.', { model: 'packet', color: '#7E8FD6', color2: '#D99A4F' }),
  I('s_brave', 'soup', '불끈 용기맛 스프', ['자신감', '걱정 줄이기'], '걱정을 하나씩 줄여 가면 용기가 불끈 솟아요.', { model: 'packet', color: '#E86A3A', color2: '#D8643F' }),
  I('s_flutter', 'soup', '두근두근 설렘맛 스프', ['설렘', '웃음'], '기대되는 일을 떠올리면 가슴이 두근두근, 웃음이 나요.', { model: 'packet', color: '#F28CB8', color2: '#E0904A' }),
  I('s_thanks', 'soup', '포근포근 고마움맛 스프', ['고마움', '포옹'], '"고마워"라고 말하며 꼭 안아 주면 마음이 포근해져요.', { model: 'packet', color: '#E0A35E', color2: '#D98A45' }),
  I('s_apple', 'soup', '새콤달콤 사과맛 스프', ['사과'], '새콤한 사과처럼 "미안해"도 처음엔 쑥스럽지만 끝은 달콤해요.', { model: 'packet', color: '#A68BD6', color2: '#D9804A' }),

  // 건더기 20
  I('t_egg', 'topping', '포근 반숙 달걀', ['곁에 있기'], '포근하게 감싸 주듯 곁에 있어 주는 것만으로도 힘이 돼요.', { model: 'egg', color: '#FFF8EC', color2: '#F5B53A' }),
  I('t_dumpling', 'topping', '꼭 안아 만두', ['포옹'], '꼭 안아 주면 "너는 소중해"라는 마음이 전해져요.', { model: 'dumpling', color: '#F6ECDA' }),
  I('t_scallion', 'topping', '손잡이 대파', ['손 내밀기'], '혼자 있는 친구에게 먼저 손을 내밀어 봐요.', { model: 'scallion', color: '#7DBA5A', color2: '#E6F2D2' }),
  I('t_fishcake', 'topping', '미안해 어묵', ['사과'], '먼저 "미안해"라고 말하는 건 큰 용기예요.', { model: 'fishcake', color: '#F5E6C8', color2: '#EE8FA8' }),
  I('t_gim', 'topping', '고마워 김', ['고마움'], '"고마워" 한마디에 서운했던 마음이 풀리기도 해요.', { model: 'gim', color: '#2E3A2C' }),
  I('t_shiitake', 'topping', '차분 표고버섯', ['차분함', '잠깐 멈춤'], '화가 날 땐 잠깐 멈추고 하나, 둘, 셋 숨을 쉬어요.', { model: 'shiitake', color: '#8A5A3B', color2: '#F1E1C8' }),
  I('t_corn', 'topping', '반짝 옥수수', ['설렘'], '기대되는 일 하나를 떠올리면 하루가 반짝여요.', { model: 'corn', color: '#F6CF3E' }),
  I('t_chili', 'topping', '용기 뿜뿜 고추', ['다시 해 보기'], '조금 매워도 해 보면 "어, 되네?" 하는 순간이 와요.', { model: 'chili', color: '#D9412B', color2: '#6FA34A' }),
  I('t_tofu', 'topping', '몽글몽글 두부', ['쉼'], '지칠 땐 편한 자리에서 쉬어도 괜찮아요.', { model: 'tofu', color: '#FBF6EA' }),
  I('t_tteok', 'topping', '말랑 추억 떡', ['그리움 달래기'], '그리운 사람과 지낸 좋은 기억은 마음속에 계속 남아 있어요.', { model: 'tteok', color: '#F8F3EA', color2: '#F3B9C6' }),
  I('t_woodear', 'topping', '쫑긋 목이버섯', ['귀 기울이기'], '귀처럼 생긴 버섯처럼 친구 말에 귀를 쫑긋 세워요.', { model: 'woodear', color: '#4E3D35' }),
  I('t_sprout', 'topping', '걱정 먹는 숙주', ['걱정 줄이기'], '걱정은 누군가에게 말하면 반으로 줄어요.', { model: 'sprout', color: '#F6F1DA', color2: '#E3D27A' }),
  I('t_yubu', 'topping', '속마음 유부 주머니', ['마음 말하기'], '주머니에 담아 둔 속마음을 꺼내 말로 해 봐요.', { model: 'yubu', color: '#DDA350', color2: '#7DBA5A' }),
  I('t_sausage', 'topping', '엄지척 소시지', ['칭찬'], '잘한 점을 콕 집어 칭찬하면 마음에 오래 남아요.', { model: 'sausage', color: '#DA6D4F' }),
  I('t_quail', 'topping', '해냈다 메추리알', ['뿌듯함'], '작은 일이라도 끝까지 해낸 나를 칭찬해요.', { model: 'quail', color: '#C9A27A', color2: '#F7F0E2' }),
  I('t_potato', 'topping', '포슬포슬 감자', ['그리움 달래기', '눈물 닦기'], '포슬포슬 감자처럼 따뜻했던 기억을 떠올리면 눈물이 조금 마르기도 해요.', { model: 'potato', color: '#EBCB7A', color2: '#C9A15A' }),
  I('t_carrot', 'topping', '빙글빙글 당근 꽃', ['축하', '웃음'], '꽃 모양 당근처럼 친구의 좋은 일에 활짝 웃으며 축하해요.', { model: 'carrot', color: '#F08A3C', color2: '#F7B36B' }),
  I('t_broccoli', 'topping', '송이송이 브로콜리', ['소속감', '친구 되기'], '작은 송이가 모여 한 덩이가 되듯, 우리 반도 함께라서 든든해요.', { model: 'broccoli', color: '#5E9E46', color2: '#A9CF7E' }),
  I('t_cucumber', 'topping', '시원 오이채', ['화 식히기', '잠깐 멈춤'], '시원한 오이처럼, 화가 날 땐 잠깐 멈추고 열을 식혀요.', { model: 'cucumber', color: '#5E9C45', color2: '#E3F0C8' }),
  I('t_peas', 'topping', '알콩달콩 완두콩', ['좋은 점 찾기', '칭찬'], '콩알만 한 좋은 점이라도 찾아서 칭찬해 줘요.', { model: 'peas', color: '#8CC152' }),

  // 마무리 12
  I('f_sesame', 'finish', '칭찬 깨소금', ['칭찬', '자신감'], '"잘했어!" 칭찬은 마음을 고소하게 해요.', { model: 'sesame', color: '#F0DFB8' }, '학습지 9쪽: 칭찬 두 숟가락'),
  I('f_giggle', 'finish', '까르르 웃음', ['웃음'], '함께 웃으면 몸도 마음도 가벼워져요.', { model: 'giggle', color: '#F7C948' }, '학습지 9쪽: 웃음 한 국자'),
  I('f_pepper', 'finish', '숨 고르기 후추', ['깊은 숨', '화 식히기'], '"후~" 하고 숨을 고르면 화가 조금씩 작아져요.', { model: 'pepper', color: '#3B3431' }),
  I('f_oil', 'finish', '귀 기울임 참기름', ['귀 기울이기', '곁에 있기'], '끝까지 들어 주는 것만으로도 큰 힘이 돼요.', { model: 'oil', color: '#E3A93A' }),
  I('f_salt', 'finish', '괜찮아 소금', ['다시 해 보기', '눈물 닦기'], '실수해도 괜찮아요. 누구나 실수하면서 자라요.', { model: 'salt', color: '#FFFFFF' }),
  I('f_cheese', 'finish', '같이 먹자 치즈', ['소속감', '손 내밀기'], '"같이 하자"는 말은 외로운 마음을 녹여요.', { model: 'cheese', color: '#F7CF4A' }),
  I('f_gimflake', 'finish', '서로서로 김가루', ['좋은 점 찾기', '입장 바꾸기'], '서로의 좋은 점을 하나씩 말해 보면 미운 마음이 작아져요.', { model: 'gimflake', color: '#27321F' }),
  I('f_butter', 'finish', '꿀잠 버터', ['단잠', '느긋함'], '잠들기 전 좋았던 일 하나를 떠올리면 잠이 솔솔 와요.', { model: 'butter', color: '#F8E08A' }),
  I('f_stargim', 'finish', '반짝 별 김', ['설렘', '소중함'], '밤하늘 별처럼 나도 하나뿐인 소중한 사람이에요.', { model: 'stargim', color: '#2B3628', color2: '#F7D560' }),
  I('f_honey', 'finish', '사르르 꿀', ['용서', '포옹'], '꿀이 사르르 녹듯, 사과를 받아 주면 굳었던 마음도 녹아요.', { model: 'honey', color: '#F2B33D' }),
  I('f_chive', 'finish', '송송 쪽파', ['손 내밀기', '친구 되기'], '송송 썬 쪽파를 나눠 올리듯 "같이 할래?" 하고 먼저 다가가요.', { model: 'chive', color: '#6FAE4E' }),
  I('f_perilla', 'finish', '도란도란 들깨가루', ['입장 바꾸기', '느긋함'], '천천히 친구 자리에 서서 생각해 보면 마음이 고소해져요.', { model: 'perilla', color: '#B49A76' }),
];

export const ING = new Map(INGREDIENTS.map((i) => [i.id, i]));
export const STEPS: { id: Step; name: string; min: number; max: number; hint: string }[] = [
  { id: 'broth', name: '국물', min: 1, max: 1, hint: '라면의 바탕이 되는 국물을 하나 골라요.' },
  { id: 'noodle', name: '면', min: 1, max: 1, hint: '면을 하나 골라요.' },
  { id: 'soup', name: '스프', min: 1, max: 1, hint: '맛의 중심이 되는 스프를 하나 골라요.' },
  { id: 'topping', name: '건더기', min: 1, max: 3, hint: '건더기를 한 가지에서 세 가지까지 골라요.' },
  { id: 'finish', name: '마무리', min: 0, max: 2, hint: '마무리 조미료는 넣고 싶을 때만 골라요. 두 가지까지 넣고 양도 정할 수 있어요.' },
];
export const AMOUNTS = ['한 꼬집', '한 숟가락', '두 숟가락', '한 국자'] as const;
