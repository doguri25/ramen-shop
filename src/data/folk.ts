import type { ChibiSpec } from './types';

// 마음 골목 동네 주민: 가까이 가서 말을 걸면 세 가지 중 하나가 시작돼요
// feel: 오늘 마음을 듣고 대답 고르기 (알아주는 말을 고르면 마음 도장)
// chat: 인사와 짧은 이야기 (끝까지 들으면 마음 도장)
// errand: 작은 심부름 (가게에서 물건을 받아 가져다주면 마음 도장)
export type FolkMood = 'happy' | 'neutral' | 'sad' | 'worried' | 'angry';
export type ShopKind = 'bread' | 'flower' | 'pencil' | 'book' | 'icecream';
export interface FeelOpt { text: string; good: boolean; reply: string }
export interface Folk {
  id: string; name: string; spec: ChibiSpec;
  type: 'feel' | 'chat' | 'errand';
  hello: string;          // 처음 말을 걸면
  // feel
  feel?: { say: string; mood: FolkMood; opts: FeelOpt[]; after: string };
  // chat: 차례로 들려줘요
  chat?: string[];
  // errand
  errand?: { ask: string; shop: ShopKind; item: string; waiting: string; thanks: string };
  done: string;           // 도장을 받은 뒤 다시 말을 걸면
}

export const ITEM_DOODLE: Record<ShopKind, 'bread' | 'flower' | 'letter' | 'book' | 'icecream'> = { bread: 'bread', flower: 'flower', pencil: 'letter', book: 'book', icecream: 'icecream' };

export const FOLKS: Folk[] = [
  {
    id: 'f-sheep', name: '몽실', spec: { kind: 'sheep', fur: '#FBF7EF', fur2: '#F2E6D8', cloth: '#9FC6E0' }, type: 'feel',
    hello: '아, 사장님 안녕하세요…',
    feel: {
      say: '오늘 발표하다가 말이 막혀서 친구들이 웃었어요. 아직도 얼굴이 화끈거려요.', mood: 'sad',
      opts: [
        { text: '많이 창피했겠다. 그래도 끝까지 발표한 건 정말 멋졌어.', good: true, reply: '정말요? 그 말 들으니까 다음에 또 해 볼 용기가 나요!' },
        { text: '그런 걸로 뭘 그래. 별일 아니야.', good: false, reply: '음… 저한테는 별일이었는데요.' },
        { text: '다음부터는 실수하지 마.', good: false, reply: '저도 실수하고 싶지 않았어요…' },
      ],
      after: '창피했던 마음을 알아주니 몽실이 얼굴이 환해졌어요.',
    },
    done: '사장님 덕분에 다음 발표가 조금 기다려져요!',
  },
  {
    id: 'f-duck', name: '꽥순', spec: { kind: 'duck', fur: '#FFE27A', fur2: '#F6B04A', cloth: '#E98BA3' }, type: 'feel',
    hello: '흥! 사장님, 제 얘기 좀 들어 볼래요?',
    feel: {
      say: '동생이 제가 아끼던 그림에 낙서를 했어요. 너무 화가 나서 소리를 질렀어요.', mood: 'angry',
      opts: [
        { text: '소리 지르면 안 되지. 동생한테 사과해.', good: false, reply: '제 마음은 하나도 몰라주고…' },
        { text: '아끼던 그림이라 정말 속상하고 화났겠다.', good: true, reply: '맞아요, 속상했어요. 이제 좀 진정되니까 동생한테 차분히 말해 볼래요.' },
        { text: '그림은 또 그리면 되잖아.', good: false, reply: '그 그림은 하나뿐이었단 말이에요!' },
      ],
      after: '화난 마음 밑에 속상함이 있었네요. 꽥순이 숨을 크게 쉬었어요.',
    },
    done: '동생이랑 같이 새 그림을 그리기로 했어요. 히히.',
  },
  {
    id: 'f-hedgehog', name: '따끔이', spec: { kind: 'hedgehog', fur: '#B08A6A', fur2: '#F3E2CC', cloth: '#8DC26F' }, type: 'feel',
    hello: '저… 안녕하세요.',
    feel: {
      say: '새 반에 아직 친구가 없어요. 쉬는 시간이 너무 길게 느껴져요.', mood: 'worried',
      opts: [
        { text: '친구는 저절로 생겨. 걱정 마.', good: false, reply: '저절로요…? 그냥 기다리기만 하면 될까요…' },
        { text: '가시가 있어서 그런 거 아니야?', good: false, reply: '(따끔이가 고개를 푹 숙였어요.)' },
        { text: '혼자 있으면 쓸쓸했겠다. 내일 한 명에게 같이 놀자고 말해 볼래?', good: true, reply: '쓸쓸했던 거 맞아요. 내일 옆자리 친구한테 말 걸어 볼게요!' },
      ],
      after: '쓸쓸한 마음을 알아주고 작은 방법도 같이 찾았어요.',
    },
    done: '오늘 옆자리 친구랑 공기놀이 했어요!',
  },
  {
    id: 'f-frog', name: '폴짝이', spec: { kind: 'frog', fur: '#8DCB72', fur2: '#E9F5D6', cloth: '#F6CF3E' }, type: 'feel',
    hello: '개굴! 사장님, 저 떨려요.',
    feel: {
      say: '내일 줄넘기 시험이 있어요. 줄에 걸릴까 봐 가슴이 콩닥콩닥해요.', mood: 'worried',
      opts: [
        { text: '떨리는 건 잘하고 싶어서 그런 거야. 오늘 같이 연습해 볼까?', good: true, reply: '잘하고 싶어서 떨리는 거였구나! 같이 연습하면 덜 떨릴 것 같아요.' },
        { text: '개구리니까 당연히 잘하겠지.', good: false, reply: '개구리라고 다 잘하는 건 아니에요…' },
        { text: '시험은 원래 다 무서운 거야.', good: false, reply: '더 무서워졌어요…' },
      ],
      after: '떨리는 마음을 알아주고 함께하자는 말을 건넸어요.',
    },
    done: '어제 연습한 대로 했더니 쉰 번이나 넘었어요!',
  },
  {
    id: 'f-mouse', name: '쪼르', spec: { kind: 'mouse', fur: '#C9C2BA', fur2: '#F7E9E6', cloth: '#A68BD6' }, type: 'feel',
    hello: '사장님, 고민이 있어요.',
    feel: {
      say: '친구한테 심한 말을 해 버렸어요. 미안한데 뭐라고 해야 할지 모르겠어요.', mood: 'sad',
      opts: [
        { text: '친구가 먼저 말 걸 때까지 기다려.', good: false, reply: '그러다 영영 멀어지면 어떡해요…' },
        { text: '미안한 마음이 큰가 보다. "아까는 미안해"라고 먼저 말해 보면 어때?', good: true, reply: '미안한 마음을 그대로 말하면 되는 거네요. 지금 바로 가 볼게요!' },
        { text: '그 친구도 잘못했을 거야.', good: false, reply: '아니에요, 제가 잘못했어요.' },
      ],
      after: '미안한 마음을 용기 있게 전할 수 있게 도와주었어요.',
    },
    done: '친구가 사과를 받아 줬어요. 마음이 가벼워요!',
  },
  {
    id: 'f-deer', name: '사뿐', spec: { kind: 'deer', fur: '#C99366', fur2: '#F5E3CC', cloth: '#47AE7A' }, type: 'chat',
    hello: '안녕하세요, 라면 가게 사장님!',
    chat: ['오늘은 바람이 참 좋아요. 걷기 딱 좋은 날이에요.', '골목 끝 우물가에서 물소리를 들으면 마음이 차분해져요.', '불 켜진 집이 늘수록 골목이 환해져요. 사장님 덕분이에요.'],
    done: '또 만났네요! 오늘도 좋은 하루 보내요.',
  },
  {
    id: 'f-pig', name: '토실', spec: { kind: 'pig', fur: '#F6C3C8', fur2: '#FBE3E5', cloth: '#6FB3E0' }, type: 'chat',
    hello: '킁킁, 라면 냄새! 사장님이시죠?',
    chat: ['기분이 울적할 땐 따뜻한 국물이 최고예요.', '그런데 먹는 것만큼 좋은 게 있어요. 누가 내 얘기를 들어 주는 거요.', '사장님은 손님 얘기를 잘 들어 주시잖아요. 그래서 라면이 더 맛있나 봐요.'],
    done: '다음에 가게에 꼭 놀러 갈게요!',
  },
  {
    id: 'f-otter', name: '첨벙', spec: { kind: 'otter', fur: '#9A7458', fur2: '#E9D6C0', cloth: '#F0974A' }, type: 'chat',
    hello: '첨벙! 사장님, 냇가 좋아하세요?',
    chat: ['냇물은 다리로 건너야 해요. 미끄러우니까 천천히요.', '아까 냇물에서 반짝이는 돌을 주웠어요. 짠! 예쁘죠?', '좋은 걸 찾으면 친구한테 보여 주고 싶어져요. 그게 나눔인가 봐요.'],
    done: '오늘은 하트 모양 돌을 찾았어요!',
  },
  {
    id: 'f-chick', name: '삐약이', spec: { kind: 'chick', fur: '#FFE07A', fur2: '#FFF1BF', cloth: '#E3645A' }, type: 'chat',
    hello: '삐약! 안녕하세요!',
    chat: ['저 오늘 처음으로 혼자 심부름 했어요!', '처음엔 무서웠는데 해 보니까 할 수 있더라고요.', '사장님도 처음 라면 끓일 때 떨렸어요? 그래도 해냈죠? 우리 멋져요!'],
    done: '내일은 무슨 심부름을 해 볼까요? 삐약!',
  },
  {
    id: 'f-koala', name: '졸졸이', spec: { kind: 'koala', fur: '#B9B6B2', fur2: '#ECE8E4', cloth: '#E9B92A' }, type: 'chat',
    hello: '하암… 사장님 안녕…',
    chat: ['어젯밤에 늦게 자서 아직 졸려요.', '피곤하면 괜히 짜증이 나요. 몸이 힘들면 마음도 힘든가 봐요.', '오늘은 일찍 자야겠어요. 사장님도 푹 자요.'],
    done: '어제 일찍 잤더니 개운해요!',
  },
  {
    id: 'f-rabbit', name: '깡총이', spec: { kind: 'rabbit', fur: '#FFFFFF', fur2: '#F7D6DC', cloth: '#E98BA3' }, type: 'errand',
    hello: '사장님! 부탁이 하나 있어요.',
    errand: { ask: '할머니께 빵을 가져다드리고 싶은데 다리를 다쳤어요. 폭신 빵집에서 빵 하나만 받아다 줄래요?', shop: 'bread', item: '빵', waiting: '폭신 빵집은 큰길 가에 있어요. 분홍 줄무늬 차양이에요!', thanks: '와, 고마워요! 할머니가 정말 좋아하실 거예요.' },
    done: '할머니가 사장님한테 고맙다고 전해 달래요!',
  },
  {
    id: 'f-cat', name: '나비', spec: { kind: 'cat', fur: '#F2B880', fur2: '#FFF1E0', mark: '#D9874A', cloth: '#47AE7A' }, type: 'errand',
    hello: '사장님, 잠깐만요!',
    errand: { ask: '어제 다툰 친구랑 화해하고 싶어요. 방긋 꽃집에서 꽃 한 송이 받아다 줄래요?', shop: 'flower', item: '꽃', waiting: '방긋 꽃집은 초록 줄무늬 차양이에요.', thanks: '고마워요! 이 꽃이랑 같이 미안하다고 말할게요.' },
    done: '친구랑 화해했어요! 꽃을 보고 웃어 줬어요.',
  },
  {
    id: 'f-dog', name: '멍순이', spec: { kind: 'dog', fur: '#E8C9A0', fur2: '#FFF4E6', mark: '#B98A5E', cloth: '#6FB3E0' }, type: 'errand',
    hello: '멍! 사장님, 도와줄 수 있어요?',
    errand: { ask: '선생님께 고맙다는 편지를 쓰고 싶은데 편지지가 없어요. 알록 문구점에서 편지지 좀 받아다 줄래요?', shop: 'pencil', item: '편지지', waiting: '알록 문구점은 파란 줄무늬 차양이에요.', thanks: '고마워요! 정성껏 써서 내일 드릴 거예요.' },
    done: '선생님이 편지 읽고 안아 주셨어요!',
  },
  {
    id: 'f-bear', name: '뭉치', spec: { kind: 'bear', fur: '#A9805E', fur2: '#E8D3BC', cloth: '#E3645A' }, type: 'errand',
    hello: '사장님… 저 부탁 하나만요.',
    errand: { ask: '요즘 마음이 자꾸 답답해요. 소곤 책방에 마음을 다루는 책이 있대요. 한 권 받아다 줄래요?', shop: 'book', item: '마음 책', waiting: '소곤 책방은 보라 줄무늬 차양이에요.', thanks: '고마워요. 천천히 읽으면서 내 마음을 들여다볼래요.' },
    done: '책에서 숨 고르는 법을 배웠어요. 후— 하— 해 봐요!',
  },
  {
    id: 'f-penguin', name: '뒤뚱이', spec: { kind: 'penguin', fur: '#3E4A5C', fur2: '#FFFFFF', cloth: '#F0974A' }, type: 'errand',
    hello: '아이고 더워라… 사장님!',
    errand: { ask: '더워서 머리가 지끈지끈해요. 사르르 아이스크림 가게에서 아이스크림 하나 받아다 줄래요?', shop: 'icecream', item: '아이스크림', waiting: '사르르 아이스크림은 지붕에 커다란 아이스크림이 있어요.', thanks: '시원하다! 고마워요. 이제 기분도 사르르 풀려요.' },
    done: '시원한 거 먹고 나니까 다시 힘이 나요!',
  },
];

export const FOLK_STAMPS = FOLKS.length;
