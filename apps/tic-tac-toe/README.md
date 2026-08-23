# 틱택토

이 앱은 **DOM 기반 게임의 참조 구현**이기도 하다. 새 게임을 만들 때 여기
구조를 그대로 따르면 된다.

## 게임 규칙

일반 틱택토가 아니다. **한 사람이 판에 올릴 수 있는 말은 3개까지**이고, 그
상태에서 또 놓으면 **자기 말 중 가장 오래된 것이 사라진다.**

여기서 두 가지가 따라온다.

- **무승부가 없다.** 판에 말이 최대 6개라 9칸이 절대 차지 않는다. 누군가 세
  칸을 이을 때까지 계속된다.
- **다 이어놓고도 스스로 무너뜨릴 수 있다.** 놓은 뒤에 걷어내기 때문이다.
  세 칸을 잇는 수를 뒀는데 그 줄에 자기 가장 오래된 말이 있으면 그 말이
  빠지면서 줄이 깨진다. 이게 이 게임의 핵심 긴장이다.

사라질 말은 화면에 점선으로 미리 표시한다. 예고 없이 없어지면 규칙을 모르는
사람은 버그로 받아들인다.

한도는 [`rules.ts`](src/game/rules.ts)의 `MARKS_PER_PLAYER` 한 곳에만 있다.

## 3계층 구조

게임 앱은 아래 세 층으로 나눈다. 위층은 아래층을 알지만 아래층은 위층을 모른다.

```
App.tsx          화면      규칙을 모른다. GameApi만 안다.
  └─ game/useGame.ts   상태  규칙과 화면을 잇는다. React를 안다.
       └─ game/rules.ts  규칙  React도 DOM도 모른다. 순수 함수.
            └─ game/types.ts  타입 계약
```

| 파일                                     | 책임                         | 금지                 |
| ---------------------------------------- | ---------------------------- | -------------------- |
| [`game/types.ts`](src/game/types.ts)     | 규칙과 화면이 공유하는 타입  | 로직, import 대부분  |
| [`game/rules.ts`](src/game/rules.ts)     | 판정·수 선택 등 순수 규칙    | React, DOM, 부수효과 |
| [`game/useGame.ts`](src/game/useGame.ts) | 상태 보관, 전이, 타이머 정리 | DOM 조작, 판정 로직  |
| [`App.tsx`](src/App.tsx)                 | 화면 조립, 입력 전달         | 규칙 판정, 상태 전이 |

**왜 나누는가.** 규칙을 순수 함수로 두면 그것만 따로 테스트할 수 있고, 나중에
서버에서 같은 판정을 해야 할 때(점수 위조 방지 등) 파일을 그대로 옮길 수 있다.
화면과 규칙이 엉키면 둘 다 못 건드리게 된다 — 이전 레포가 정확히 그 상태였다.

## 규칙 파일이 하는 일

[`src/game/rules.ts`](src/game/rules.ts)에 판정과 수 선택이 모두 들어 있다.

| 함수                           | 하는 일                                             |
| ------------------------------ | --------------------------------------------------- |
| `evaluate(board)`              | 승자와 이긴 줄. 무승부 판정은 없다                  |
| `applyMove(state, index)`      | 놓고 → 넘치면 가장 오래된 말을 걷어내고 → 차례 넘김 |
| `vanishingCell(history, mark)` | 다음 수에 사라질 칸. 화면 예고에 쓴다               |
| `bestMove(state, me)`          | AI 수 선택                                          |

`applyMove`의 **순서가 규칙 그 자체**다. 걷어내기를 먼저 하면 방금 놓은 수가
이미 빠진 자리와 줄을 이룰 수 있어 규칙이 헐거워진다.

`bestMove`는 **깊이 제한** 미니맥스다. 이 게임은 무승부가 없고 말이 계속 돌아
같은 판이 다시 나타나므로 완전 탐색이 성립하지 않는다. 깊이 6에서 한 수당 약
24ms로, 사람이 기다림을 느끼지 않는다.

## 캔버스 게임은 구조가 다르다

캔버스와 물리 엔진을 쓰는 게임은 [`apps/alkkagi`](../alkkagi)를 참조한다.
차이는 상태 계층뿐이다.

|           | DOM 게임 (이 앱)       | 캔버스 게임 (알까기·양궁)            |
| --------- | ---------------------- | ------------------------------------ |
| 상태 계층 | `useGame()` 훅         | `XxxGame` 클래스 + `onChange` 스냅샷 |
| 렌더링    | React가 매 상태마다    | `GameLoop`가 매 프레임마다           |
| 화면 연결 | 훅이 돌려준 값을 JSX에 | `<GameCanvas onMount={...} />`       |
| 정리      | React가 알아서         | **`destroy()`에서 직접 떼야 한다**   |

캔버스 게임에서 정리를 빠뜨리면 개발 모드 StrictMode 재마운트 때 루프와 리스너가
두 벌 돌기 시작한다. 이전 레포에서 실제로 이것 때문에 사용자가 고른 값이 무시되는
버그가 났다. 자세한 내용은 [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#react-셸--게임-코어).

## 공통 UI를 먼저 찾아본다

화면 요소는 새로 만들기 전에 [`@gujuck/ui`](../../packages/ui)에 있는지 본다.

- `GameShell` — 상단/본문/하단 골격. `100dvh`와 safe-area 처리가 들어 있어
  노치 기기에서 헤더·버튼이 잘리지 않는다. **직접 `100vh`를 쓰지 않는다.**
- `ResultOverlay` — 한 판 종료 모달
- `GameCanvas` — 캔버스 게임 전용 마운트 브리지
- `gj-btn`, `gj-btn--primary` 등 공통 클래스 ([`styles.css`](../../packages/ui/src/styles.css))

앱 전용 CSS 클래스에는 앱 접두사를 붙인다(이 앱은 `ttt-`). 공통 UI의 `gj-`를
덮어쓰지 않기 위해서다.

## 지켜지는지 도구가 검사한다

```bash
yarn workspace @gujuck/tic-tac-toe lint
yarn workspace @gujuck/tic-tac-toe typecheck
yarn workspace @gujuck/tic-tac-toe build
```

`lint`는 스타일뿐 아니라 **계층 간 import 규칙**을 강제한다. 예를 들어 이 앱에서
다른 앱(`@gujuck/home` 등)을 import 하면 이유와 함께 실패한다. 규칙 정의는
[`packages/eslint-config/index.mjs`](../../packages/eslint-config/index.mjs) 한 곳에 있다.

개발 서버:

```bash
yarn workspace @gujuck/tic-tac-toe dev
```

## 더 읽을 것

- [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) — 계층 규칙과 그 근거
- [CONVENTIONS.md](../../docs/CONVENTIONS.md) — 코드 스타일, 커밋, 새 서비스 추가
