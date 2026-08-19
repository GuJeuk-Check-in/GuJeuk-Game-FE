import { createConfig } from '@gujuck/eslint-config'

// layer가 이 패키지에서 금지되는 import를 결정한다.
// 규칙 자체는 packages/eslint-config/index.mjs 한 곳에만 있다.
export default createConfig({ layer: 'api' })
