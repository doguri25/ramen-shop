// 마음 배지: 마음 골목에서 도와준 일, 마음을 알아준 일, 가게를 봐 준 일, 골목을 둘러본 일로 받아요.
// 순위는 없고, 사장님마다 그 기기의 마음 수첩에만 모여요
export type BadgeCat = 'help' | 'read' | 'shop' | 'mission' | 'explore';
export const BADGE_CAT: Record<BadgeCat, { name: string; color: string; soft: string }> = {
  help: { name: '도움', color: '#F0974A', soft: '#FDE8D4' },
  read: { name: '마음 읽기', color: '#E98BA3', soft: '#FBE3EA' },
  shop: { name: '가게 봐 주기', color: '#47AE7A', soft: '#D9F1E4' },
  mission: { name: '이어지는 미션', color: '#A68BD6', soft: '#ECE5F7' },
  explore: { name: '골목 나들이', color: '#6FB3E0', soft: '#DDEFFA' },
};

// 배지 조건을 셀 때 쓰는 숫자 (마음 골목이 그때그때 모아서 넘겨줘요)
export interface BadgeStats {
  stamps: number; stampsAll: number;
  type: Record<string, { done: number; total: number }>;
  feelFirst: number; vegFirst: number; kindFirst: number;
  shopsSat: number; shopsAll: number; bigBoth: boolean; shopFull: boolean;
  chain: [number, number]; mood: [number, number]; festival: boolean;
  towns: number; townsAll: number; tods: number; bridge: boolean; houses: number; walkers: number;
}
export interface Badge { id: string; cat: BadgeCat; name: string; how: string; icon: string; ok: (s: BadgeStats) => boolean }
const all = (s: BadgeStats, t: string) => !!s.type[t] && s.type[t].total > 0 && s.type[t].done >= s.type[t].total;

export const BADGES: Badge[] = [
  // 도움
  { id: 'b-first', cat: 'help', name: '첫 마음 도장', how: '처음으로 주민을 도와 마음 도장을 받아요.', icon: 'stamp', ok: (s) => s.stamps >= 1 },
  { id: 'b-ten', cat: 'help', name: '마음 도장 열 개', how: '마음 도장을 10개 모아요.', icon: 'stamp', ok: (s) => s.stamps >= 10 },
  { id: 'b-25', cat: 'help', name: '마음 도장 스물다섯 개', how: '마음 도장을 25개 모아요.', icon: 'stamp', ok: (s) => s.stamps >= 25 },
  { id: 'b-all', cat: 'help', name: '골목 모두의 친구', how: '동네 주민 모두에게 마음 도장을 받아요.', icon: 'heart', ok: (s) => s.stamps >= s.stampsAll },
  { id: 'b-errand', cat: 'help', name: '척척 심부름꾼', how: '심부름을 부탁한 주민 다섯 명을 도와요.', icon: 'bang', ok: (s) => (s.type.errand?.done ?? 0) >= 5 },
  { id: 'b-garden', cat: 'help', name: '텃밭 지킴이', how: '텃밭 이웃 넷에게 마음에 맞는 채소를 가져다줘요.', icon: 'sprout', ok: (s) => all(s, 'garden') },
  { id: 'b-lost', cat: 'help', name: '눈 밝은 탐정', how: '잃어버린 물건 넷을 모두 찾아 돌려줘요.', icon: 'search', ok: (s) => all(s, 'lost') },
  { id: 'b-escort', cat: 'help', name: '든든한 길동무', how: '같이 가 달라는 이웃 넷을 모두 데려다줘요.', icon: 'walk', ok: (s) => all(s, 'escort') },
  { id: 'b-carry', cat: 'help', name: '영차영차 함께 손', how: '무거운 짐 둘을 모두 같이 날라요.', icon: 'box', ok: (s) => all(s, 'carry') },
  { id: 'b-relay', cat: 'help', name: '마음 우체부', how: '다툰 친구 사이에서 마음을 전해 화해를 도와요.', icon: 'letter', ok: (s) => all(s, 'relay') },
  { id: 'b-invite', cat: 'help', name: '같이 놀자 다리', how: '혼자 있던 친구 둘이 놀이에 함께하게 도와요.', icon: 'ball', ok: (s) => all(s, 'invite') },
  // 마음 읽기
  { id: 'b-feel3', cat: 'read', name: '마음 읽기 새싹', how: '마음 이야기 주민에게 첫 대답부터 마음을 알아주는 말을 세 번 골라요.', icon: 'worry', ok: (s) => s.feelFirst >= 3 },
  { id: 'b-feel7', cat: 'read', name: '마음 읽기 척척박사', how: '마음 이야기 주민에게 첫 대답부터 마음을 알아주는 말을 일곱 번 골라요.', icon: 'worry', ok: (s) => s.feelFirst >= 7 },
  { id: 'b-veg', cat: 'read', name: '팻말 읽기 선수', how: '텃밭 채소를 한 번에 맞게 골라 네 번 가져다줘요.', icon: 'radish', ok: (s) => s.vegFirst >= 4 },
  { id: 'b-kind', cat: 'read', name: '다정한 말 한마디', how: '도움이 필요한 이웃에게 처음부터 마음을 알아주는 말을 다섯 번 골라요.', icon: 'heart', ok: (s) => s.kindFirst >= 5 },
  { id: 'b-chat', cat: 'read', name: '이야기 친구', how: '동네 이야기 주민 모두의 이야기를 끝까지 들어요.', icon: 'talk', ok: (s) => all(s, 'chat') },
  // 가게 봐 주기
  { id: 'b-sit', cat: 'shop', name: '첫 가게 지기', how: '처음으로 가게를 봐 줘요.', icon: 'shopsit', ok: (s) => s.shopsSat >= 1 },
  { id: 'b-sit-big', cat: 'shop', name: '빵집·꽃집 지기', how: '폭신 빵집과 방긋 꽃집을 둘 다 봐 줘요.', icon: 'bread', ok: (s) => s.bigBoth },
  { id: 'b-sit-all', cat: 'shop', name: '골목 가게 모두 지기', how: '일곱 가게를 모두 봐 줘요.', icon: 'icecream', ok: (s) => s.shopsSat >= s.shopsAll },
  { id: 'b-sit-star', cat: 'shop', name: '별 가득 가게 지기', how: '한 가게에서 받을 수 있는 별을 모두 받아요.', icon: 'flower', ok: (s) => s.shopFull },
  // 이어지는 미션
  { id: 'b-chain', cat: 'mission', name: '릴레이 완주', how: '이어지는 심부름 넷을 모두 끝내요.', icon: 'chain', ok: (s) => s.chain[1] > 0 && s.chain[0] >= s.chain[1] },
  { id: 'b-mood', cat: 'mission', name: '모임 열기', how: '마음 모으기 모임 셋을 모두 열어요.', icon: 'group', ok: (s) => s.mood[1] > 0 && s.mood[0] >= s.mood[1] },
  { id: 'b-fest', cat: 'mission', name: '동네 잔치', how: '마음 도장을 모아 동네 잔치를 열어요.', icon: 'party', ok: (s) => s.festival },
  // 골목 나들이
  { id: 'b-towns', cat: 'explore', name: '여덟 마을 나들이', how: '걸어 다니기로 여덟 마을에 모두 가 봐요.', icon: 'map', ok: (s) => s.towns >= s.townsAll },
  { id: 'b-tods', cat: 'explore', name: '낮·노을녘·밤 산책', how: '낮, 노을녘, 밤에 모두 골목을 걸어 봐요.', icon: 'moon', ok: (s) => s.tods >= 3 },
  { id: 'b-bridge', cat: 'explore', name: '냇물 다리 건너기', how: '걸어서 냇물 다리를 건너요.', icon: 'bridge', ok: (s) => s.bridge },
  { id: 'b-house', cat: 'explore', name: '반가운 이웃', how: '불 켜진 집을 눌러 손님 다섯 명을 만나요.', icon: 'village', ok: (s) => s.houses >= 5 },
  { id: 'b-walker', cat: 'explore', name: '산책 친구', how: '골목을 산책하는 손님 셋과 인사해요.', icon: 'me', ok: (s) => s.walkers >= 3 },
];
export const BADGE = new Map(BADGES.map((b) => [b.id, b]));
