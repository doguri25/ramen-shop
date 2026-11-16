import { EVENT } from './event/flag';

// ─────────────────────────────────────────────────────────────
// 선생님 설정
// 띵커벨 보드 주소를 따옴표 안에 붙여 넣으세요. (비워 두면 카드 저장만 됩니다)
export const TINKERBELL_URL = '';
// 교사 화면 암호 (제목을 2초 동안 길게 누르면 나와요)
export const TEACHER_PIN = '9027';
// 대표 라면 카드를 만들 수 있게 되는 그릇 수
export const ROUNDS = 10;
// 만든이와 문의 연락처 (첫 화면 아래에 보여요)
export const CREDIT = { name: '도구리', contact: 'raccoon@ai.cne.go.kr' };
// AI 도우미(업스테이지 Solar) 중계 서버 주소. 비워 두면 AI 기능 없이 돌아가요. (선생님 화면에서 끄거나 바꿀 수 있어요)
export const AI_URL = EVENT ? '' : 'https://ramen-ai.vercel.app';
// ── 행사용(어깨동무 마음 요리사 도전) ──
// 랭킹 서버 주소
export const RANK_URL = 'https://ramen-ai.vercel.app/api/rank';
// 한 학생이 할 수 있는 판 수 (첫 판 + 다시 도전 2번)
export const MAX_RUNS = 3;
// 별 최고 개수 (수업용 3개, 행사용 5개)
export const MAX_STARS = EVENT ? 5 : 3;
// 평균 별 랭킹에 오르는 최소 그릇 수
export const AVG_MIN_BOWLS = 10;
// ─────────────────────────────────────────────────────────────
