# 아키텍처

## 이 구조가 풀려는 문제

게임마다 만드는 방식이 다르다. 틱택토는 React DOM으로 충분하지만 알까기와
양궁은 캔버스와 물리 엔진이 필요하다. 앞으로 어떤 게임이 추가될지도 모른다.

한 저장소에 이렇게 서로 다른 기술이 섞이면 보통 두 가지로 망가진다.

1. **의존성 오염** — 공통 계층에 특정 엔진이 들어가고, 그 엔진을 쓰지 않는
   게임까지 번들에 끌고 간다.
2. **설정 표류** — 앱마다 설정 파일을 복붙하다가 어느 순간 한 앱만 뒤처진다.
   이전 레포에서 실제로 `vite.config.ts`가 바이트 단위로 동일한 복사본 5벌로
   존재했고, 스마트 TV 대응을 넣을 때 다섯 번을 똑같이 고쳐야 했다.

이 구조는 그 두 가지를 **도구가 막게** 만든 것이다.

## 계층

```
apps/*            독립 빌드·배포 단위. 게임 하나 = 앱 하나
  └─ packages/ui           React 전용 공통 UI
       └─ packages/game-core   엔진 중립 순수 TS
  └─ packages/api          백엔드 연동 (독립)
```

| 계층                 | 역할                                    | 참조 가능          | 금지                          |
| -------------------- | --------------------------------------- | ------------------ | ----------------------------- |
| `packages/game-core` | 게임 루프, 캔버스 스테이지, 포인터 입력 | 브라우저 API만     | React, 모든 물리·렌더링 엔진  |
| `packages/api`       | HTTP 클라이언트, 토큰 저장              | fetch만            | React, 엔진, 다른 공유 패키지 |
| `packages/ui`        | 화면 셸, 캔버스 브리지, 결과 오버레이   | React, `game-core` | 물리 엔진, `api`              |
| `apps/*`             | 게임 구현                               | 무엇이든           | 다른 앱                       |

물리 엔진은 **게임 앱 안에만** 둔다. `matter-js` import는 `apps/alkkagi/src/game/`과
`apps/archery/src/game/` 안에서만 나타나야 한다.

## 규칙은 lint가 강제한다

위 표는 문서가 아니라 실행되는 코드다. 정의는
[`packages/eslint-config/index.mjs`](../packages/eslint-config/index.mjs) 한 곳에 있고,
각 패키지의 `eslint.config.mjs`가 자기 계층만 선언한다.

```js
export default createConfig({ layer: 'core' }) // core | api | ui | app
```

위반하면 이유와 함께 빌드가 막힌다.

```
error  'matter-js' import is restricted from being used by a pattern.
       game-core에 물리·렌더링 엔진이 들어오면 그 엔진을 쓰지 않는 게임까지
       번들에 끌고 갑니다. 게임 앱 안에 두세요.
```

새 엔진(Pixi, Phaser 등)을 도입하더라도 `RENDER_ENGINES` 목록에 한 줄만 추가하면
같은 보호를 받는다. 아직 쓰지 않는 엔진도 미리 넣어두었다.

## 엔진이 섞여도 안전한 이유

앱은 각자 자기 Vite 빌드로 번들되고 각자 배포된다. 두 번들은 런타임에 만나지
않으므로 충돌할 지점 자체가 없다. 번들 크기가 이를 그대로 보여준다.

| 앱          | 렌더링          | 번들   | gzip    |
| ----------- | --------------- | ------ | ------- |
| tic-tac-toe | React DOM       | 145 KB | 46.9 KB |
| alkkagi     | Canvas + matter | 236 KB | 75.3 KB |
| archery     | Canvas + matter | 236 KB | 75.5 KB |

matter.js는 틱택토 번들에 1바이트도 들어가지 않는다.

물리 엔진 설정이 정반대인 두 게임(알까기는 중력 0의 위에서 본 시점, 양궁은
중력 1의 옆에서 본 시점)이 같은 페이지에 동시에 떠 있어도 서로 간섭하지 않는다.
각 게임이 자기 `Engine` 인스턴스를 갖기 때문이다.

## React 셸 + 게임 코어

캔버스 게임도 React 앱 안에 산다. 화면 골격·HUD·결과 모달은 React가, 게임
루프는 캔버스가 맡는다. 둘의 접점은 [`GameCanvas`](../packages/ui/src/GameCanvas.tsx)
하나뿐이다.

```tsx
const handleMount = useCallback((stage: CanvasStage) => {
  const game = new AlkkagiGame({ stage, onChange: setSnapshot })
  return () => game.destroy() // ← 정리를 빠뜨리면 안 된다
}, [])
```

**이 정리 함수가 이 구조의 핵심이다.** 이전 레포는 React가 정적 JSX만 뿌리고
게임 코드가 `getElementById`로 그 DOM을 직접 조작했다. 개발 모드의 StrictMode는
effect를 마운트 → 언마운트 → 재마운트 시키는데, DOM 노드는 살아 있으니 첫 실행이
붙인 리스너가 그대로 남아 두 번 등록됐다. 그 결과 죽은 클로저가 먼저 응답해서
사용자가 고른 펫이 무시되고 항상 기본값이 선택되는 버그가 났다.

지금 구조에서는 캔버스를 `CanvasStage`가 소유하고 정리 책임이 한 곳에 모인다.
게임 클래스는 `destroy()`에서 자기가 만든 루프와 리스너를 전부 떼면 된다.

## 물리 코드를 쓸 때 알아야 할 것

matter.js 관련해 실제로 겪은 함정 두 가지를 기록해 둔다.

**`applyForce` 대신 `setVelocity`를 쓴다.** matter.js의 힘은 질량과 타임스텝
제곱에 얽혀 있어 "얼마나 세게"가 직관적으로 잡히지 않는다. 초안에서 알까기 돌이
한 프레임에 2391px를 날아가 상대 돌을 그대로 관통했다. 튕기기·쏘기처럼 순간
속도를 주는 동작은 속도를 직접 지정하는 편이 예측 가능하다.

**한 스텝 이동 거리를 물체 지름 아래로 제한한다.** matter.js에는 연속 충돌
검사(CCD)가 없다. 한 스텝에 지름보다 멀리 움직이면 물체끼리 그냥 통과한다.
알까기 돌 반지름이 24이므로 최대 속도를 17로 잡았다.

계수는 추측하지 말고 브라우저에서 실측해서 정한다. 각 게임의 상수 주석에 그
근거를 남겨 두었다.

## Phantom dependency 주의

Yarn workspaces는 의존성을 루트로 호이스팅한다. 그래서 `package.json`에 선언하지
않은 패키지를 import 해도 로컬에서는 멀쩡히 동작하다가 배포에서 터진다.

**쓰는 패키지는 반드시 해당 `package.json`에 선언한다.** CI가
`yarn install --immutable`로 도는 것도 이 때문이다.
