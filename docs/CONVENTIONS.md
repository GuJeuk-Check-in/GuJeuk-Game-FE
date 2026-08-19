# 컨벤션

서비스가 늘어나도 코드가 한 사람이 쓴 것처럼 보이게 하는 것이 목표다.
아래 항목 중 **도구가 강제하는 것**과 **합의로 지키는 것**을 구분해 두었다.

## 도구가 강제하는 것

손으로 지킬 필요가 없다. 어기면 CI가 막는다.

| 항목            | 도구                           | 실행                |
| --------------- | ------------------------------ | ------------------- |
| 코드 포맷       | Prettier                       | `yarn format:check` |
| 계층 간 import  | ESLint `no-restricted-imports` | `yarn lint`         |
| 타입            | TypeScript strict              | `yarn typecheck`    |
| 줄바꿈(LF)      | `.gitattributes`               | git이 자동 처리     |
| 들여쓰기·인코딩 | `.editorconfig`                | 에디터가 자동 처리  |

로컬에서 한 번에 확인:

```bash
yarn format:check && yarn lint && yarn typecheck && yarn build
```

포맷을 자동으로 고치려면:

```bash
yarn format
```

## 기술 스택 — 서비스 간 통일

새 게임도 같은 스택을 쓴다. 다르게 가야 할 이유가 있으면 먼저 논의한다.

| 영역          | 선택                | 비고                         |
| ------------- | ------------------- | ---------------------------- |
| 언어          | TypeScript (strict) | `any` 금지 (lint error)      |
| UI            | React 18            | 게임 셸·HUD·모달             |
| 빌드          | Vite 5              | `@gujuck/vite-config` 상속   |
| 물리          | matter.js           | 캔버스 게임에 한해           |
| 렌더링        | Canvas 2D           | WebGL은 필요해질 때 논의     |
| 패키지 매니저 | Yarn 4 (Corepack)   | `packageManager` 필드로 고정 |
| Node          | 24 (`.nvmrc`)       | CI도 동일                    |

**렌더링·물리 엔진 선택 기준**: 알까기·양궁 수준의 2D 물리에는 Canvas 2D +
matter.js면 충분하다. Phaser(약 1MB)나 Pixi(약 400KB)는 스마트 TV 내장 브라우저
대응까지 감안하면 부담이 크다. 오브젝트가 수백 개 단위로 늘거나 파티클이 필요해질
때 다시 논의한다.

## 코드 스타일

Prettier가 처리하지 않는 부분만 적는다.

- **세미콜론 없음, 작은따옴표, 줄 길이 100** — `.prettierrc.json`
- **파일명**: React 컴포넌트는 `PascalCase.tsx`, 그 외는 `camelCase.ts`
- **게임 클래스**: `<GameName>Game.ts` (예: `AlkkagiGame.ts`)
- **CSS 클래스**: 앱마다 짧은 접두사 (`ttt-`, `ak-`, `ar-`, `hm-`).
  공통 UI는 `gj-` 접두사를 쓴다. 앱 스타일이 공통 UI를 덮어쓰지 않게 하기 위함이다.
- **주석**: 무엇을 하는지가 아니라 **왜 그렇게 했는지**를 쓴다. 특히 물리 상수,
  브라우저 우회, 과거에 터진 버그는 반드시 근거를 남긴다. 코드만 봐서는
  되돌리기 쉬운 결정들이다.

## 게임 로직은 렌더링과 분리한다

React 게임이든 캔버스 게임이든 규칙은 순수 함수·클래스로 따로 둔다.

```
apps/tic-tac-toe/src/
  App.tsx          ← 화면
  game/board.ts    ← 규칙 (React를 모른다)
```

이렇게 두면 테스트할 수 있고, 나중에 서버 검증에 그대로 재사용할 수 있다.

## 커밋 메시지

```
<타입> :: <한국어 요약>

무엇이 문제였는지, 왜 이렇게 고쳤는지.
```

타입: `feat` `fix` `refactor` `chore` `ci` `docs` `test`

```
fix :: 알까기 돌이 상대를 관통하던 문제 수정

applyForce는 질량과 타임스텝 제곱에 얽혀 있어 세기 조절이 어렵다.
초안 계수에서 돌이 한 프레임에 2391px를 이동해 충돌 판정을 건너뛰었다.
setVelocity로 바꾸고 한 스텝 이동 거리를 돌 지름 아래로 제한한다.
```

## 브랜치

- `develop` — 기본 브랜치. 여기에 푸시되면 Vercel로 배포된다.
- 작업은 `<타입>/<주제>` 브랜치에서 하고 PR로 합친다. (예: `feat/omok-board`)

`develop`에 직접 커밋하지 않는다. 배포가 걸려 있다.

## 새 서비스 추가

**폴더를 복사하지 않는다.** 스크립트를 쓴다.

```bash
yarn create:app omok "오목"
```

캔버스·물리를 쓰는 게임이면:

```bash
yarn create:app curling "컬링" --canvas
```

스크립트가 `package.json` · `tsconfig.json` · `eslint.config.mjs` ·
`vite.config.ts` · `index.html` · `vercel.json`과 최소 소스를 생성한다. 공유 설정을
상속하므로 처음부터 같은 규칙 아래 놓이고, 개발 서버 포트도 겹치지 않게 자동으로
잡힌다. 캔버스 옵션은 정리 함수까지 채워진 게임 클래스 골격을 함께 만든다.

생성 후 남는 일은 스크립트가 출력해 준다.

1. `yarn install`
2. Vercel 프로젝트 생성 + GitHub 시크릿 `VERCEL_PROJECT_ID_<SLUG>` 추가
3. `.github/workflows/ci.yml`의 `matrix.app`에 한 줄 추가
4. 허브에 노출하려면 `apps/home/src/games.ts`에 항목 추가

## 의존성 추가

**쓰는 패키지는 그 패키지의 `package.json`에 직접 선언한다.** Yarn workspaces가
루트로 호이스팅하기 때문에 선언하지 않아도 로컬에서는 동작하지만, 배포에서 터진다.

```bash
yarn workspace @gujuck/alkkagi add some-lib
```

공유 패키지에 무언가를 추가할 때는 [ARCHITECTURE.md](ARCHITECTURE.md)의 계층 표를
먼저 확인한다. 금지된 조합이면 lint가 막는다.
