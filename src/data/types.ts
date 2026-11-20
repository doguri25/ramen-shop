export type Family = 'comfort' | 'together' | 'rest' | 'courage' | 'calm' | 'reconcile' | 'love' | 'joy';
export type Effect = string;
export type Step = 'broth' | 'noodle' | 'soup' | 'topping' | 'finish';
export type Amount = '한 꼬집' | '한 숟가락' | '두 숟가락' | '한 국자';

export interface FamilyInfo { id: Family; name: string; color: string; soft: string }
export interface EffectInfo { id: Effect; family: Family; name: string; when: string; tip: string }

export type ModelKind =
  | 'broth' | 'noodle' | 'packet'
  | 'egg' | 'dumpling' | 'scallion' | 'fishcake' | 'gim' | 'shiitake' | 'corn' | 'chili' | 'tofu'
  | 'tteok' | 'woodear' | 'sprout' | 'yubu' | 'sausage' | 'quail'
  | 'potato' | 'carrot' | 'broccoli' | 'cucumber' | 'peas'
  | 'sesame' | 'giggle' | 'pepper' | 'oil' | 'salt' | 'cheese' | 'gimflake' | 'butter' | 'stargim'
  | 'honey' | 'chive' | 'perilla';

export interface Look { model: ModelKind; color: string; color2?: string; style?: string }

export interface Ingredient {
  id: string;
  step: Step;
  name: string;
  effects: Effect[];
  note: string;
  tag?: string;
  look: Look;
}

export type Kind =
  | 'rabbit' | 'cat' | 'bear' | 'squirrel' | 'duck' | 'penguin' | 'fox' | 'panda' | 'raccoon' | 'dog'
  | 'owl' | 'turtle' | 'sheep' | 'hedgehog' | 'elephant' | 'hippo' | 'giraffe' | 'monkey' | 'pig'
  | 'hamster' | 'otter' | 'frog' | 'chick' | 'deer' | 'lion' | 'tiger' | 'koala' | 'kangaroo' | 'mole'
  | 'alpaca' | 'goat' | 'mouse' | 'beaver' | 'human'
  // 행사용으로 더한 생김새 36가지
  | 'capybara' | 'quokka' | 'redpanda' | 'fennec' | 'seal' | 'cow' | 'horse' | 'zebra' | 'bee' | 'axolotl' | 'dino' | 'parrot'
  | 'sparrow' | 'bat' | 'wolf' | 'rhino' | 'sloth' | 'skunk' | 'meerkat' | 'walrus' | 'crocodile' | 'gorilla' | 'unicorn' | 'crow'
  | 'peacock' | 'shark' | 'dragon' | 'cheetah' | 'rooster' | 'boar' | 'moose' | 'eagle' | 'lynx' | 'badger' | 'yak' | 'pelican';

export interface ChibiSpec {
  kind: Kind;
  fur: string;        // 몸 색 (사람은 피부색)
  fur2?: string;      // 배·주둥이·귀 안쪽
  mark?: string;      // 무늬·갈기·뿔 같은 세 번째 색
  cloth: string;      // 옷 색
  hair?: string;      // 사람 머리카락 색
  style?: string;     // 사람 머리 모양 / 특별 꾸밈
  glasses?: boolean;
  belly?: number;     // 몸통 너비 배율
  scale?: number;
  wear?: string;      // 몸에 걸치는 소품 id
}

export interface Customer {
  id: string;
  name: string;
  source: 'new' | 'tutorial';
  slowVoice?: boolean;      // 읽어 줄 때 천천히 (할머니·할아버지)
  chibi: ChibiSpec | ChibiSpec[];
  greet: string;
  story: string[];          // "@1 " 로 시작하면 두 번째 손님이 말해요. [[단서]]
  needs: { effect: Effect; sub: Family };
  feelingWords: string[];
  reactions: { 3: string[]; 2: string[]; 1: string[] };
  prop: string;             // 소품 이름 (보여 주기용)
  propModel: string;        // 3D 소품 id
  safetyNote?: string;
}

export interface FinishPick { id: string; amount: Amount }
export interface Picks {
  broth: string | null;
  noodle: string | null;
  soup: string | null;
  toppings: string[];
  finish: FinishPick[];
}

export interface RamenRecord {
  id: string;
  ownerId: string;
  round: number;
  customerId: string;
  picks: Picks;
  name: string;
  stars: number;          // 수업용 1~3, 행사용 1~5
  heart: boolean;
  photoKey: string;
  createdAt: number;
}

export interface Owner {
  id: string;
  number: number;
  name: string;
  round: number;          // 지금까지 끓인 그릇 수
  order: string[];        // 손님 순서 (학생마다 다름)
  tutorialDone: boolean;
  createdAt: number;
  ev?: EventRun;          // 행사용 한 판 기록
}

// 행사용: 학생 한 명의 한 판 (10그릇)
export interface EventRun {
  grade: number;
  cls: number;
  key: string;            // 학년-반-번호-이름
  runNo: number;          // 몇 번째 판 (1~3)
  runId: string;
  total: number;          // 이번 판에 모은 별
  fives: number;          // 별 다섯 개 받은 그릇 수
  done: boolean;          // 10그릇을 다 끓였는지
}
