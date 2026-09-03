import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@gujuck/ui/styles.css'
import { GameMusic } from '@gujuck/ui'
import App from './App'

const container = document.getElementById('root')
if (!container) throw new Error('#root 를 찾을 수 없습니다.')

// StrictMode는 개발 모드에서 effect를 두 번 실행해 정리 누락을 드러낸다.
// 캔버스 게임에서 리스너·루프를 안 떼면 여기서 바로 티가 나므로 켜 둔다.
createRoot(container).render(
  <StrictMode>
    <div data-gj-theme="candy">
      <GameMusic theme="strategy" />
      <App />
    </div>
  </StrictMode>,
)
