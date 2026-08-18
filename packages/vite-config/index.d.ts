import type { UserConfig, PluginOption } from 'vite'

export interface CreateAppConfigOptions {
  /** 서브경로 배포 시 지정. 기본 '/' */
  base?: string
  /** 개발 서버 포트. 앱마다 다르게 주면 동시에 띄울 수 있다. */
  port?: number
  /** 앱 전용으로 더 붙일 플러그인 */
  extraPlugins?: PluginOption[]
}

export declare function createAppConfig(options?: CreateAppConfigOptions): UserConfig
