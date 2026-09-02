# GuJeuk Game FE

구즉 미니게임 모노레포. 게임마다 렌더링 방식이 달라도 서로 간섭하지 않도록,
**앱은 독립 빌드·배포 단위로 두고 공통 로직만 패키지로 공유**한다.

- [아키텍처](docs/ARCHITECTURE.md) — 계층 구조와 의존성 규칙, 그렇게 한 이유
- [컨벤션](docs/CONVENTIONS.md) — 코드 스타일, 커밋, 새 서비스 추가 절차
- [게임 앱 표준 골격](apps/tic-tac-toe/README.md) — 새 게임을 만들기 전에 읽을 것
- [펫타운 명세서](docs/PET_TOWN_SPEC.md) — 준비 중인 펫 육성 게임의 설계 (구현 전)
- [펫타운 서버 API](docs/PET_SERVER_API.md) — 세이브 백업·기기 간 잇기에 필요한 API (구현 전)

## 구조

```
apps/
  home/            게임 허브 (React)
  tic-tac-toe/     React DOM 게임 — 게임 앱 표준 골격 (규칙은 비어 있음)
  alkkagi/         Canvas 2D + matter.js
  archery/         Canvas 2D + matter.js
packages/
  game-core/       엔진 중립 순수 TS — 게임 루프, 캔버스 스테이지, 포인터 입력
  api/             백엔드 연동 클라이언트 (프레임워크·엔진 무관, 아직 미연결)
  ui/              React 전용 공통 UI — 셸, 캔버스 브리지, 결과 오버레이
  eslint-config/   공유 ESLint 설정 + 계층 간 import 규칙
  vite-config/     공유 Vite 설정
  tsconfig/        공유 TypeScript 설정
server/            게임 백엔드 (Spring Boot, Gradle) — 독립 빌드 단위
```

클라이언트와 서버가 한 저장소에 있다. 게임 하나를 만들 때 화면과 API를
같은 PR에서 함께 바꾸기 위해서다. 다만 빌드 도구가 다르므로 `server/`는
Yarn 워크스페이스에 포함하지 않고 자체 Gradle 프로젝트로 둔다.

## 시작하기

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

서버는 별도로 띄운다. 포트는 8090으로 고정되어 있어 프론트 개발 서버와
겹치지 않는다.

```bash
cd server && ./gradlew bootRun
```

포트는 home 5170, tic-tac-toe 5171, alkkagi 5172, archery 5173으로 고정되어 있어
동시에 띄울 수 있다.

## 검사

CI가 도는 것과 같은 순서다. 푸시 전에 로컬에서 확인할 수 있다.

```bash
yarn format:check && yarn lint && yarn typecheck && yarn build
```

포맷 자동 수정:

```bash
yarn format
```

`yarn lint`는 스타일뿐 아니라 **계층 간 의존성 규칙**을 강제한다. `game-core`에
React나 물리 엔진을 import 하면 이유와 함께 실패한다. 자세한 내용은
[ARCHITECTURE.md](docs/ARCHITECTURE.md)를 참고.

## 게임 추가

폴더를 복사하지 말고 스크립트를 쓴다. 공유 설정을 상속해 처음부터 같은 규칙
아래 놓인다.

```bash
yarn create:app omok "오목"
```

캔버스·물리를 쓰는 게임이면 `--canvas`를 붙인다.

```bash
yarn create:app curling "컬링" --canvas
```

이후 절차는 스크립트가 출력해 준다. [CONVENTIONS.md](docs/CONVENTIONS.md#새-서비스-추가) 참고.

## 배포

`develop` 브랜치에 푸시되면 GitHub Actions가 앱별로 Vercel에 배포한다.
배포 경로는 이 워크플로 하나뿐이므로, **Vercel 대시보드의 Git 연동은 꺼 두어야**
같은 커밋이 두 번 배포되지 않는다.

필요한 시크릿:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID_HOME` / `_TIC_TAC_TOE` / `_ALKKAGI` / `_ARCHERY`

시크릿이 없으면 해당 앱의 배포 스텝은 경고만 남기고 넘어간다.

앱별 `vercel.json`의 명령은 **반드시 `corepack yarn`으로 시작한다.** Vercel 빌드
이미지에는 Yarn 1.22가 기본으로 깔려 있어 맨 `yarn`을 쓰면 Yarn 1이 잡히고,
`packageManager` 필드를 모르는 Yarn 1은 `yarn turbo`를 "turbo 스크립트 실행"으로
해석해 즉시 죽는다.
