// Vercel의 각 게임 프로젝트(Root Directory=".")가 전부 이 레포 루트의 vercel.json
// 하나를 공유하기 때문에, 정적으로 "어떤 앱을 빌드할지" 고정해두면 나머지 프로젝트가
// 전부 그 앱만 서빙하게 된다 (실제로 pet-game 고정 설정 때문에 발생한 사고).
//
// Vercel은 빌드 중 VERCEL_PROJECT_ID 환경변수로 "지금 빌드 중인 프로젝트"를 알려주므로,
// 이 스크립트가 그 값을 보고 해당 프로젝트에 맞는 앱만 빌드해서 outputDirectory(dist)에
// 복사한다. vercel.json의 outputDirectory는 항상 "dist" 고정, buildCommand만 이 스크립트로.
import { execSync } from 'node:child_process'
import { existsSync, rmSync, cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

// apps/*/.vercel/project.json 에서 확인한 프로젝트 ID
const PROJECTS = {
  prj_eBbCL6kHaiOjEacCrAbH75YDPyay: { pkg: '@gujuck/pet-game', dir: 'apps/pet-game' },
  prj_SVMgzL65DntMMxAPviz5rBxaoF4i: { pkg: '@gujuck/run-game', dir: 'apps/run-game' },
  prj_TuTAyYAz3qeJotEBg7Qjbuo05PXj: { pkg: '@gujuck/tap-garden-game', dir: 'apps/tap-garden-game' },
  prj_fbYj0MQw3DgEVXbRWLkAfUS1CulG: { pkg: '@gujuck/strawberry-catch-game', dir: 'apps/strawberry-catch-game' },
}

const projectId = process.env.VERCEL_PROJECT_ID
const target = projectId && PROJECTS[projectId]

if (!target) {
  console.error(`[vercel-build] 알 수 없는 VERCEL_PROJECT_ID: ${projectId ?? '(없음)'}`)
  console.error('[vercel-build] scripts/vercel-build.mjs의 PROJECTS 맵에 프로젝트를 추가하세요.')
  process.exit(1)
}

console.log(`[vercel-build] ${projectId} → ${target.pkg} 빌드`)
execSync(`yarn turbo build --filter=${target.pkg}`, { cwd: repoRoot, stdio: 'inherit' })

const outDir = join(repoRoot, 'dist')
const srcDir = join(repoRoot, target.dir, 'dist')

if (!existsSync(srcDir)) {
  console.error(`[vercel-build] 빌드 결과가 없습니다: ${srcDir}`)
  process.exit(1)
}

rmSync(outDir, { recursive: true, force: true })
cpSync(srcDir, outDir, { recursive: true })
console.log(`[vercel-build] ${srcDir} → dist/ 복사 완료`)
