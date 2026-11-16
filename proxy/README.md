# 친구라면 AI 중계 서버 (Vercel)

후루룩 친구라면 가게가 업스테이지 Solar를 부를 때 거치는 작은 서버예요. 업스테이지 키는 여기(버셀 환경 변수)에만 있고, 게임 코드에는 없어요.

- 주소: `https://ramen-ai.vercel.app/api/solar`
- 하는 일 네 가지(질문 내용은 이 서버가 정해요)
  - `react` 손님 맞춤 한마디 (Solar Pro 4)
  - `reason` 고른 까닭 생각 도우미 질문 (Solar Pro 4)
  - `kind` 직접 지은 라면 이름 고운 말 검사 (Solar Pro 4)
  - `summary` 선생님용 학급 요약 (Solar Pro 4)
- 2026년 11월 16일에 잰 기다리는 시간(Solar Pro 4, 다섯 번씩): 고운 말 검사 0.7~1.2초, 생각 도우미 0.6~1.1초, 손님 한마디 0.7~2.9초. 모두 빨라서 Mini로 되돌리지 않았어요.
- 지켜 주는 것: 허락한 사이트(doguri25.github.io)에서만 부를 수 있음, 글 길이 제한, 같은 인터넷 주소에서 1분에 150번·하루 4000번 정도까지, 22초 넘으면 끊음

## 키 넣기 (한 번만)

1. vercel.com → `ramen-ai` 프로젝트 → Settings → Environment Variables
2. Key `UPSTAGE_API_KEY`, Value에 업스테이지 콘솔의 API 키, Environment는 Production
3. Deployments 탭에서 맨 위 배포의 ⋯ → Redeploy

`https://ramen-ai.vercel.app/api/solar`를 열었을 때 `"ready":true`가 보이면 연결된 거예요.

키는 2026년 11월 16일에 넣었어요(마음빛 길잡이와 같은 업스테이지 키). 키를 바꾸면 위 3번처럼 다시 배포해야 새 키가 쓰여요.

## 바꿀 수 있는 값 (선택)

| 이름 | 기본값 | 뜻 |
| --- | --- | --- |
| `ALLOW_ORIGINS` | `https://doguri25.github.io` | 부를 수 있는 사이트(쉼표로 여러 개) |
| `PER_MINUTE` | `150` | 같은 인터넷 주소에서 1분에 보낼 수 있는 횟수 |
| `PER_DAY` | `4000` | 하루 전체 횟수(대략) |
| `MODEL_SMART` | `solar-pro4` | 기본 모델 |
| `MODEL_REACT` / `MODEL_REASON` / `MODEL_KIND` | `MODEL_SMART`와 같음 | 일마다 다른 모델을 쓰고 싶을 때 (예: `solar-mini4`) |

## 행사 랭킹 서버 (어깨동무 마음 요리사 도전)

행사용 게임(`https://doguri25.github.io/ramen-shop/event/`)의 랭킹을 MongoDB Atlas에 모아요.

- 주소: `https://ramen-ai.vercel.app/api/rank` (열어 보면 `"ready":true`면 DB와 연결된 거예요. `"hasKey":true`면 랭킹 암호가 들어간 거예요)
- 학생 한 명(학년-반-번호-이름)이 문서 하나예요. 판(10그릇)은 세 번까지만 받아요(첫 판 + 다시 도전 2번).
- 한 그릇 끓일 때마다 그 판의 별 합계를 보내요. 같은 판 기록은 늘어나기만 하고, 한 그릇에 별 다섯 개를 넘거나 10그릇을 넘는 기록은 받지 않아요.
- 랭킹은 선생님만 봐요. `board`(개인)와 `classes`(반) 요청은 `RANK_ADMIN_KEY`와 같은 암호가 있어야 답하고, 암호를 넣지 않았으면 아무에게도 답하지 않아요. 한 인터넷 주소에서 10분에 10번 틀리면 10분 동안 막아요.
- 학생이 받는 답(`status`, `run`)에는 내 기록만 있고 등수는 없어요.
- 개인 랭킹은 1~2학년, 3~4학년, 5~6학년으로 나눠요.
  - 모은 별: 세 판 가운데 가장 잘한 판의 별 (같으면 별 다섯 그릇이 많은 학생, 그것도 같으면 먼저 낸 학생)
  - 평균 별: 끓인 모든 그릇의 별 평균, 10그릇을 넘게 끓인 학생만
- 반 랭킹은 전교를 한꺼번에 세워요.
  - 모은 별: 반 친구들이 저마다 가장 잘한 판의 별을 모두 더한 값 (같으면 별 다섯 그릇이 많은 반)
  - 평균 별: 반 친구들이 끓인 모든 그릇의 별 평균, 반 전체로 30그릇을 넘게 끓인 반만
- 학생 이름은 주소창에 싣지 않도록 모두 POST로 받아요. 연결 문자열은 돌려주지 않아요.

### DB 연결하기 (한 번만)

1. MongoDB Atlas에서 무료(M0) 클러스터를 만들고, Database Access에서 이 서버만 쓸 사용자를 하나 만들어요(Read and write to any database).
2. Network Access에 `0.0.0.0/0`을 넣어요. 버셀 함수는 부를 때마다 인터넷 주소가 바뀌어서 주소 하나만 허락할 수 없어요.
3. Atlas의 Connect → Drivers에서 연결 문자열(`mongodb+srv://…`)을 복사해 비밀번호 자리를 채워요.
4. vercel.com → `ramen-ai` → Settings → Environment Variables에 Key `MONGODB_URI`, Value에 연결 문자열을 넣어요(Production).
5. 같은 곳에 Key `RANK_ADMIN_KEY`, Value에 선생님만 아는 랭킹 암호를 넣어요(Production). 게임의 선생님 화면 → 랭킹 보기에서 이 암호를 한 번 넣으면 그 기기가 기억해요.
6. Deployments 탭에서 맨 위 배포의 ⋯ → Redeploy

| 이름 | 기본값 | 뜻 |
| --- | --- | --- |
| `MONGODB_URI` | (없음) | MongoDB Atlas 연결 문자열 |
| `MONGODB_DB` | `ramen_event` | 데이터베이스 이름 |
| `RANK_ADMIN_KEY` | (없음) | 랭킹을 볼 선생님 암호. 없으면 랭킹을 아무에게도 보여 주지 않아요 |
| `RANK_PER_MINUTE` | `600` | 같은 인터넷 주소(한 학교)에서 1분에 보낼 수 있는 랭킹 요청 수 |

행사가 끝나면 Atlas에서 `ramen_event` 데이터베이스의 `students` 컬렉션을 내려받아 상품 대상자를 정하고, 그다음 지우면 돼요.
