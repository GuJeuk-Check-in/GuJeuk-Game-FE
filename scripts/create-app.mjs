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
if (useCanvas) write(`src/game/${pascal(slug)}Game.ts`, canvasGame())

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
        buildCommand: `yarn turbo build --filter=@gujuck/${slug}`,
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
  return `import { GameShell } from '@gujuck/ui'
import './App.css'

export default function App() {
  return (
    <GameShell header={<div className="app-title">${title}</div>}>
      <div className="app-body">여기에 게임을 만드세요.</div>
    </GameShell>
  )
}
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
`
}
