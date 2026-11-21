import type { FeelOpt, ShopKind } from './folk';

// 마음 골목 '이어지는 미션': 주민 미션을 끝내면 열려요
// chain(이어지는 심부름): 받은 주민이 다음 부탁을 이어 가요. 세 번 건네면 끝
// mood(마음 모으기): 같은 마음을 겪은 세 주민을 모두 도우면, 셋이 모임을 만들어요
// festival(동네 잔치): 마음 도장을 많이 모으면 악단장이 잔치를 열어요
export interface QTask {
  get?: ShopKind[];   // 가게에서 받아 올 것 (없으면 앞 주민에게 받은 것을 그대로 전해요)
  item: string;       // 들고 가는 물건 이름
  to: string;         // 건넬 주민 id ('group'이면 모임에 모인 주민 아무에게나)
  say: string;        // 건네받은 주민이 하는 말 (다음 부탁이 이어지면 여기서 말해요)
}
export interface Quest {
  id: string; kind: 'chain' | 'mood' | 'festival'; title: string;
  need: string[];         // 먼저 마음 도장을 받아야 하는 주민
  needStamps?: number;    // 잔치: 마음 도장이 이만큼 모이면 열려요
  giver: string;          // 미션을 주는 주민
  ask: string;            // 처음 부탁
  tasks: QTask[];
  hint: string;           // 잠겨 있을 때 수첩에 보이는 말
  end: string;            // 끝났을 때
  group?: string[];       // 마음 모으기: 모이는 세 주민
  meet?: string[];        // 마음 모으기: 모임에서 차례로 하는 말 ('id|말')
  question?: { say: string; opts: FeelOpt[] };
}

export const QUESTS: Quest[] = [
  // ── 이어지는 심부름 ──
  {
    id: 'q-thanks', kind: 'chain', title: '고마움 릴레이',
    need: ['f-dog', 'f-chick'], giver: 'f-dog',
    hint: '멍순이 심부름과 삐약이 이야기를 끝내면 열려요.',
    ask: '선생님이 편지 답장을 주셨어요! 고마운 마음은 이어 줄수록 커진대요. 알록 문구점에서 고마움 카드를 받아다 삐약이에게 줄래요?',
    tasks: [
      { get: ['pencil'], item: '고마움 카드', to: 'f-chick', say: '우와, 카드다! 저도 처음 심부름할 때 도와준 뒤뚱이한테 고맙다고 쓸래요. …다 썼어요! 뒤뚱이에게 전해 줄래요?' },
      { item: '삐약이의 카드', to: 'f-penguin', say: '나한테 고맙다고? 헤헤, 기분 좋다! 나도 이 마음을 이어 갈래요. 사르르 아이스크림에서 아이스크림을 받아다 멍순이에게 주세요!' },
      { get: ['icecream'], item: '아이스크림', to: 'f-dog', say: '저한테요? 제가 시작한 고마움이 한 바퀴 돌아서 다시 왔네요! 고마워요, 사장님.' },
    ],
    end: '고마움 릴레이가 한 바퀴를 돌았어요!',
  },
  {
    id: 'q-sorry', kind: 'chain', title: '화해 릴레이',
    need: ['f-cat', 'f-mouse'], giver: 'f-cat',
    hint: '나비 심부름과 쪼르의 마음 이야기를 끝내면 열려요.',
    ask: '쪼르도 친구랑 화해했대요! 화해한 기념으로 방긋 꽃집에서 꽃 한 송이 받아다 쪼르에게 전해 줄래요?',
    tasks: [
      { get: ['flower'], item: '화해 꽃', to: 'f-mouse', say: '고마워요! 사실 저, 꽥순이한테도 미안한 게 있어요. 제가 쓴 사과 쪽지를 꽥순이에게 전해 줄래요?' },
      { item: '쪼르의 사과 쪽지', to: 'f-duck', say: '쪼르가…? 나도 미안했는데! 폭신 빵집에서 빵을 받아다 쪼르에게 줄래요? 같이 나눠 먹자고요.' },
      { get: ['bread'], item: '나눠 먹을 빵', to: 'f-mouse', say: '꽥순이가 이걸요? 우리 이제 다 화해했어요! 나비, 꽥순이랑 셋이 같이 먹을래요.' },
    ],
    end: '화해 릴레이로 세 친구가 다시 웃게 됐어요!',
  },
  {
    id: 'q-cheer', kind: 'chain', title: '응원 릴레이',
    need: ['f-frog', 'f-bear'], giver: 'f-bear',
    hint: '폴짝이의 마음 이야기와 뭉치 심부름을 끝내면 열려요.',
    ask: '책에서 응원하는 법을 배웠어요. 폴짝이가 줄넘기 대회에 나간대요! 딩동 악기점에서 응원 나팔을 받아다 폴짝이에게 줄래요?',
    tasks: [
      { get: ['music'], item: '응원 나팔', to: 'f-frog', say: '빠라밤! 힘이 나요! 따끔이도 내일 발표가 있대요. 제가 만든 응원 깃발을 따끔이에게 전해 줘요.' },
      { item: '응원 깃발', to: 'f-hedgehog', say: '저를 응원해 준다고요? 떨리던 마음이 조금 작아졌어요. 처음 응원을 시작한 뭉치에게 새콤 과일가게 과일 바구니를 전해 주세요!' },
      { get: ['fruit'], item: '과일 바구니', to: 'f-bear', say: '제가 보낸 응원이 돌고 돌아 저한테 왔네요. 응원은 받는 것도 주는 것도 다 좋아요!' },
    ],
    end: '응원 릴레이로 모두 힘이 났어요!',
  },
  {
    id: 'q-share', kind: 'chain', title: '나눔 릴레이',
    need: ['f-otter', 'f-rabbit'], giver: 'f-otter',
    hint: '첨벙이 이야기와 깡총이 심부름을 끝내면 열려요.',
    ask: '반짝이 돌을 나누니까 정말 기분이 좋았어요. 이번엔 깡총이 할머니께 차를 선물하고 싶어요. 포근 찻집에서 따뜻한 차를 받아다 깡총이에게 줘요!',
    tasks: [
      { get: ['tea'], item: '따뜻한 차', to: 'f-rabbit', say: '할머니가 정말 좋아하실 거예요! 할머니가 구운 쿠키를 졸졸이에게 나눠 주래요. 요즘 피곤하대서요.' },
      { item: '할머니 쿠키', to: 'f-koala', say: '하암… 쿠키 고마워요. 덕분에 기운이 나요. 저도 나누고 싶어요. 소곤 책방에서 냇물 이야기책을 받아다 첨벙이에게 줄래요?' },
      { get: ['book'], item: '냇물 이야기책', to: 'f-otter', say: '제가 시작한 나눔이 이렇게 돌아왔네요! 나누면 줄어드는 게 아니라 더 커져요.' },
    ],
    end: '나눔 릴레이로 마음이 골목을 한 바퀴 돌았어요!',
  },
  // ── 마음 모으기 ──
  {
    id: 'q-sad', kind: 'mood', title: '토닥 모임',
    need: ['f-sheep', 'f-mouse', 'f-alpaca'], giver: 'f-sheep', group: ['f-sheep', 'f-mouse', 'f-alpaca'],
    hint: '슬펐던 세 친구(몽실·쪼르·몽글)의 마음을 모두 알아주면 열려요.',
    ask: '사장님, 우리 셋은 다 슬펐던 적이 있잖아요. 그래서 슬픈 친구를 위로하는 "토닥 모임"을 만들었어요! 광장에 모여 있을게요. 폭신 빵집에서 따뜻한 빵을 받아다 줄래요?',
    tasks: [{ get: ['bread'], item: '따뜻한 빵', to: 'group', say: '빵이 따끈따끈해요! 이제 모임을 시작할게요.' }],
    meet: ['f-sheep|저는 발표하다 실수했을 때 슬펐어요.', 'f-mouse|저는 친구한테 심한 말을 하고 슬펐어요.', 'f-alpaca|저는 할머니가 보고 싶어서 슬펐어요.'],
    question: {
      say: '우리 모임에서 슬픈 친구한테 어떻게 해 주면 좋을까요?',
      opts: [
        { text: '빨리 울음을 그치라고 말해 줘요.', good: false, reply: '그러면 마음을 숨기게 될 것 같아요…' },
        { text: '울어도 괜찮다고 말하고, 옆에 있어 줘요.', good: true, reply: '맞아요! 우리가 그렇게 위로받았잖아요.' },
        { text: '슬픈 일은 얼른 잊으라고 해요.', good: false, reply: '잊으려고 해도 잘 안 잊혀요…' },
      ],
    },
    end: '토닥 모임이 생겼어요! 이제 슬픈 친구 곁엔 세 친구가 있어요.',
  },
  {
    id: 'q-worry', kind: 'mood', title: '걱정 상자',
    need: ['f-hedgehog', 'f-frog', 'f-hamster'], giver: 'f-frog', group: ['f-hedgehog', 'f-frog', 'f-hamster'],
    hint: '걱정 많던 세 친구(따끔이·폴짝이·도토리)의 마음을 모두 알아주면 열려요.',
    ask: '사장님! 걱정쟁이 셋이 모여서 "걱정 상자"를 만들기로 했어요. 걱정을 종이에 써서 넣는 상자예요. 알록 문구점에서 종이와 연필을 받아다 광장으로 와 줄래요?',
    tasks: [{ get: ['pencil'], item: '종이와 연필', to: 'group', say: '고마워요! 이제 걱정을 하나씩 써 볼게요.' }],
    meet: ['f-hedgehog|"친구가 안 생기면 어떡하지?"라고 썼어요.', 'f-frog|"줄에 걸리면 어떡하지?"라고 썼어요.', 'f-hamster|"버스를 잘못 내리면 어떡하지?"라고 썼어요.'],
    question: {
      say: '걱정을 상자에 넣었어요. 이제 무엇을 하면 좋을까요?',
      opts: [
        { text: '걱정마다 내가 할 수 있는 일을 하나씩 찾아봐요.', good: true, reply: '좋아요! 인사하기, 연습하기, 정류장 이름 적기! 할 수 있는 게 생겼어요.' },
        { text: '걱정은 혼자 꾹 참아요.', good: false, reply: '혼자 참으면 걱정이 더 커질 것 같아요…' },
        { text: '걱정되는 일은 아예 안 해요.', good: false, reply: '그래도 해 보고 싶은 일인데요…' },
      ],
    },
    end: '걱정 상자를 만들었어요! 걱정이 줄고 할 일이 생겼어요.',
  },
  {
    id: 'q-angry', kind: 'mood', title: '화 식히기 연습',
    need: ['f-duck', 'f-goat', 'f-fox'], giver: 'f-duck', group: ['f-duck', 'f-goat', 'f-fox'],
    hint: '화났던 세 친구(꽥순·뿔뿔이·여울)의 마음을 모두 알아주면 열려요.',
    ask: '사장님, 우리 화났던 셋이 모여서 "화 식히기 연습"을 하기로 했어요! 연습 끝나고 먹을 시원한 아이스크림을 받아다 광장으로 와 줄래요?',
    tasks: [{ get: ['icecream'], item: '시원한 아이스크림', to: 'group', say: '시원하다! 그럼 연습을 시작해요.' }],
    meet: ['f-duck|저는 동생이 그림에 낙서해서 화났어요.', 'f-goat|저는 친구가 새치기해서 화났어요.', 'f-fox|저는 게임에 지고 놀림받아서 화났어요.'],
    question: {
      say: '화가 확 치밀 때 가장 먼저 할 일은 뭘까요?',
      opts: [
        { text: '바로 소리를 크게 질러요.', good: false, reply: '그러면 더 큰 싸움이 될 것 같아요.' },
        { text: '물건을 던져서 화를 풀어요.', good: false, reply: '누가 다칠 수도 있어요!' },
        { text: '"잠깐!" 하고 멈춘 뒤, 다섯까지 세며 숨을 쉬어요.', good: true, reply: '하나, 둘, 셋, 넷, 다섯… 후~ 진짜 화가 식어요!' },
      ],
    },
    end: '화 식히기 연습 끝! 셋이 "잠깐, 다섯 세기" 약속을 했어요.',
  },
  // ── 동네 잔치 ──
  {
    id: 'q-festival', kind: 'festival', title: '동네 잔치',
    need: [], needStamps: 20, giver: 'f-parrot',
    hint: '마음 도장을 20개 모으면 앵무 악단장이 잔치를 열어요.',
    ask: '사장님 덕분에 동네가 정말 따뜻해졌어요! 드디어 동네 잔치를 열 거예요. 빵, 꽃, 과일, 차를 하나씩 받아다 저에게 가져와 줄래요? 잔치는 시장 거리 광장에서 해요!',
    tasks: [{ get: ['bread', 'flower', 'fruit', 'tea'], item: '잔치 준비물', to: 'f-parrot', say: '다 모였어요! 자, 동네 친구들! 광장으로 모여요! 잔치를 시작합니다!' }],
    end: '동네 잔치를 열었어요! 마음 골목 모두가 함께 웃었어요.',
  },
];
export const QUEST = new Map(QUESTS.map((q) => [q.id, q]));
