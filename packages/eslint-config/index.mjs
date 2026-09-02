import js from '@eslint/js'
import ts from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

/**
 * 렌더링·물리 엔진 목록.
 *
 * 앞으로 어떤 엔진을 고르든 공통 계층에는 들어오면 안 되므로, 지금 안 쓰는
 * 것까지 미리 막아둔다. 새 엔진을 도입하면 여기에 한 줄 추가하면 된다.
 */
const RENDER_ENGINES = [
  'matter-js',
  'planck-js',
  'cannon-es',
  'phaser',
  'pixi.js',
  'three',
  'p2-es',
  'box2d-wasm',
]

const REACT_PACKAGES = ['react', 'react-dom', 'react/*', 'react-dom/*']

/**
 * 계층별로 금지되는 import.
 *
 * 이 표가 아키텍처의 실제 강제 지점이다. README에 적어둔 규칙은 지켜지지
 * 않지만, 여기 적힌 규칙은 lint가 막는다.
 */
const LAYER_RULES = {
  // 엔진 중립 순수 TS. 무엇에도 묶이면 안 된다.
  core: [
    {
      group: REACT_PACKAGES,
      message: 'game-core는 엔진 중립이어야 합니다. React에 묶인 코드는 @gujuck/ui로 보내세요.',
    },
    {
      group: RENDER_ENGINES,
      message:
        'game-core에 물리·렌더링 엔진이 들어오면 그 엔진을 쓰지 않는 게임까지 번들에 끌고 갑니다. 게임 앱 안에 두세요.',
    },
    {
      group: ['@gujuck/ui', '@gujuck/api'],
      message: 'game-core는 가장 아래 계층입니다. 상위 패키지를 참조할 수 없습니다.',
    },
  ],

  // 백엔드 연동. 프레임워크·엔진과 무관해야 서버 검증 로직에도 재사용된다.
  api: [
    {
      group: REACT_PACKAGES,
      message: 'api는 프레임워크 무관해야 합니다. React 상태 연결은 앱에서 하세요.',
    },
    {
      group: RENDER_ENGINES,
      message: 'api에 렌더링·물리 엔진이 들어올 이유가 없습니다.',
    },
    {
      group: ['@gujuck/ui', '@gujuck/game-core'],
      message: 'api는 독립 계층입니다. 다른 공유 패키지를 참조하지 마세요.',
    },
  ],

  // React 전용 공통 UI. game-core까지는 참조 가능.
  ui: [
    {
      group: RENDER_ENGINES,
      message: 'ui에 물리 엔진이 들어오면 모든 앱이 그 의존성을 갖게 됩니다. 게임 앱 안에 두세요.',
    },
    {
      group: ['@gujuck/api'],
      message: 'ui는 백엔드를 몰라야 합니다. 데이터는 props로 받으세요.',
    },
  ],

  // 게임 앱. 무엇이든 쓸 수 있지만 다른 앱을 참조할 수는 없다.
  app: [
    {
      group: ['@gujuck/home', '@gujuck/tic-tac-toe', '@gujuck/alkkagi', '@gujuck/archery'],
      message:
        '앱끼리는 참조할 수 없습니다. 각 앱은 독립 빌드·배포 단위입니다. 공유할 코드는 packages/로 올리세요.',
    },
    {
      group: ['../../*'],
      message:
        '상대 경로로 앱 밖을 참조하지 마세요. 공유 코드는 @gujuck/* 패키지로 가져와야 합니다.',
    },
  ],
}

/**
 * @param {{ layer: 'core' | 'api' | 'ui' | 'app', react?: boolean }} options
 *   layer  이 패키지가 속한 계층. 금지 import 규칙이 여기서 갈린다.
 *   react  React를 쓰는 패키지면 true. ui와 app은 기본 true.
 * @returns {import('eslint').Linter.Config[]}
 */
export function createConfig(options) {
  const { layer } = options
  const useReact = options.react ?? (layer === 'ui' || layer === 'app')
  const restricted = LAYER_RULES[layer]

  if (!restricted) {
    throw new Error(
      `[@gujuck/eslint-config] 알 수 없는 layer: ${layer}. core | api | ui | app 중 하나여야 합니다.`,
    )
  }

  return [
    { ignores: ['dist/**', 'node_modules/**', '*.config.*'] },

    js.configs.recommended,
    ...ts.configs.recommended,

    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        ecmaVersion: 2022,
        globals: globals.browser,
      },
      rules: {
        'no-restricted-imports': ['error', { patterns: restricted }],

        // 미사용 변수는 오타이거나 지우다 만 코드다. _ 접두사만 예외로 둔다.
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],

        // 타입 붕괴의 시작점. 정말 필요하면 주석과 함께 개별 비활성화한다.
        '@typescript-eslint/no-explicit-any': 'error',

        // 게임 루프에서 정리 함수를 빠뜨리면 리스너가 중첩된다. 함수형 규칙은
        // 아니지만 == 비교 같은 미묘한 버그는 미리 막는다.
        eqeqeq: ['error', 'always'],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
      },
    },

    // 에셋·빌드 도구는 브라우저가 아니라 Node 에서 돈다.
    //
    // 앱 소스에는 globals.browser 를 주는데, 같은 앱 안의 tools/*.mjs 는 CLI 라
    // process·console·Buffer 가 전부 미정의로 잡힌다. 여기서 한 번 선언해 두면
    // 앱마다 자기 eslint.config.mjs 에 같은 예외를 복붙하지 않아도 된다 —
    // 설정이 갈라지는 것이 이 패키지가 막으려는 문제다.
    //
    // no-console 을 끄는 이유: 이 스크립트들에게는 stdout 이 결과를 내보내는
    // 유일한 통로다. 앱 코드에서는 그대로 경고로 남는다.
    {
      files: ['tools/**/*.mjs', 'scripts/**/*.mjs'],
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        globals: globals.node,
      },
      rules: {
        'no-console': 'off',
        eqeqeq: ['error', 'always'],
      },
    },

    ...(useReact
      ? [
          {
            files: ['**/*.{ts,tsx}'],
            plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
            rules: {
              ...reactHooks.configs.recommended.rules,
              'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            },
          },
        ]
      : []),

    // 포매팅 규칙은 Prettier가 담당한다. 둘이 겹치면 저장할 때마다 싸운다.
    prettier,
  ]
}
