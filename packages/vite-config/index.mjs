import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

/**
 * 모든 앱이 공유하는 Vite 설정.
 *
 * 앱마다 vite.config.ts를 복붙하면 어느 순간 한 앱만 설정이 뒤처진다.
 * 실제로 예전 레포에서 5개 앱의 vite.config.ts가 바이트 단위로 동일한
 * 복사본이었고, 스마트 TV 대응(legacy)을 넣을 때 전부 손으로 고쳐야 했다.
 * 그래서 설정은 여기 한 곳에만 두고 앱은 호출만 한다.
 *
 * @param {{ base?: string, port?: number, extraPlugins?: import('vite').PluginOption[] }} [options]
 * @returns {import('vite').UserConfig}
 */
export function createAppConfig(options = {}) {
  const { base = '/', port, extraPlugins = [] } = options

  return defineConfig({
    base,
    plugins: [
      react(),
      // 스마트 TV 내장 브라우저 등 구형 엔진은 <script type="module">을
      // 해석하지 못해 앱이 아예 실행되지 않는다. legacy()가 ES5 nomodule
      // 폴백 번들을 함께 만들어 그런 환경에서도 스크립트가 돌게 한다.
      legacy({ targets: ['defaults', 'not IE 11'] }),
      ...extraPlugins,
    ],
    server: port ? { port, host: true } : { host: true },
    build: {
      target: 'es2015',
      minify: 'terser',
      // 게임은 대개 단일 화면이라 청크를 잘게 쪼개봐야 요청 수만 늘어난다.
      chunkSizeWarningLimit: 1200,
    },
  })
}
