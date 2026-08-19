# 틱택토 — 게임 앱 표준 골격

이 앱은 **DOM 기반 게임의 참조 구현**이다. 새 게임을 만들거나 이 앱을 완성할 때
여기 구조를 그대로 따르면 된다.

> **현재 상태: 규칙이 비어 있다.** 화면·상태·결과 흐름은 완성되어 있지만
> [`src/game/rules.ts`](src/game/rules.ts)의 `evaluate`와 `bestMove`가 골격만
> 있어서 승패가 나지 않고 AI도 생각하지 않는다. 그 두 함수를 채우면 동작한다.

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

## 채워야 할 곳

[`src/game/rules.ts`](src/game/rules.ts)의 TODO 두 개가 전부다.

- `evaluate(board)` — 승패·무승부 판정. `LINES` 상수가 이미 준비되어 있다.
- `bestMove(board, me)` — AI 수 선택. 3x3은 미니맥스 완전 탐색으로 충분하다.

다른 파일은 손대지 않아도 된다. 규칙만 채우면 화면·AI 턴·결과 오버레이가
그대로 붙는다.

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
