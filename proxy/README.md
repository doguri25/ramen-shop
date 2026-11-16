# 친구라면 AI 중계 서버 (Vercel)

후루룩 친구라면 가게가 업스테이지 Solar를 부를 때 거치는 작은 서버예요. 업스테이지 키는 여기(버셀 환경 변수)에만 있고, 게임 코드에는 없어요.

- 주소: `https://ramen-ai.vercel.app/api/solar`
- 하는 일 네 가지(질문 내용은 이 서버가 정해요)
  - `react` 손님 맞춤 한마디 (Solar Mini 4)
  - `reason` 고른 까닭 생각 도우미 질문 (Solar Mini 4)
  - `kind` 직접 지은 라면 이름 고운 말 검사 (Solar Mini 4)
  - `summary` 선생님용 학급 요약 (Solar Pro 4)
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
| `MODEL_FAST` / `MODEL_SMART` | `solar-mini4` / `solar-pro4` | 쓸 모델 |
