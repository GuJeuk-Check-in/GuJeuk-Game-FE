# 펫타운

펫 육성 게임. 지금은 **에셋 파이프라인만 서 있고 게임 코드는 비어 있다**(M1 이전).

- [명세서](../../docs/PET_TOWN_SPEC.md) — 규칙·수치·설계 근거. 코드를 쓰기 전에 읽는다
- [아키텍처](../../docs/ARCHITECTURE.md) — 계층 규칙과 그 근거
- [컨벤션](../../docs/CONVENTIONS.md) — 코드 스타일, 커밋, 의존성 추가

구조와 지켜야 할 규칙은 참조 구현을 따른다: [`apps/alkkagi`](../alkkagi)

**이 앱은 물리 엔진을 쓰지 않는다.** `yarn create:app --canvas`가 넣어 준
`matter-js`는 걷어냈다. 미니게임 3종 모두 사각형 겹침 판정만 필요한데, 물리
엔진은 번들에 230KB를 얹고 도트 게임에 아무것도 더해주지 않는다(명세 §8).

## 도트 에셋 파이프라인

AI로 큰 그림을 생성해 도트로 줄이는 도구가 `tools/`에 있다. 설계 근거는 명세 §12.

```
tools/raw/       생성 원본 (누끼까지 끝난 것). 지우지 마라 — 팔레트를 바꿔
                 다시 뽑는 데 이미지 생성 비용이 들지 않는다
tools/pixelize.mjs   축소 · 팔레트 양자화 · 외곽선 재부착
tools/check.html     결과를 눈으로 판정하는 페이지. 브라우저로 그냥 연다
tools/out-*.png      결과물 (gitignore. 아래 명령으로 언제든 다시 만든다)
```

```bash
node apps/pet/tools/pixelize.mjs --in apps/pet/tools/raw/room.png   --out apps/pet/tools/out-room.png --size 360x640 --despeckle
node apps/pet/tools/pixelize.mjs --in apps/pet/tools/raw/pet-cut.png   --out apps/pet/tools/out-pet.png --size 128 --outline 28282e --despeckle
node apps/pet/tools/pixelize.mjs --in apps/pet/tools/raw/item-cut.png   --out apps/pet/tools/out-item.png --size 48 --outline 28282e
```

스크립트는 결과를 검사해 불합격이면 0이 아닌 코드로 죽는다. 팔레트 밖 색이
하나라도 섞이거나 반투명 픽셀이 남으면 그대로 통과시키지 않는다.

**팔레트는 [`src/game/palette.ts`](src/game/palette.ts) 하나뿐이다.** 스크립트도
게임도 그 파일을 읽는다. 형식을 바꾸면 스크립트가 죽으므로 파일 안의 경고를 먼저
읽는다.

**배경 제거는 이 스크립트가 하지 않는다.** 생성 모델이 단색 배경 지시를 무시하므로
전용 누끼 도구로 알파를 딴 결과를 `tools/raw/`에 넣는다(명세 §12.5).

## 개발

```bash
yarn workspace @gujuck/pet dev
```

## 검사

```bash
yarn workspace @gujuck/pet lint
yarn workspace @gujuck/pet typecheck
yarn workspace @gujuck/pet build
```

`lint`는 계층 간 import 규칙도 강제한다. 다른 앱을 import 하거나 공유 계층에
엔진 의존성을 넣으면 이유와 함께 실패한다.
