import { CRAFT, type CraftKind } from './craft';
import type { VegKind } from './garden';
import type { ChibiSpec, Family } from './types';

// 마음 골목 동네 주민: 가까이 가서 말을 걸면 세 가지 중 하나가 시작돼요
// feel: 오늘 마음을 듣고 대답 고르기 (알아주는 말을 고르면 마음 도장)
// chat: 인사와 짧은 이야기 (끝까지 들으면 마음 도장)
// errand: 작은 심부름 (가게에서 물건을 받아 가져다주면 마음 도장)
// garden: 텃밭 심부름 (마음이 안 좋아 요리를 하려는 주민에게 마음이 맞는 채소를 뽑아다 주면 마음 도장)
// lost: 잃어버린 물건 찾기 · escort: 같이 가 주기 · carry: 짐 같이 나르기 · relay: 다툰 친구 사이 마음 전하기 · invite: 혼자 있는 친구를 놀이에
export type FolkMood = 'happy' | 'neutral' | 'sad' | 'worried' | 'angry';
export type ShopKind = 'bread' | 'flower' | 'pencil' | 'book' | 'icecream' | 'tea' | 'fruit' | 'music';
export interface FeelOpt { text: string; good: boolean; reply: string }
export type LostItem = 'hat' | 'key' | 'book' | 'doll';
export const LOST_NAME: Record<LostItem, string> = { hat: '털모자', key: '열쇠', book: '그림 공책', doll: '곰 인형' };
export type GoDest = { kind: 'plaza' } | { kind: 'ramen' } | { kind: 'store'; store: ShopKind } | { kind: 'town'; town: number } | { kind: 'play' };
export interface Folk {
  id: string; name: string; spec: ChibiSpec;
  type: 'feel' | 'chat' | 'errand' | 'shop' | 'garden' | 'lost' | 'escort' | 'carry' | 'relay' | 'invite';
  hello: string;          // 처음 말을 걸면
  // feel
  feel?: { say: string; mood: FolkMood; opts: FeelOpt[]; after: string };
  // chat: 차례로 들려줘요
  chat?: string[];
  // errand
  errand?: { ask: string; shop: ShopKind; item: string; waiting: string; thanks: string };
  // garden: 어떤 채소의 어떤 마음이 필요한지. hint는 다른 마음 채소를 가져왔을 때 다시 들려주는 지금 마음
  garden?: { veg: VegKind; fam: Family; ask: string; hint: string; thanks: string };
  // lost: 잃어버린 물건. spot은 마을 번호(그 마을 골목 끝 우물·큰 나무 근처에 떨어져 있어요). ask의 {place}에 단서 자리가 들어가요.
  // back: 찾아다 주면 고르는 말 (속상했던 마음을 알아주는 말)
  lost?: { item: LostItem; spot: number; ask: string; back: { say: string; opts: FeelOpt[] } };
  // escort·carry·invite: 함께 걸어가요. 가는 길 중간에 한 번 마음을 알아주는 말을 골라요. ask의 {dest}에 갈 곳 이름이 들어가요
  go?: { to: GoDest; ask: string; yes: string; mid: { say: string; opts: FeelOpt[] }; arrive: string };
  // invite: 놀고 있는 두 주민에게 건넬 말과, 끼게 된 뒤 고마워하는 말
  invite?: { group: [string, string]; play: string; opts: FeelOpt[]; join: string };
  // relay: 마음 전해 주기. 속상한 쪽(A)이 relay를, 상대(B)는 relayOf로 A를 가리켜요
  relay?: { partner: string; ask: string; toB: { say: string; opts: FeelOpt[] }; back: string };
  relayOf?: string;
  // shop: 가게 주인. 잠깐 자리를 비우는 동안 가게를 봐 달라고 해요 (몇 번이든 다시 할 수 있어요)
  sit?: { kind: CraftKind; ask: string; again: string };
  // 가게 앞에 서 있는 주인 (봐 주기가 없는 가게 주인도 자기 가게 앞에 있어요)
  stand?: ShopKind;
  done: string;           // 도장을 받은 뒤 다시 말을 걸면
}

export const ITEM_DOODLE: Record<ShopKind, 'bread' | 'flower' | 'letter' | 'book' | 'icecream' | 'tea' | 'fruit' | 'music'> = { bread: 'bread', flower: 'flower', pencil: 'letter', book: 'book', icecream: 'icecream', tea: 'tea', fruit: 'fruit', music: 'music' };

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

// 가게 주인 둘: 가게 앞에 서 있어요
FOLKS.push(
  {
    id: 'f-baker', name: CRAFT.bread.owner.name, spec: CRAFT.bread.owner.spec, type: 'shop',
    hello: '어서 와요, 라면 가게 사장님! 마침 잘 왔어요.',
    sit: { kind: 'bread', ask: '이웃 마을에 빵 배달을 잠깐 다녀와야 하는데, 그동안 폭신 빵집 좀 봐 줄래요? 손님 세 분만 맞아 주면 돼요. 손님 이야기를 듣고 재료를 골라 굽는 건 라면이랑 똑같아요!', again: '지난번엔 정말 고마웠어요! 오늘도 배달 다녀오는 동안 가게 좀 봐 줄래요?' },
    done: '',
  },
  {
    id: 'f-florist', name: CRAFT.flower.owner.name, spec: CRAFT.flower.owner.spec, type: 'shop',
    hello: '안녕하세요, 라면 가게 사장님! 부탁이 있어요.',
    sit: { kind: 'flower', ask: '꽃시장에 새 꽃을 받으러 잠깐 다녀와야 해요. 그동안 방긋 꽃집 좀 봐 줄래요? 손님 세 분께 마음에 꼭 맞는 꽃다발을 만들어 주면 돼요. 라면 끓이는 것처럼 하나씩 고르면 돼요!', again: '지난번에 가게를 봐 줘서 손님들이 정말 좋아했대요. 오늘도 부탁해도 될까요?' },
    done: '',
  },
);

// 새 이웃들 (마음 골목을 넓히며 이사 왔어요)
FOLKS.push(
  {
    id: 'f-alpaca', name: '몽글', spec: { kind: 'alpaca', fur: '#F4EBDD', fur2: '#FFF8EE', cloth: '#E98BA3' }, type: 'feel',
    hello: '사장님… 안녕하세요.',
    feel: {
      say: '할머니가 먼 곳으로 이사를 가셨어요. 할머니 생각만 하면 눈물이 나요.', mood: 'sad',
      opts: [
        { text: '다 컸는데 울면 안 되지.', good: false, reply: '울면 안 되는 거예요…?' },
        { text: '할머니가 많이 보고 싶구나. 할머니랑 좋았던 일 하나 얘기해 줄래?', good: true, reply: '할머니랑 같이 만두를 빚었던 날이요! 얘기하니까 마음이 따뜻해져요.' },
        { text: '전화하면 되잖아. 별거 아니야.', good: false, reply: '전화로는 안아 줄 수가 없잖아요…' },
      ],
      after: '그리운 마음을 알아주고 좋은 기억을 함께 떠올렸어요.',
    },
    done: '할머니랑 영상 통화 하면서 만두 얘기를 했어요!',
  },
  {
    id: 'f-hamster', name: '도토리', spec: { kind: 'hamster', fur: '#F2C28B', fur2: '#FFF4E2', cloth: '#6FB3E0' }, type: 'feel',
    hello: '사장님, 저 좀 떨려요.',
    feel: {
      say: '내일 처음으로 혼자 버스를 타요. 내릴 곳을 놓칠까 봐 자꾸 걱정돼요.', mood: 'worried',
      opts: [
        { text: '처음이라 걱정되는구나. 내릴 정류장 이름을 같이 적어 볼까?', good: true, reply: '맞아요, 처음이라 그래요! 적어 두면 덜 떨릴 것 같아요.' },
        { text: '버스는 쉬워. 그냥 타면 돼.', good: false, reply: '저한테는 안 쉬운데요…' },
        { text: '그럼 타지 마.', good: false, reply: '그래도 해 보고 싶었는데…' },
      ],
      after: '걱정을 알아주고 할 수 있는 방법을 함께 찾았어요.',
    },
    done: '정류장 이름을 손바닥에 적어 갔더니 딱 맞게 내렸어요!',
  },
  {
    id: 'f-goat', name: '뿔뿔이', spec: { kind: 'goat', fur: '#F3EFE8', fur2: '#FFFFFF', cloth: '#E9B92A' }, type: 'feel',
    hello: '음매! 사장님, 저 억울해요!',
    feel: {
      say: '급식 줄에 먼저 서 있었는데 친구가 새치기했어요! 너무 억울해서 뿔이 날 것 같아요.', mood: 'angry',
      opts: [
        { text: '뿔로 콱 들이받아!', good: false, reply: '그러면… 더 큰일 날 것 같아요.' },
        { text: '그냥 양보해. 줄이 뭐 대수라고.', good: false, reply: '저는 먼저 왔단 말이에요!' },
        { text: '먼저 서 있었는데 억울했겠다. "내가 먼저 서 있었어"라고 말해 보면 어때?', good: true, reply: '억울했던 거 맞아요! 소리 지르지 않고 말로 해 볼게요.' },
      ],
      after: '억울한 마음을 알아주고 말로 전하는 방법을 찾았어요.',
    },
    done: '"내가 먼저였어"라고 했더니 친구가 미안하다고 했어요.',
  },
  {
    id: 'f-fox', name: '여울', spec: { kind: 'fox', fur: '#E8894A', fur2: '#FFF3E6', cloth: '#6FB3E0' }, type: 'feel',
    hello: '하… 사장님, 저 지금 화나요.',
    feel: {
      say: '보드게임에서 졌는데 친구가 막 놀렸어요. 화가 나서 판을 엎을 뻔했어요.', mood: 'angry',
      opts: [
        { text: '지고 놀림까지 받아서 화났겠다. 엎기 전에 멈춘 건 정말 대단해.', good: true, reply: '멈춘 걸 알아주시네요! 다음엔 "놀리지 마" 하고 말할래요.' },
        { text: '다음엔 네가 더 크게 놀려 줘.', good: false, reply: '그러면 또 싸울 것 같아요…' },
        { text: '게임에서 지면 그럴 수도 있지.', good: false, reply: '저는 놀린 게 속상했단 말이에요.' },
      ],
      after: '화난 마음을 알아주고, 잠깐 멈춘 걸 칭찬했어요.',
    },
    done: '이번엔 져도 "다음엔 이길 거야!" 하고 웃었어요.',
  },
  {
    id: 'f-giraffe', name: '목도리', spec: { kind: 'giraffe', fur: '#F2C66B', fur2: '#FFF1CC', mark: '#B8763E', cloth: '#47AE7A' }, type: 'chat',
    hello: '안녕하세요! 저 이번에 이사 온 키다리 목도리예요.',
    chat: ['처음 이사 왔을 땐 아는 이웃이 하나도 없었어요.', '목만 쭉 빼고 두리번두리번… 조금 쓸쓸했어요.', '그런데 먼저 인사해 준 이웃 덕분에 이제 여기가 진짜 우리 동네 같아요.'],
    done: '오늘은 제가 먼저 새로 온 친구한테 인사했어요!',
  },
  {
    id: 'f-turtle', name: '느릿이', spec: { kind: 'turtle', fur: '#9CCB7A', fur2: '#E9F2C9', cloth: '#E98BA3' }, type: 'chat',
    hello: '안… 녕… 하세요… 헤헤, 저 느리죠?',
    chat: ['저는 뭐든지 조금 느려요.', '예전엔 빨리 못 해서 속상했는데, 천천히 하면 꼼꼼하게 할 수 있더라고요.', '사람마다 빠르기가 달라요. 내 빠르기도 괜찮아요.'],
    done: '천천히 걸으니까 길가 꽃이 더 잘 보여요.',
  },
  {
    id: 'f-panda', name: '콩이', spec: { kind: 'panda', fur: '#FFFFFF', fur2: '#FFFFFF', cloth: '#E3645A' }, type: 'errand',
    hello: '사장님! 부탁 하나 해도 돼요?',
    errand: { ask: '엄마가 감기에 걸려서 기운이 없어요. 포근 찻집에서 따뜻한 차 한 잔 받아다 줄래요?', shop: 'tea', item: '따뜻한 차', waiting: '포근 찻집은 시장 거리에 있어요. 갈색 줄무늬 차양이에요!', thanks: '고마워요! 엄마가 이거 마시면 금방 기운 나실 거예요.' },
    done: '엄마가 다 나아서 같이 산책 나왔어요!',
  },
  {
    id: 'f-elephant', name: '코코', spec: { kind: 'elephant', fur: '#B7BCC6', fur2: '#E8EAF0', cloth: '#F6CF3E' }, type: 'errand',
    hello: '뿌우! 사장님, 도와줄 수 있어요?',
    errand: { ask: '친구 생일 잔치에 과일을 가져가기로 했어요. 새콤 과일가게에서 과일 바구니 받아다 줄래요?', shop: 'fruit', item: '과일 바구니', waiting: '새콤 과일가게는 시장 거리에 있어요. 빨강 줄무늬 차양이에요!', thanks: '고마워요! 친구가 정말 좋아할 거예요.' },
    done: '생일 잔치에서 과일을 다 같이 나눠 먹었어요!',
  },
  {
    id: 'f-badger', name: '도담', spec: { kind: 'badger', fur: '#8E8A86', fur2: '#F2EFEA', mark: '#3E3A39', cloth: '#A68BD6' }, type: 'errand',
    hello: '사장님, 잠깐만요!',
    errand: { ask: '동생이 자꾸 울어서 달래 주고 싶어요. 딩동 악기점에서 작은 딸랑이 받아다 줄래요?', shop: 'music', item: '딸랑이', waiting: '딩동 악기점은 시장 거리 광장 옆이에요. 노란 줄무늬 차양이에요!', thanks: '고마워요! 딸랑딸랑 흔들어 주면 동생이 웃을 거예요.' },
    done: '동생이 딸랑이 소리에 까르르 웃었어요!',
  },
);
// 새 가게 주인들: 잠깐 자리를 비우는 동안 '미니 가게 봐 주기'를 부탁해요 (손님 한 분)
FOLKS.push(
  {
    id: 'f-seal', name: CRAFT.icecream.owner.name, spec: CRAFT.icecream.owner.spec, type: 'shop',
    hello: '어서 와요! 마침 딱 좋을 때 왔네요.',
    sit: { kind: 'icecream', ask: '아이스크림 재료가 떨어져서 잠깐 사 와야 해요. 손님 한 분만 맞아 줄래요? 그릇, 맛, 토핑을 하나씩 골라 드리면 돼요!', again: '또 와 줬네요! 오늘도 손님 한 분만 부탁해요.' },
    done: '',
  },
  {
    id: 'f-quokka', name: CRAFT.pencil.owner.name, spec: CRAFT.pencil.owner.spec, type: 'shop',
    hello: '안녕하세요! 방실방실, 부탁이 있어요.',
    sit: { kind: 'pencil', ask: '창고에 종이 상자를 가지러 다녀올게요. 손님 한 분께 마음을 담은 편지 세트를 골라 드려요. 편지지, 펜, 스티커를 하나씩!', again: '지난번 손님이 편지 세트가 정말 좋았대요! 오늘도 봐 줄래요?' },
    done: '',
  },
  {
    id: 'f-owl', name: CRAFT.book.owner.name, spec: CRAFT.book.owner.spec, type: 'shop',
    hello: '부엉, 어서 와요. 조용히 부탁 하나 할게요.',
    sit: { kind: 'book', ask: '이웃 마을에 책 배달을 다녀와야 해요. 손님 한 분께 마음에 맞는 책을 골라 드려요. 책, 책갈피, 책 싸개를 하나씩 고르면 돼요.', again: '책방을 또 봐 줄래요? 손님들이 사장님 고른 책을 좋아해요.' },
    done: '',
  },
  {
    id: 'f-capybara', name: CRAFT.tea.owner.name, spec: CRAFT.tea.owner.spec, type: 'shop',
    hello: '어서 와요… 천천히, 느긋하게요.',
    sit: { kind: 'tea', ask: '뒷산에 찻잎을 따러 잠깐 다녀올게요. 손님 한 분께 차 한 상을 차려 드려요. 찻잔, 차, 곁들일 간식을 하나씩 고르면 돼요.', again: '오늘도 찻집을 잠깐 부탁해도 될까요? 느긋하게 하면 돼요.' },
    done: '',
  },
  {
    id: 'f-hippo', name: CRAFT.fruit.owner.name, spec: CRAFT.fruit.owner.spec, type: 'shop',
    hello: '어머, 라면 가게 사장님! 잘 왔어요.',
    sit: { kind: 'fruit', ask: '과수원에 과일을 받으러 다녀올게요. 손님 한 분께 과일 바구니를 꾸며 드려요. 바구니, 과일, 곁들일 것을 하나씩!', again: '과일 바구니가 인기 만점이었어요! 오늘도 부탁해요.' },
    done: '',
  },
  {
    id: 'f-parrot', name: '앵무 악단장', spec: { kind: 'parrot', fur: '#4CB878', fur2: '#F6D046', cloth: '#E3645A' }, type: 'chat', stand: 'music',
    hello: '딩동딩동! 어서 와요, 라면 가게 사장님!',
    chat: ['저는 딩동 악기점 주인이자 우리 마을 악단장이에요.', '기쁠 땐 쿵쿵 큰북, 슬플 땐 잔잔한 피아노… 음악에도 마음이 담겨 있어요.', '언젠가 온 동네가 함께하는 잔치를 열고 싶어요. 사장님이 이웃을 많이 도와주면 그날이 올 거예요!'],
    done: '잔치 날을 기다리며 매일 연습해요. 딩동!',
  },
);

// 텃밭 이웃 넷: 마음이 안 좋아서 요리를 하려고 해요. 마음 텃밭에서 채소를 뽑아다 달라고 부탁해요
FOLKS.push(
  {
    id: 'f-mole', name: '꼼지', spec: { kind: 'mole', fur: '#6E5A52', fur2: '#F2C9C2', cloth: '#8DC26F' }, type: 'garden',
    hello: '사장님, 안녕하세요… 저 고민이 있어요.',
    garden: {
      veg: 'radish', fam: 'reconcile',
      ask: '어제 동생이랑 장난감 때문에 크게 다퉜어요. 화는 다 풀렸는데 미안하다는 말이 안 나와요. 동생이랑 같이 먹을 뭇국을 끓이면서 먼저 말해 보려고요. 마음 텃밭에서 무 하나만 뽑아다 줄래요?',
      hint: '저는 동생한테 미안하다고 말하고, 다시 사이좋게 지내고 싶어요.',
      thanks: '이 무로 뭇국을 끓일게요. 동생한테 "어제는 미안해" 하고 먼저 말해 볼래요!',
    },
    done: '동생이랑 뭇국을 나눠 먹으면서 화해했어요. 국물이 더 맛있었어요!',
  },
  {
    id: 'f-beaver', name: '뚝딱이', spec: { kind: 'beaver', fur: '#9A6B4A', fur2: '#E8CDB0', cloth: '#6FB3E0' }, type: 'garden',
    hello: '사장님… 잠깐 얘기 좀 들어 줄래요?',
    garden: {
      veg: 'potato', fam: 'courage',
      ask: '내일 반에서 처음으로 발표를 해요. 연습은 많이 했는데 자꾸 "틀리면 어떡하지?" 하는 생각이 들어요. 감자전을 부쳐 먹고 힘을 내고 싶어요. 마음 텃밭에서 감자 하나만 뽑아다 줄래요?',
      hint: '저는 떨려도 끝까지 해낼 수 있다는 힘이 필요해요.',
      thanks: '바삭바삭 감자전을 부쳐 먹고 내일 씩씩하게 발표할게요!',
    },
    done: '발표 잘했어요! 떨렸지만 끝까지 해냈어요.',
  },
  {
    id: 'f-kangaroo', name: '콩콩이', spec: { kind: 'kangaroo', fur: '#D49A68', fur2: '#F3DCC2', cloth: '#E98BA3' }, type: 'garden',
    hello: '아, 사장님… 안녕하세요.',
    garden: {
      veg: 'sweetpotato', fam: 'comfort',
      ask: '제일 친한 친구가 멀리 이사를 갔어요. 같이 놀던 놀이터에 가면 자꾸 눈물이 나요. 친구랑 자주 먹던 군고구마를 구워 먹으면 조금 나아질 것 같아요. 마음 텃밭에서 고구마 하나만 뽑아다 줄래요?',
      hint: '저는 지금 많이 허전하고 슬퍼요. 그 마음을 토닥여 줄 게 필요해요.',
      thanks: '따끈한 군고구마를 먹으니까 마음이 조금 따뜻해져요. 친구한테 편지도 써 볼래요.',
    },
    done: '친구랑 영상 통화를 했어요! 멀리 있어도 친구는 친구예요.',
  },
  {
    id: 'f-monkey', name: '재롱이', spec: { kind: 'monkey', fur: '#8C6A50', fur2: '#F1D6BA', cloth: '#F0974A' }, type: 'garden',
    hello: '으으… 사장님, 저 지금 속이 부글부글해요.',
    garden: {
      veg: 'carrot', fam: 'calm',
      ask: '동생이 제가 한 시간 동안 쌓은 블록 탑을 무너뜨렸어요. 화가 나서 소리를 지를 것 같아요. 당근 수프를 천천히 끓이면서 마음을 가라앉히고 싶어요. 마음 텃밭에서 당근 하나만 뽑아다 줄래요?',
      hint: '저는 지금 화가 나서 마음이 부글부글해요. 먼저 마음을 가라앉히고 싶어요.',
      thanks: '수프를 천천히 저으면서 숨을 크게 쉬었더니 화가 가라앉았어요. 동생한테 차분하게 말해 볼게요.',
    },
    done: '동생이랑 블록 탑을 다시 같이 쌓았어요. 이번엔 더 높게요!',
  },
);

const O = (text: string, good: boolean, reply: string): FeelOpt => ({ text, good, reply });

// 도움이 필요한 이웃들: 잃어버린 물건, 같이 가 주기, 짐 나르기, 마음 전해 주기, 놀이에 끼워 주기
FOLKS.push(
  // ── 잃어버린 물건 찾기 ──
  {
    id: 'f-fennec', name: '쫑긋이', spec: { kind: 'fennec', fur: '#F3D2A2', fur2: '#FFF4E4', cloth: '#E3645A' }, type: 'lost',
    hello: '흑… 사장님, 제 털모자 못 보셨어요?',
    lost: {
      item: 'hat', spot: 0,
      ask: '할머니가 떠 주신 털모자를 잃어버렸어요. 아까 {place}에서 놀다가 잠깐 벗어 두었는데, 다시 가 보니 없어요. 같이 찾아 줄래요?',
      back: { say: '내 털모자! 정말 찾아 왔어요?', opts: [
        O('할머니가 떠 주신 거라 정말 소중했지? 찾아서 다행이야.', true, '네, 잃어버린 줄 알고 얼마나 속상했는지 몰라요. 정말 고마워요!'),
        O('모자 하나쯤 또 사면 되지.', false, '이건 할머니가 떠 주신 하나뿐인 모자인걸요…'),
        O('다음부터는 잘 챙겨.', false, '저도 잃어버리고 싶지 않았어요…'),
      ] },
    },
    done: '털모자를 쓰고 할머니께 사진을 보내 드렸어요. 따뜻해요!',
  },
  {
    id: 'f-sloth', name: '늘보', spec: { kind: 'sloth', fur: '#A89074', fur2: '#E8DCC8', cloth: '#6FB3E0' }, type: 'lost',
    hello: '사장님… 어쩌죠… 큰일 났어요…',
    lost: {
      item: 'key', spot: 3,
      ask: '집 열쇠를 잃어버려서 집에 못 들어가요. 엄마가 오시기 전에 찾아야 하는데 걱정돼서 눈물이 날 것 같아요. {place}에서 쉬다가 떨어뜨린 것 같아요.',
      back: { say: '열쇠다! 이제 집에 들어갈 수 있어요…', opts: [
        O('많이 걱정됐지? 이제 괜찮아, 열쇠 여기 있어.', true, '휴우, 마음이 놓여요. 걱정한 마음을 알아줘서 고마워요.'),
        O('그러게 왜 잃어버렸어?', false, '저도 모르게 떨어뜨렸는걸요…'),
        O('울지 마, 별것도 아닌데.', false, '저한테는 정말 큰일이었어요…'),
      ] },
    },
    done: '이제 열쇠는 목걸이에 꼭 걸고 다녀요!',
  },
  {
    id: 'f-meerkat', name: '망보리', spec: { kind: 'meerkat', fur: '#D8B88A', fur2: '#F4E6CF', mark: '#6B4F36', cloth: '#47AE7A' }, type: 'lost',
    hello: '사장님! 혹시 초록 공책 못 봤어요?',
    lost: {
      item: 'book', spot: 5,
      ask: '그리기 대회에 낼 그림을 그린 공책을 잃어버렸어요. 며칠 동안 열심히 그린 건데… {place}에서 그림을 그리다가 두고 온 것 같아요.',
      back: { say: '내 공책! 그림도 그대로예요!', opts: [
        O('며칠이나 열심히 그린 그림이라 많이 아까웠겠다. 찾아서 다행이야.', true, '맞아요! 다시 그릴 생각에 막막했거든요. 고마워요!'),
        O('다시 그리면 되잖아.', false, '며칠이나 걸린 그림인걸요…'),
        O('그림이 그렇게 중요해?', false, '저한테는 정말 소중한 그림이에요…'),
      ] },
    },
    done: '그리기 대회에 그림을 냈어요! 상을 못 받아도 괜찮아요.',
  },
  {
    id: 'f-bee', name: '붕붕이', spec: { kind: 'bee', fur: '#F6CF3E', fur2: '#FFF1BF', mark: '#3E3A39', cloth: '#A68BD6' }, type: 'lost',
    hello: '붕붕… 사장님, 도와주세요.',
    lost: {
      item: 'doll', spot: 6,
      ask: '동생이 아끼는 곰 인형을 몰래 들고 나왔다가 잃어버렸어요. 동생이 울고 있어서 너무 미안해요. {place}에서 놀 때까지는 있었어요.',
      back: { say: '곰 인형이다! 동생한테 돌려줄 수 있어요.', opts: [
        O('동생이 울어서 마음이 무거웠겠다. 돌려주면서 미안하다고 말해 보자.', true, '네, 동생한테 먼저 미안하다고 말할게요. 고마워요!'),
        O('동생이 울든 말든 괜찮아.', false, '그래도 동생이 슬퍼하면 저도 슬퍼요…'),
        O('몰래 가져가서 그런 거잖아.', false, '알아요… 그래서 더 속상해요.'),
      ] },
    },
    done: '동생한테 미안하다고 했더니 같이 인형 놀이 하재요!',
  },
  // ── 같이 가 주기 ──
  {
    id: 'f-cow', name: '음매', spec: { kind: 'cow', fur: '#FFFFFF', fur2: '#F7D6DC', mark: '#3E3A39', cloth: '#8DC26F' }, type: 'escort',
    hello: '저기… 사장님, 길 좀 물어봐도 돼요?',
    go: {
      to: { kind: 'store', store: 'book' }, yes: '같이 가 줄게!',
      ask: '어제 이사 와서 아직 길을 몰라요. {dest}에 가 보고 싶은데 같이 가 줄래요?',
      mid: { say: '어? 길이 너무 많아요. 우리 길 잃은 거 아니에요?', opts: [
        O('걱정 마, 내가 길을 알아. 같이 가면 금방이야.', true, '휴, 사장님이랑 같이라서 다행이에요.'),
        O('몰라, 나도 헷갈려.', false, '네? 그럼 어떡해요…'),
        O('빨리 따라오기나 해.', false, '히잉, 너무 빨라요…'),
      ] },
      arrive: '와, 책방이다! 혼자였으면 못 찾았을 거예요. 같이 와 줘서 고마워요!',
    },
    done: '이제 책방 가는 길은 혼자서도 알아요!',
  },
  {
    id: 'f-dino', name: '쿵쿵이', spec: { kind: 'dino', fur: '#8DCB72', fur2: '#E9F5D6', cloth: '#F0974A' }, type: 'escort',
    hello: '사장님… 저 다리 건너가야 하는데요…',
    go: {
      to: { kind: 'town', town: 1 }, yes: '같이 가 줄게!',
      ask: '다리 건너 {dest}에 사는 친구 집에 놀러 가기로 했는데, 혼자 다리를 건너기가 무서워요. 같이 가 줄래요?',
      mid: { say: '다리가 흔들리면 어떡해요? 무서워요…', opts: [
        O('무서울 수 있어. 내가 옆에 꼭 붙어서 같이 건널게.', true, '사장님이 옆에 있으니까 조금 덜 무서워요.'),
        O('그게 뭐가 무서워?', false, '저는 정말 무서운데…'),
        O('눈 감고 뛰어 건너!', false, '그러다 넘어지면요…?'),
      ] },
      arrive: '다 왔다! 사장님이 옆에 있어서 하나도 안 무서웠어요.',
    },
    done: '이제 다리를 건널 때는 하나, 둘, 셋 세면서 건너요!',
  },
  {
    id: 'f-sparrow', name: '짹짹이', spec: { kind: 'sparrow', fur: '#B98A5E', fur2: '#F3E2CC', cloth: '#F6CF3E' }, type: 'escort',
    hello: '짹… 엄마가 안 보여요…',
    go: {
      to: { kind: 'plaza' }, yes: '같이 가 줄게!',
      ask: '엄마가 {dest}에서 기다린댔는데 길을 잃었어요. 광장까지 같이 가 줄래요?',
      mid: { say: '엄마가 안 계시면 어떡하죠? 저 혼자 남으면 어떡해요?', opts: [
        O('엄마가 기다리고 계실 거야. 내가 끝까지 같이 가 줄게.', true, '끝까지 같이 가 준다니 마음이 놓여요.'),
        O('울면 엄마가 싫어하셔.', false, '흐엉…'),
        O('그냥 여기서 기다려 봐.', false, '혼자 있는 건 더 무서워요…'),
      ] },
      arrive: '광장이다! 여기서 기다리면 엄마가 오실 거예요. 같이 와 줘서 정말 고마워요!',
    },
    done: '엄마를 만났어요! 다음엔 엄마 손 꼭 잡고 다닐래요.',
  },
  {
    id: 'f-zebra', name: '줄무늬', spec: { kind: 'zebra', fur: '#FFFFFF', fur2: '#F2F2F2', mark: '#3E3A39', cloth: '#E98BA3' }, type: 'escort',
    hello: '안녕하세요… 저 부탁이 있는데요…',
    go: {
      to: { kind: 'ramen' }, yes: '같이 가 줄게!',
      ask: '{dest}에서 라면을 먹어 보고 싶은데, 혼자 들어가기가 쑥스러워요. 가게 앞까지만 같이 가 줄래요?',
      mid: { say: '가게에 있는 사람들이 저를 이상하게 보면 어떡하죠?', opts: [
        O('처음 가는 곳은 쑥스러울 수 있어. 다들 반갑게 맞아 줄 거야.', true, '그렇겠죠? 조금 용기가 나요.'),
        O('그런 걱정을 왜 해?', false, '저는 걱정되는걸요…'),
        O('그럼 가지 마.', false, '그래도 꼭 가 보고 싶었는데…'),
      ] },
      arrive: '여기가 마음라면 가게구나! 같이 와 줘서 용기가 났어요.',
    },
    done: '라면 정말 맛있었어요! 다음엔 친구랑 같이 올래요.',
  },
  // ── 짐 같이 나르기 ──
  {
    id: 'f-gorilla', name: '든든이', spec: { kind: 'gorilla', fur: '#5E5650', fur2: '#A89A90', cloth: '#E9B92A' }, type: 'carry',
    hello: '끙차… 사장님, 잠깐만요!',
    go: {
      to: { kind: 'plaza' }, yes: '같이 들어 줄게!',
      ask: '잔치 때 쓸 의자 상자를 {dest}에 날라야 하는데 혼자 들기엔 너무 무거워요. 한쪽을 같이 들어 줄래요?',
      mid: { say: '헉헉, 팔이 너무 아파요. 그냥 그만둘까 봐요…', opts: [
        O('힘들지? 잠깐 쉬었다가 같이 들자. 둘이 들면 가벼워.', true, '좋아요, 숨 한 번 쉬고 다시 영차!'),
        O('그것도 못 들어?', false, '혼자 들었으면 진작 그만뒀을 거예요…'),
        O('그럼 나 먼저 갈게.', false, '아… 혼자 남으니까 더 무거워요.'),
      ] },
      arrive: '다 왔다! 둘이 같이 드니까 훨씬 가벼웠어요. 고마워요!',
    },
    done: '광장 의자가 다 놓였어요. 잔치 때 같이 앉아요!',
  },
  {
    id: 'f-horse', name: '다그닥', spec: { kind: 'horse', fur: '#B9835A', fur2: '#F0D9BC', mark: '#5B3A29', cloth: '#6FB3E0' }, type: 'carry',
    hello: '사장님, 시간 좀 있어요?',
    go: {
      to: { kind: 'store', store: 'fruit' }, yes: '같이 들어 줄게!',
      ask: '과수원에서 딴 사과 상자를 {dest}에 갖다줘야 해요. 상자가 커서 앞이 안 보여요. 같이 들어 줄래요?',
      mid: { say: '앗, 사과가 굴러떨어질 뻔했어요! 저는 왜 이렇게 덜렁댈까요…', opts: [
        O('괜찮아, 누구나 실수할 수 있어. 천천히 같이 들자.', true, '그렇게 말해 주니 마음이 편해요.'),
        O('정말 덜렁대네.', false, '저도 알아요… 흑.'),
        O('조심 좀 해!', false, '네, 네… 미안해요.'),
      ] },
      arrive: '도착! 사과가 하나도 안 떨어졌어요. 같이 들어 줘서 고마워요!',
    },
    done: '과일가게 사장님이 사과 파이를 구워 주셨어요!',
  },
  // ── 마음 전해 주기 ──
  {
    id: 'f-lion', name: '갈기', spec: { kind: 'lion', fur: '#E9B45E', fur2: '#FFF1D6', mark: '#B8763E', cloth: '#47AE7A' }, type: 'relay',
    hello: '…사장님, 안녕하세요.',
    relay: {
      partner: 'f-tiger',
      ask: '호돌이가 내 그림을 보고 큰 소리로 웃었어요. 친구들도 따라 웃었고요. 너무 속상해서 호돌이랑 말을 안 하고 있어요. 그런데 사실은 다시 사이좋게 지내고 싶어요.',
      toB: { say: '응? 갈기가 요즘 나랑 말을 안 해. 내가 뭘 잘못했는지 모르겠어.', opts: [
        O('갈기는 네가 그림을 보고 웃어서 많이 속상했대. 열심히 그린 그림이었대.', true, '아… 나는 그림이 재밌어서 웃은 건데, 갈기는 놀린다고 느꼈구나. 갈기한테 미안하다고 전해 줄래?'),
        O('너 때문에 갈기가 울었어! 당장 사과해!', false, '뭐? 나만 나쁜 애야? …나도 기분 나빠.'),
        O('별일 아니니까 그냥 모른 척해.', false, '음… 그래도 갈기가 계속 나랑 말을 안 하면 어떡하지?'),
      ] },
      back: '호돌이가 놀리려던 게 아니었대요? 미안하다고 했다니 마음이 풀려요. 이번엔 같이 그림 그리자고 할래요!',
    },
    done: '호돌이랑 같이 그린 그림이에요. 멋지죠?',
  },
  {
    id: 'f-tiger', name: '호돌', spec: { kind: 'tiger', fur: '#F0974A', fur2: '#FFF1E0', mark: '#3E3A39', cloth: '#6FB3E0' }, type: 'relay', relayOf: 'f-lion',
    hello: '갈기가 요즘 나랑 말을 안 해… 왜 그런지 모르겠어. 갈기한테 무슨 일이 있는지 물어봐 줄래?',
    done: '갈기랑 다시 단짝이 됐어. 이제 친구 그림을 보고 웃기 전에 한 번 더 생각해.',
  },
  // ── 혼자 있는 친구를 놀이에 ──
  {
    id: 'f-axolotl', name: '우파', spec: { kind: 'axolotl', fur: '#F7C3CC', fur2: '#FFE6EC', cloth: '#6FB3E0' }, type: 'invite',
    hello: '저… 사장님…',
    go: {
      to: { kind: 'play' }, yes: '같이 가 보자!',
      ask: '저쪽에서 친구들이 공놀이를 하는데, 같이 하자는 말이 안 나와요. 끼워 달라고 했다가 싫다고 하면 어떡하죠? 같이 가 줄래요?',
      mid: { say: '친구들이 싫다고 하면… 그냥 돌아갈까요?', opts: [
        O('거절당할까 봐 걱정되는구나. 내가 옆에 있을게, 같이 말해 보자.', true, '네… 사장님이 옆에 있으면 말할 수 있을 것 같아요.'),
        O('싫다고 하면 너도 놀지 마.', false, '그래도 같이 놀고 싶은걸요…'),
        O('그냥 혼자 놀아.', false, '혼자는 심심해요…'),
      ] },
      arrive: '',
    },
    invite: {
      group: ['f-chick', 'f-otter'], play: '공놀이',
      opts: [
        O('얘들아, 우파도 같이 놀고 싶대. 우리 다 같이 하자!', true, '좋아! 한 명 더 있으면 더 재밌지. 우파야, 이리 와!'),
        O('우파 좀 끼워 줘. 안 끼워 주면 나빠.', false, '어… 우리 안 끼워 준다고 한 적 없는데…'),
        O('우파는 공을 잘 못 차도 봐줘.', false, '응? 잘 못 차도 괜찮은데… 우파 생각은 어때?'),
      ],
      join: '같이 놀자고 말해 줘서 고마워요. 다음엔 제가 먼저 말해 볼래요!',
    },
    done: '이제 날마다 친구들이랑 공놀이해요! 제가 패스도 잘해요.',
  },
  {
    id: 'f-croc', name: '보들이', spec: { kind: 'crocodile', fur: '#7FB069', fur2: '#E3F0C8', cloth: '#F6CF3E' }, type: 'invite',
    hello: '안녕… 나 무섭지 않지?',
    go: {
      to: { kind: 'play' }, yes: '같이 가 보자!',
      ask: '나는 이빨이 뾰족해서 친구들이 무서워할까 봐 같이 놀자는 말을 못 하겠어. 저쪽에서 친구들이 술래잡기를 하는데, 같이 가 줄래?',
      mid: { say: '친구들이 나를 보고 도망가면 어떡하지?', opts: [
        O('생김새만 보고 친구를 다 알 수는 없지. 네가 얼마나 다정한지 금방 알게 될 거야.', true, '정말? 그럼 웃으면서 인사해 볼래.'),
        O('이빨을 숨기고 가.', false, '내 모습을 숨겨야 하는 거야…?'),
        O('무서워하면 어쩔 수 없지.', false, '…그래도 친구가 되고 싶어.'),
      ] },
      arrive: '',
    },
    invite: {
      group: ['f-pig', 'f-koala'], play: '술래잡기',
      opts: [
        O('얘들아, 보들이도 같이 놀고 싶대. 보들이는 정말 다정한 친구야!', true, '그래? 반가워, 보들아! 같이 술래잡기하자!'),
        O('보들이가 무섭게 생겼어도 착해.', false, '응…? 우리는 무섭다고 생각 안 했는데.'),
        O('보들이랑 놀아 주면 내가 선물 줄게.', false, '선물 안 줘도 같이 놀 수 있어!'),
      ],
      join: '친구들이 반갑다고 해 줬어! 같이 가 줘서 정말 고마워.',
    },
    done: '술래잡기할 때 내가 제일 빨라! 친구들이 대단하대.',
  },
);

export const FOLK_STAMPS = FOLKS.length;
export const folkIndex = (id: string) => FOLKS.findIndex((f) => f.id === id);
