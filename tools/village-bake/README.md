# 마음 골목 물리 굽기

마음 골목의 소품(냇가 돌, 손수레 사과, 통과 상자, 장작더미, 공, 빨래)은
놓일 자리를 게임이 정하고, 놓이는 모양은 블렌더 물리로 미리 계산해 둔 값을 씁니다.
게임은 그대로 three.js 수채화로 그리고, 계산 결과만 `src/data/village-bake.json`에 들어 있어요.

- 강체: 중력으로 떨어뜨려 땅(소품 발밑 높이표)과 수레 위에 자리 잡게 해요. 비탈이면 기울고 구르기도 해요.
- 천: 빨래 세 장을 바람(돌풍)에 날려 24장면을 구워 두고, 게임에서 앞뒤로 이어 틀어요.

마을 배치(골목, 집, 가게)를 바꾸면 자리가 달라지니 다시 구워야 해요.
값이 맞지 않으면 개발 화면 콘솔에 `[village] 블렌더 물리 굽기 값이 지금 자리와 달라요`가 뜨고,
소품은 굽기 전 자리(땅 위)에 놓여요.

## 다시 굽기

```bash
npm run dev                                    # 다른 창에서 (기본 5173)
node tools/village-bake/export.cjs /tmp/spec.json          # 게임에서 자리와 땅 조각 뽑기 (Playwright 필요)
pip install bpy==5.3.0                         # 블렌더 파이썬 모듈 (Python 3.13)
python3 tools/village-bake/bake_village.py -- /tmp/spec.json src/data/village-bake.json 160
```

마지막 숫자는 시뮬레이션 장면 수(24장면 = 1초)예요. 내보낸 뒤 `npm run dev` 화면에서 골목을 열면 바로 반영돼요.
