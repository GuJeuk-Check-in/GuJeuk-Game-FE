import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  // 스마트 TV 등 내장 브라우저는 <script type="module">을 이해하지 못해 앱이
  // 아예 실행되지 않는 경우가 있다. legacy()가 ES5 nomodule 폴백 번들을
  // 함께 만들어 그런 브라우저에서도 스크립트가 실행되게 한다.
  plugins: [react(), legacy({ targets: ['defaults', 'not IE 11'] })],
})
