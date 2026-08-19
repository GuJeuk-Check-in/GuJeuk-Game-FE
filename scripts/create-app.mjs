#!/usr/bin/env node
/**
 * 새 게임 앱을 컨벤션에 맞게 생성한다.
 *
 *   yarn create:app <slug> "<화면에 보일 이름>" [--canvas]
 *
 * 예)
 *   yarn create:app omok "오목"
 *   yarn create:app curling "컬링" --canvas
 *
 * 손으로 폴더를 복사하면 어느 순간 한 앱만 설정이 뒤처진다. 예전 레포에서
 * vite.config.ts가 5벌로 갈라졌던 것도 그래서였다. 새 앱은 항상 이 스크립트로
 * 만들어 같은 tsconfig·eslint·vite 설정을 상속받게 한다.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const appsDir = join(repoRoot, 'apps')

const args = process.argv.slice(2)
const useCanvas = args.includes('--canvas')
const [slug, title] = args.filter((a) => !a.startsWith('--'))

if (!slug || !title) {
  fail('사용법: yarn create:app <slug> "<이름>" [--canvas]')
}

if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
  fail(`slug는 소문자·숫자·하이픈만 쓸 수 있습니다: ${slug}`)
}

const appDir = join(appsDir, slug)
if (existsSync(appDir)) {
  fail(`이미 존재합니다: apps/${slug}`)
}

const port = nextPort()

write('package.json', packageJson())
write('tsconfig.json', tsconfig())
write('eslint.config.mjs', eslintConfig())
write('vite.config.ts', viteConfig())
write('index.html', indexHtml())
write('vercel.json', vercelJson())
write('src/main.tsx', mainTsx())
write('src/vite-env.d.ts', '/// <reference types="vite/client" />\n')
write('src/App.tsx', useCanvas ? canvasApp() : reactApp())
write('src/App.css', appCss())
write('README.md', appReadme())

if (useCanvas) {
  // 캔버스 게임은 게임 클래스가 상태를 갖는다. (참조: apps/alkkagi)
  write(`src/game/${pascal(slug)}Game.ts`, canvasGame())
} else {
  // DOM 게임은 types → rules → useGame → App 3계층. (참조: apps/tic-tac-toe)
  write('src/game/types.ts', domTypes())
  write('src/game/rules.ts', domRules())
  write('src/game/useGame.ts', domUseGame())
}

formatGenerated()

console.log(`\n✅ apps/${slug} 생성 완료 (포트 ${port})\n`)
console.log('다음 단계:')
console.log('  1. yarn install')
console.log(`  2. yarn workspace @gujuck/${slug} dev`)
console.log(`  3. Vercel에 프로젝트를 만들고 GitHub 시크릿 VERCEL_PROJECT_ID_${envKey()} 추가`)
console.log(`  4. .github/workflows/ci.yml 의 matrix.app 에 다음 줄 추가:`)
console.log(`       - { slug: ${slug}, secret: ${envKey()} }`)
console.log(`  5. 허브에 노출하려면 apps/home/src/games.ts 에 항목 추가\n`)

// ---------------------------------------------------------------------------

function write(relative, content) {
  const target = join(appDir, relative)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
  console.log(`  + apps/${slug}/${relative}`)
}

function fail(message) {
  console.error(`\n❌ ${message}\n`)
  process.exit(1)
}

/**
 * 생성한 파일에 Prettier를 돌린다.
 *
 * 템플릿을 손으로 포맷에 맞추면 규칙이 바뀔 때마다 또 어긋난다. 실제로
 * JSON.stringify는 짧은 배열도 항상 여러 줄로 펼치는데 Prettier는 한 줄로
 * 두기 때문에, 생성 직후 CI의 format:check가 실패했다. 결과물을 그냥
 * 포매터에 통과시키는 편이 확실하다.
 */
function formatGenerated() {
  try {
    execFileSync('yarn', ['prettier', '--write', '--log-level', 'warn', `apps/${slug}`], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
  } catch {
    console.warn('\n⚠️  Prettier 실행에 실패했습니다. `yarn format`을 직접 돌려주세요.')
  }
}

function envKey() {
  return slug.toUpperCase().replaceAll('-', '_')
}

function pascal(value) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** 기존 앱들이 쓰는 포트를 훑어 다음 빈 번호를 고른다. 충돌하면 동시에 못 띄운다. */
function nextPort() {
  let max = 5169
  for (const name of readdirSync(appsDir)) {
    const config = join(appsDir, name, 'vite.config.ts')
    if (!existsSync(config)) continue
    const match = readFileSync(config, 'utf8').match(/port:\s*(\d+)/)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max + 1
}

function packageJson() {
  const deps = {
    '@gujuck/ui': 'workspace:*',
    react: '^18.3.1',
    'react-dom': '^18.3.1',
  }
  if (useCanvas) {
    deps['@gujuck/game-core'] = 'workspace:*'
    deps['matter-js'] = '^0.20.0'
  }

  const devDeps = {
    '@gujuck/eslint-config': 'workspace:*',
    '@gujuck/tsconfig': 'workspace:*',
    '@gujuck/vite-config': 'workspace:*',
    '@types/react': '^18.3.12',
    '@types/react-dom': '^18.3.1',
    eslint: '^9.17.0',
    typescript: '^5.6.3',
    vite: '^5.4.11',
  }
  if (useCanvas) devDeps['@types/matter-js'] = '^0.19.7'

  const sort = (obj) =>
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))

  return (
    JSON.stringify(
      {
        name: `@gujuck/${slug}`,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'tsc --noEmit && vite build',
          preview: 'vite preview',
          typecheck: 'tsc --noEmit',
          lint: 'eslint .',
        },
        dependencies: sort(deps),
        devDependencies: sort(devDeps),
      },
      null,
      2,
    ) + '\n'
  )
}

function tsconfig() {
  return (
    JSON.stringify(
      { extends: '@gujuck/tsconfig/react.json', include: ['src', 'vite.config.ts'] },
      null,
      2,
    ) + '\n'
  )
}

function eslintConfig() {
  return [
    "import { createConfig } from '@gujuck/eslint-config'",
    '',
    '// layer가 이 패키지에서 금지되는 import를 결정한다.',
    '// 규칙 자체는 packages/eslint-config/index.mjs 한 곳에만 있다.',
    "export default createConfig({ layer: 'app' })",
    '',
  ].join('\n')
}

function viteConfig() {
  return [
    "import { createAppConfig } from '@gujuck/vite-config'",
    '',
    `export default createAppConfig({ port: ${port} })`,
    '',
  ].join('\n')
}

function vercelJson() {
  return (
    JSON.stringify(
      {
        // 반드시 corepack을 거친다. Vercel 빌드 이미지에는 Yarn 1.22가 기본으로
        // 깔려 있어서 맨 `yarn`을 쓰면 Yarn 1이 잡히고, packageManager 필드를
        // 모르는 Yarn 1은 `yarn turbo`를 "turbo 스크립트 실행"으로 해석해
        // Command "turbo" not found 로 즉시 죽는다. (실제로 겪은 배포 실패)
        buildCommand: `corepack yarn turbo build --filter=@gujuck/${slug}`,
        outputDirectory: `apps/${slug}/dist`,
        installCommand: 'corepack yarn install --immutable',
        framework: null,
      },
      null,
      2,
    ) + '\n'
  )
}

function indexHtml() {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <!-- viewport-fit=cover 가 있어야 env(safe-area-inset-*)가 실제 값을 갖는다.
         이게 없으면 노치 기기에서 셸의 상하단 패딩이 항상 0이 된다. -->
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"
    />
    <meta name="theme-color" content="#0f1420" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
}

function mainTsx() {
  return `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@gujuck/ui/styles.css'
import App from './App'

const container = document.getElementById('root')
if (!container) throw new Error('#root 를 찾을 수 없습니다.')

// StrictMode는 개발 모드에서 effect를 두 번 실행해 정리 누락을 드러낸다.
// 캔버스 게임에서 리스너·루프를 안 떼면 여기서 바로 티가 나므로 켜 둔다.
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`
}

function reactApp() {
  return `import { GameShell, ResultOverlay } from '@gujuck/ui'
import { useGame } from './game/useGame'
import './App.css'

/**
 * 화면.
 *
 * 게임 규칙을 몰라야 한다. 판정은 game/rules.ts, 상태 전이는 game/useGame.ts.
 * 화면 골격은 반드시 GameShell을 쓴다 — 100dvh와 safe-area 처리가 들어 있어
 * 노치 기기에서 상하단이 잘리지 않는다. 직접 100vh를 쓰지 않는다.
 */
export default function App() {
  const game = useGame()

  return (
    <GameShell
      header={<div className="app-title">${title}</div>}
      footer={<div className="app-status">점수 {game.state.score}</div>}
    >
      <div className="app-body">
        {/* TODO: 게임 화면을 만든다. 클래스 이름에는 앱 접두사를 붙인다. */}
        여기에 게임을 만드세요.
      </div>

      <ResultOverlay
        open={game.state.status === 'finished'}
        title={\`\${game.state.score}점\`}
        primaryLabel="다시 하기"
        onPrimary={game.reset}
      />
    </GameShell>
  )
}
`
}

function domTypes() {
  return `/**
 * 게임의 타입 계약.
 *
 * 규칙(rules.ts)과 화면(App.tsx)이 공유하는 어휘를 여기 모은다.
 * React도 브라우저 API도 등장하지 않는다 — 타입만 있다.
 */

export type Status = 'ready' | 'playing' | 'finished'

/** 한 판의 상태. 게임에 맞게 필드를 채운다. */
export interface GameState {
  status: Status
  score: number
}
`
}

function domRules() {
  return `import type { GameState } from './types'

/**
 * 게임 규칙. 순수 함수만 둔다.
 *
 * · React를 import 하지 않는다. 상태 관리는 useGame.ts가 맡는다.
 * · DOM을 만지지 않는다. 화면은 App.tsx가 맡는다.
 * · 부수효과를 만들지 않는다. 같은 입력이면 항상 같은 출력이어야 한다.
 *
 * 이렇게 두면 규칙만 따로 테스트할 수 있고, 나중에 서버에서 같은 판정을
 * 해야 할 때(점수 위조 방지 등) 이 파일을 그대로 옮길 수 있다.
 */

export function createInitialState(): GameState {
  return { status: 'ready', score: 0 }
}

// TODO: 판정·점수 계산 등 규칙을 순수 함수로 추가한다.
//       참조 구현: apps/tic-tac-toe/src/game/rules.ts
`
}

function domUseGame() {
  return `import { useCallback, useState } from 'react'
import { createInitialState } from './rules'
import type { GameState } from './types'

export interface GameApi {
  state: GameState
  start: () => void
  reset: () => void
}

/**
 * 규칙과 화면을 잇는 상태 계층.
 *
 * 규칙(rules.ts)은 React를 몰라야 하고, 화면(App.tsx)은 상태 전이 규칙을
 * 몰라야 한다. 그 사이를 이 훅이 메운다. 화면은 GameApi만 알면 되므로
 * 나중에 화면을 갈아엎어도 게임은 그대로 동작한다.
 *
 * 타이머·구독을 만들면 useEffect의 정리 함수에서 반드시 해제한다.
 * 참조 구현: apps/tic-tac-toe/src/game/useGame.ts
 */
export function useGame(): GameApi {
  const [state, setState] = useState<GameState>(createInitialState)

  const start = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'playing' }))
  }, [])

  const reset = useCallback(() => {
    setState(createInitialState())
  }, [])

  return { state, start, reset }
}
`
}

function appReadme() {
  const kind = useCanvas ? '캔버스' : 'DOM'
  const reference = useCanvas ? 'apps/alkkagi' : 'apps/tic-tac-toe'
  return `# ${title}

${kind} 기반 게임. \`yarn create:app\`으로 생성된 골격이다.

구조와 지켜야 할 규칙은 참조 구현을 따른다: [\`${reference}\`](../${reference.replace('apps/', '')})

- [아키텍처](../../docs/ARCHITECTURE.md) — 계층 규칙과 그 근거
- [컨벤션](../../docs/CONVENTIONS.md) — 코드 스타일, 커밋, 의존성 추가

## 개발

\`\`\`bash
yarn workspace @gujuck/${slug} dev
\`\`\`

## 검사

\`\`\`bash
yarn workspace @gujuck/${slug} lint
yarn workspace @gujuck/${slug} typecheck
yarn workspace @gujuck/${slug} build
\`\`\`

\`lint\`는 계층 간 import 규칙도 강제한다. 다른 앱을 import 하거나 공유 계층에
엔진 의존성을 넣으면 이유와 함께 실패한다.
`
}

function canvasApp() {
  const cls = pascal(slug) + 'Game'
  return `import { useCallback, useRef } from 'react'
import { GameCanvas, GameShell } from '@gujuck/ui'
import type { CanvasStage } from '@gujuck/game-core'
import { ${cls} } from './game/${cls}'
import './App.css'

export default function App() {
  const gameRef = useRef<${cls} | null>(null)

  // GameCanvas는 이 콜백을 마운트 시 한 번만 부른다. 돌려주는 함수에서
  // 게임을 확실히 정리해야 StrictMode 재마운트에서 루프가 두 벌 돌지 않는다.
  const handleMount = useCallback((stage: CanvasStage) => {
    const game = new ${cls}(stage)
    gameRef.current = game

    return () => {
      game.destroy()
      gameRef.current = null
    }
  }, [])

  return (
    <GameShell header={<div className="app-title">${title}</div>}>
      <GameCanvas onMount={handleMount} />
    </GameShell>
  )
}
`
}

function canvasGame() {
  const cls = pascal(slug) + 'Game'
  return `import { GameLoop, PointerInput } from '@gujuck/game-core'
import type { CanvasStage } from '@gujuck/game-core'

/**
 * ${title}.
 *
 * 물리·렌더링 엔진에 의존하는 코드는 이 파일 아래에만 둔다.
 * @gujuck/game-core 로는 절대 올리지 않는다 — 그 엔진을 쓰지 않는 게임까지
 * 번들에 끌고 가게 되고, lint가 막는다.
 */
export class ${cls} {
  private readonly stage: CanvasStage
  private readonly loop: GameLoop
  private readonly input: PointerInput

  constructor(stage: CanvasStage) {
    this.stage = stage

    this.input = new PointerInput({
      target: stage.canvas,
      onDown: () => {},
    })

    this.loop = new GameLoop({
      update: () => this.update(),
      render: () => this.render(),
    })
    this.loop.start()
  }

  /** 생성한 루프·리스너는 반드시 여기서 전부 정리한다. */
  destroy(): void {
    this.loop.destroy()
    this.input.destroy()
  }

  private update(): void {
    // 고정 타임스텝으로 호출된다. 물리·로직은 여기에.
  }

  private render(): void {
    this.stage.fill('#0f1420')
  }
}
`
}

function appCss() {
  return `.app-title {
  font-size: 18px;
  font-weight: 800;
}

.app-body {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--gj-text-dim);
}

.app-status {
  text-align: center;
  color: var(--gj-text-dim);
  font-size: 14px;
  font-weight: 600;
}
`
}
