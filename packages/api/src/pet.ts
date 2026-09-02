import { ApiError } from './client'
import type { ApiClient } from './client'

/**
 * 서버에 있는 세이브 한 벌.
 *
 * `save` 가 `unknown` 인 것은 **이 패키지가 펫타운의 타입을 알면 안 되기
 * 때문이다**(ARCHITECTURE.md 의 계층 표). 실제 타입은 앱이 받아서 자기
 * save.ts 로 검증한다 — 서버에서 온 값도 손상된 로컬 세이브와 똑같이 다뤄야
 * 안전하다. 서버는 세이브를 해석하지 않으므로(명세 §6) 모양을 보증하지 않는다.
 */
export interface PetSnapshot {
  save: unknown
  /** 마지막으로 서버에 반영된 시각(epoch 밀리초). 다음 올리기의 baseSyncedAt 이다. */
  syncedAt: number
}

export interface PetSyncResult {
  syncedAt: number
}

/**
 * 409 — 서버에 더 최근 진행이 있다.
 *
 * **서버 상태를 들고 있다.** 충돌은 사용자에게 "어느 쪽을 쓸까요"를 물어야 하는
 * 상황이고, 그 화면을 그리는 데 필요한 값이 이미 응답에 실려 있다. 한 번 더
 * 받으러 가게 하면 그 사이에 또 바뀔 수 있어 물어본 것과 고른 것이 달라진다.
 *
 * ApiError 를 상속하므로 status·message 를 보는 기존 처리는 그대로 통한다.
 */
export class PetConflictError extends ApiError {
  constructor(
    readonly server: PetSnapshot,
    message: string,
    body?: unknown,
  ) {
    super(409, message, body)
    this.name = 'PetConflictError'
  }
}

/**
 * 응답 본문에서 서버 상태를 꺼낸다. 모양이 아니면 null 이다.
 *
 * 여기서 걸러야 화면이 `server.syncedAt` 을 undefined 로 들고 다시 올리는 일이
 * 없다. 그렇게 되면 두 번째 올리기가 "처음 올리는 것"으로 보여 또 충돌한다.
 */
function readSnapshot(value: unknown): PetSnapshot | null {
  if (typeof value !== 'object' || value === null) return null
  if (!('save' in value) || !('syncedAt' in value)) return null

  const syncedAt = (value as { syncedAt: unknown }).syncedAt
  if (typeof syncedAt !== 'number' || !Number.isFinite(syncedAt)) return null

  return { save: (value as { save: unknown }).save, syncedAt }
}

/**
 * 펫 세이브 백업 엔드포인트.
 *
 * 경로 문자열은 이 파일에만 둔다(auth.ts 와 같은 이유 — 서버에서 경로를 바꿀 때
 * 앱마다 찾아다니지 않기 위해서다). 주인은 언제나 토큰이 정하므로 회원을
 * 인자로 받지 않는다.
 */
export function createPetApi(client: ApiClient) {
  return {
    /**
     * 서버에 있는 세이브. **없으면 null 이고 에러가 아니다.**
     *
     * 404 는 방금 가입한 사람의 정상 상태다. 에러로 올리면 부르는 쪽마다
     * "이 404 는 괜찮은 404 인가"를 다시 판단하게 된다.
     */
    get: async (): Promise<PetSnapshot | null> => {
      try {
        return await client.get<PetSnapshot>('/pet')
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 404) return null
        throw caught
      }
    },

    /**
     * 세이브를 통째로 올린다. 처음 올릴 때 `baseSyncedAt` 은 null 이다.
     *
     * 충돌이면 PetConflictError 를 던진다. 조용히 덮어쓰지 않는 것이 규약이다
     * (명세 §5) — 어느 쪽이 최신인지는 서버도 이 함수도 판단하지 않는다.
     */
    put: async (save: unknown, baseSyncedAt: number | null): Promise<PetSyncResult> => {
      try {
        return await client.request<PetSyncResult>('PUT', '/pet', { save, baseSyncedAt })
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 409) {
          const body = caught.body as { server?: unknown } | undefined
          const server = readSnapshot(body?.server)
          // 모양이 아니면 그냥 원래 에러를 올린다. 없는 값으로 선택지를 그리느니
          // 실패로 보이는 편이 낫다.
          if (server) throw new PetConflictError(server, caught.message, caught.body)
        }
        throw caught
      }
    },

    /** 서버에 남은 내 펫을 지운다. 원래 없어도 성공이다(멱등). */
    remove: (): Promise<void> => client.del<void>('/pet'),
  }
}

export type PetApi = ReturnType<typeof createPetApi>
