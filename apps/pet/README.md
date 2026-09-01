# 펫타운

펫 육성 게임. 세이브·경과, 방 6개와 돌봄, 미니게임 3종, 상점·가구·튜토리얼,
그리고 표정·효과음 연출까지 돈다(M1~M5).

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
tools/raw/           생성 원본. 지우지 마라 — 다시 만들려면 크레딧이 든다
tools/sliced/        시트에서 잘라낸 조각 (gitignore. 시트에서 다시 만든다)
tools/slice.mjs      시트를 물건별로 쪼갠다 + 배경 제거
tools/pixelize.mjs   축소 · 팔레트 양자화 · 외곽선 재부착
tools/faces.mjs      눈·입을 찾아 표정 변형(깜빡임 · 시무룩 · 입 벌림)을 만든다
tools/check.html     결과를 눈으로 판정하는 페이지. 브라우저로 그냥 연다
tools/out-*.png      결과물 (gitignore. 아래 명령으로 언제든 다시 만든다)
```

**여러 개짜리 에셋은 한 장에 그려 잘라 쓴다.** 배경 제거가 생성보다 6배 비싸고,
시트 쪽이 축소 비율이 작아 선도 더 잘 남는다(명세 §12.8). 배경이 평평하면
`--drop-background` 로 공짜로 지운다 — 실패하면 스크립트가 죽으므로 그때 유료
누끼를 쓴다(§12.9).

```bash
node apps/pet/tools/slice.mjs --in apps/pet/tools/raw/items-sheet.png   --drop-background --outdir apps/pet/tools/sliced/items   --names apple,bread,cake,orange,milk,cookie,strawberry,cheese,donut,watermelon,candy
```

`--dry-run` 을 붙이면 파일을 쓰지 않고 무엇을 찾았는지만 보여준다. 이름 개수와
찾은 덩어리 수가 다르면 목록을 출력하고 죽는다 — 조용히 어긋난 채 저장하지 않는다.

```bash
node apps/pet/tools/pixelize.mjs --in apps/pet/tools/raw/room.png   --out apps/pet/tools/out-room.png --size 360x640 --despeckle
node apps/pet/tools/pixelize.mjs --in apps/pet/tools/raw/item-cut.png   --out apps/pet/tools/out-item.png --size 48 --outline 28282e
```

스크립트는 결과를 검사해 불합격이면 0이 아닌 코드로 죽는다. 팔레트 밖 색이
하나라도 섞이거나 반투명 픽셀이 남으면 그대로 통과시키지 않는다.

### 펫 12장을 다시 만들기

**성장 3단계는 새로 생성하지 않는다.** 같은 원본을 세 크기로 줄인 것이다 —
외곽선 재부착이 세 크기 모두에 1px 를 붙여 선 두께가 통일되고, 톤이 어긋날
여지가 없다(명세 §12.11).

```bash
node apps/pet/tools/pixelize.mjs --in apps/pet/tools/raw/pet-cut.png --out apps/pet/tools/out-pet-baby.png  --size 80  --outline 28282e --despeckle
node apps/pet/tools/pixelize.mjs --in apps/pet/tools/raw/pet-cut.png --out apps/pet/tools/out-pet-child.png --size 104 --outline 28282e --despeckle
node apps/pet/tools/pixelize.mjs --in apps/pet/tools/raw/pet-cut.png --out apps/pet/tools/out-pet-adult.png --size 128 --outline 28282e --despeckle
```

표정 변형 9장은 그 결과에서 `faces.mjs` 가 만든다. **어른(128)을 먼저 뽑아야
한다** — 80px 에서는 눈이 6px 이라 검출이 무너져 한쪽만 감기므로, 아기와
어린이는 어른에서 찾은 눈·입 자리를 비례로 옮겨 쓴다(`--reference`, 명세 §12.12).

```bash
node apps/pet/tools/faces.mjs --in apps/pet/tools/out-pet-adult.png --out-prefix apps/pet/tools/out-pet-adult
node apps/pet/tools/faces.mjs --in apps/pet/tools/out-pet-baby.png  --out-prefix apps/pet/tools/out-pet-baby  --reference apps/pet/tools/out-pet-adult.png
node apps/pet/tools/faces.mjs --in apps/pet/tools/out-pet-child.png --out-prefix apps/pet/tools/out-pet-child --reference apps/pet/tools/out-pet-adult.png
```

나온 12장을 `src/assets/pet-{baby,child,adult}{,-blink,-sad,-open}.png` 로 옮긴다.
위 명령은 현재 커밋된 12장과 **바이트까지 같은 결과**를 낸다. 다르게 나오면
원본이나 팔레트가 바뀐 것이므로 `sprites.ts` 의 `PET_METRICS`(잰 값이다)도 다시
재야 한다.

**팔레트는 [`src/game/palette.ts`](src/game/palette.ts) 하나뿐이다.** 스크립트도
게임도 그 파일을 읽는다. 형식을 바꾸면 스크립트가 죽으므로 파일 안의 경고를 먼저
읽는다.

**배경 제거는 이 스크립트가 하지 않는다.** 생성 모델이 단색 배경 지시를 무시하므로
전용 누끼 도구로 알파를 딴 결과를 `tools/raw/`에 넣는다(명세 §12.5).

## 개발

```bash
corepack yarn workspace @gujuck/pet dev
```

http://localhost:5174 로 열린다. **`corepack` 을 앞에 붙인다** — 맨 `yarn` 은 전역
Yarn 1 이 잡혀 `packageManager` 필드를 모른 채 죽는다.

## 직접 해보기

모바일 세로 화면을 전제로 만들었다. 브라우저 개발자도구에서 **375×812 정도로
좁혀 놓고** 보는 것이 실제에 가깝다. 화면 배율이 정수(×1 · ×2)로만 잡히므로
창 높이가 어중간하면 게임이 절반 크기로 그려진다(명세 §14).

개발 빌드에는 화면 왼쪽 아래에 **개발 도구**가 접혀 있다. 펼치면 시간 점프와
음식 지급이 나온다. 프로덕션 번들에는 들어가지 않는다.

- **시간 점프** — +12시간을 누르면 오프라인 경과가 그대로 재현된다(배고픔 −72,
  복귀 카드). 실시간으로 12시간을 기다리지 않고 확인하는 수단이다.
- **지급** — 상점을 거치지 않고 음식을 받는다.

### 처음부터 다시 하기

`localStorage.clear()` 만으로는 지워지지 않는다. 탭이 숨겨질 때 앱이 마지막
상태를 다시 써 넣기 때문이다(명세 §10 의 자동 저장). 콘솔에서 값을 망가뜨리면
손상 복구 경로를 타고 새 펫으로 시작한다.

```js
localStorage.setItem('gj.pet.v1', 'x')
location.reload()
```

원본은 `gj.pet.backup.<시각>` 으로 남으므로, 실수로 지웠어도 되살릴 수 있다.

### 볼 만한 것

| 어디               | 무엇                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| 첫 실행            | 이름을 짓고 튜토리얼이 방을 하나씩 연다. 건너뛰기도 밑천을 챙겨 준다 |
| 주방 · 욕실 · 침실 | 먹이기 · 씻기기 · 재우기. 배부를 때 먹이면 이유를 알려주고 거절한다  |
| 놀이터             | 미니게임 3종. 하루 코인 상한(300)에 닿으면 왜 덜 받았는지 밝힌다     |
| 상점 · 거실        | 가구를 사서 거실에 놓는다. 놓인 것은 끌어서 옮기고 집어서 되돌린다   |

## 검사

```bash
yarn workspace @gujuck/pet test
yarn workspace @gujuck/pet lint
yarn workspace @gujuck/pet typecheck
yarn workspace @gujuck/pet build
```

`lint`는 계층 간 import 규칙도 강제한다. 다른 앱을 import 하거나 공유 계층에
엔진 의존성을 넣으면 이유와 함께 실패한다.
