import { tokenStore } from './token'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiClientOptions {
  /** 예: https://api.example.com — 앱의 VITE_API_BASE에서 주입한다. */
  baseUrl: string
  /** 응답이 401일 때 호출. 보통 토큰을 지우고 로그인 화면으로 돌린다. */
  onUnauthorized?: () => void
}

export interface ApiClient {
  request<T>(method: string, path: string, body?: unknown): Promise<T>
  get<T>(path: string): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
  del<T>(path: string): Promise<T>
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl, onUnauthorized } = options
  const root = baseUrl.replace(/\/$/, '')

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const token = tokenStore.get()
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${root}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    if (res.status === 401) {
      tokenStore.clear()
      onUnauthorized?.()
      throw new ApiError(401, '인증이 만료되었습니다. 다시 로그인해 주세요.')
    }

    // 204 No Content나 빈 본문에 res.json()을 호출하면 파싱 에러가 난다.
    const text = await res.text()
    const parsed: unknown = text ? safeParse(text) : undefined

    if (!res.ok) {
      const message = extractMessage(parsed) ?? `요청에 실패했습니다. (${res.status})`
      throw new ApiError(res.status, message, parsed)
    }

    return parsed as T
  }

  return {
    request,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    del: (path) => request('DELETE', path),
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractMessage(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message: unknown }).message
    if (typeof message === 'string') return message
  }
  return undefined
}
