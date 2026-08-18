# GuJeuk Game FE

구즉 미니게임 모노레포. 게임마다 렌더링 방식이 달라도 서로 간섭하지 않도록,
**앱은 독립 빌드 단위로 두고 공통 로직만 패키지로 공유**한다.

## 구조

```
apps/
  home/            게임 허브 (React)
  tic-tac-toe/     React DOM 게임
  alkkagi/         Canvas 2D + matter.js
  archery/         Canvas 2D + matter.js
packages/
  game-core/       엔진 중립 순수 TS — 게임 루프, 캔버스 스테이지, 포인터 입력
  api/             백엔드 연동 클라이언트 (프레임워크·엔진 무관, 아직 미연결)
  ui/              React 전용 공통 UI — 셸, 캔버스 브리지, 결과 오버레이
  vite-config/     공유 Vite 설정
  tsconfig/        공유 TypeScript 설정
```

## 렌더링 엔진이 섞여도 되는 이유

각 앱은 자기 Vite 빌드로 따로 번들되고 따로 배포된다. 틱택토가 React DOM만
쓰고 알까기가 matter.js를 쓰더라도, 두 번들은 만나지 않으므로 충돌할 지점이 없다.

지켜야 할 규칙은 **의존성 방향** 하나다.

| 레이어 | 허용되는 의존성 | 금지 |
|---|---|---|
| `packages/game-core` | 브라우저 API만 | React, matter.js, 모든 렌더러 |
| `packages/api` | fetch만 | React, 게임 로직 |
| `packages/ui` | React, `game-core` | matter.js, 특정 게임 로직 |
| `apps/*` | 무엇이든 | 다른 앱 |

물리 엔진은 게임 앱 안에만 둔다. `game-core`에 matter.js가 들어오는 순간
matter.js를 쓰지 않는 틱택토까지 그 의존성을 끌고 가게 된다.

또 하나: Yarn workspaces는 의존성을 루트로 호이스팅하므로, 선언하지 않은
패키지를 import 해도 로컬에서는 동작한다(phantom dependency). 그러다 배포에서
터진다. **쓰는 패키지는 반드시 해당 앱 `package.json`에 선언한다.**

## 개발

```bash
yarn install
```

```bash
yarn dev
```

앱 하나만 띄우려면:

```bash
yarn workspace @gujuck/alkkagi dev
```

포트는 home 5170, tic-tac-toe 5171, alkkagi 5172, archery 5173으로 고정되어
있어 동시에 띄울 수 있다.

## 빌드 · 타입 검사

```bash
yarn build
```

```bash
yarn typecheck
```

## 게임 추가하기

1. `apps/<slug>/` 생성 — 기존 앱의 `package.json` · `vite.config.ts` ·
   `tsconfig.json` · `index.html` · `vercel.json`을 참고한다. 설정은 전부
   `@gujuck/vite-config`와 `@gujuck/tsconfig`를 extends 하므로 각 파일은 몇 줄이면 된다.
2. Vercel에 프로젝트를 만들고, GitHub 시크릿에 `VERCEL_PROJECT_ID_<SLUG>`를 추가한다.
3. `.github/workflows/ci.yml`의 `matrix.app`에 한 줄 추가한다.
4. 허브에 노출하려면 `apps/home/src/games.ts`와 `apps/home/.env.example`에 항목을 추가한다.

## 배포

`develop` 브랜치에 푸시되면 GitHub Actions가 앱별로 Vercel에 배포한다.
배포 경로는 이 워크플로 하나뿐이므로, **Vercel 대시보드의 Git 연동은 꺼 두어야**
같은 커밋이 두 번 배포되지 않는다.

필요한 시크릿:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID_HOME` / `_TIC_TAC_TOE` / `_ALKKAGI` / `_ARCHERY`

시크릿이 없으면 해당 앱의 배포 스텝은 경고만 남기고 넘어간다.
