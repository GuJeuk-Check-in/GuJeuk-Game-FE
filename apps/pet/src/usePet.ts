import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PetConflictError } from '@gujuck/api'
import type { PetSnapshot } from '@gujuck/api'
import type { ElapsedReport, FoodId, FurnitureId, ItemId, PetSave } from './game/types'
import { applyElapsed } from './game/pet/stats'
import type { LoadResult } from './game/pet/save'
import {
  clearSave,
  createSave,
  loadSave,
  readServerSave,
  saveKey,
  writeSave,
} from './game/pet/save'
import type { ServerState } from './game/pet/sync'
import { clearSyncBase, readSyncBase, reconcile, syncKey, writeSyncBase } from './game/pet/sync'
import type { ActionOutcome } from './game/pet/actions'
import { feed, grantItem, pat, startSleep, wakeUp, wash } from './game/pet/actions'
import type { MinigameId } from './game/pet/economy'
import type { PlayCheck, Settlement } from './game/pet/minigames'
import { canPlay, settle } from './game/pet/minigames'
import type { PurchaseOutcome } from './game/pet/shop'
import { buy } from './game/pet/shop'
import type { DecorOutcome } from './game/pet/decor'
import { moveTo, pickUp, place } from './game/pet/decor'
import type { TutorialEvent } from './game/pet/tutorial'
import { advance, keepTutorialEnergy, skip, startTutorial } from './game/pet/tutorial'
import { petApi } from './api'
import { endSession } from './session'
import type { Session } from './session'

/**
 * 세이브를 들고 있는 유일한 곳.
 *
 * 규칙(stats · save)은 React 를 모르는 순수 모듈이고, 이 훅은 그것들을 화면에
 * 잇기만 한다. 감소율이나 상한 같은 수치는 여기에 한 줄도 적지 않는다 —
 * 적는 순간 economy.ts 가 유일한 출처가 아니게 된다.
 *
 * **서버가 정본이고 로컬은 이 세션의 캐시다**(PET_SERVER_API.md §10). 스탯
 * 계산은 매 프레임 도는 일이라 서버를 부를 수 없으므로, 로그인할 때 받아 와서
 * 로컬로 돌리고 주기적으로 올린다. 무엇을 정본으로 볼지 고르는 규칙은 sync.ts 에
 * 따로 있다 — 그 판단이 틀리면 진행이 사라지는데, fetch 와 섞여 있으면 테스트할
 * 수 없다.
 */

/** 주기 저장 간격. 명세 §10 의 "30초마다". 서버에 올리는 것도 이 자리다. */
const AUTOSAVE_INTERVAL_MS = 30_000

/**
 * 화면이 요청할 수 있는 돌봄 행동.
 *
 * 'sleep' 과 'wake' 를 나눈 것은 액션 함수가 둘로 나뉘어 있어서다(actions.ts).
 * 지금 자고 있는지 보고 어느 쪽을 부를지는 화면이 정한다 — 버튼 글자도 그
 * 판단으로 바뀌므로, 한 곳에서 정해야 글자와 동작이 어긋나지 않는다.
 */
export type ActionKind = 'feed' | 'wash' | 'pat' | 'sleep' | 'wake'

/**
 * 첫 화면이 무엇을 그려야 하는지.
 *
 * 'loading' 을 두는 이유가 중요하다. 서버에 물어보기 전에 세이브가 null 이라는
 * 것만 보고 이름 입력을 띄우면, **이미 펫이 있는 사람이 새 펫을 만들게 된다.**
 */
export type LoadPhase = 'loading' | 'ready' | 'retry'

/** 충돌을 만난 자리. 고르는 방법은 같고 물어보는 말이 다르다. */
export type ConflictWhen = 'load' | 'push'

/**
 * 한쪽 세이브를 알아볼 만큼만 요약한 것.
 *
 * 시각만으로는 고를 수 없다 — 두 저장이 같은 분에 일어나면 두 줄이 글자까지
 * 똑같아진다. 사람이 자기 진행을 알아보는 값은 레벨과 코인이다.
 */
export interface ConflictSide {
  level: number
  coins: number
  /** 그쪽에서 마지막으로 논 시각. */
  at: number
}

export interface ConflictPrompt {
  when: ConflictWhen
  /**
   * 서버 쪽 요약. **읽지 못했으면 null 이다.**
   *
   * 서버는 세이브를 해석하지 않고 보관만 하므로(§6) 모양을 보증하지 않는다.
   * 읽지 못하는 것을 미리 알면 "가져오기"를 눌러 보고 나서 실패하는 대신
   * 처음부터 그 선택지를 닫아 둘 수 있다.
   */
  server: ConflictSide | null
}

export type ConflictChoice = 'mine' | 'theirs'

export interface LogoutResult {
  ok: boolean
  /** 실패했을 때 사용자에게 그대로 보여줄 문구. 성공이면 null. */
  message: string | null
}

/**
 * 돌봄 행동이 튜토리얼에 알리는 사건.
 *
 * **상태를 보고 추측하지 않고 무슨 일이 있었는지를 넘긴다.** "청결이 100이면
 * 씻은 것"으로 판정하면 새 펫은 이미 청결 100 이라 3단계가 즉시 통과한다
 * (tutorial.ts 의 TutorialEvent 주석). 재우기·쓰다듬기는 어느 단계도 끝내지
 * 않으므로 null 이다.
 */
function tutorialEventFor(kind: ActionKind): TutorialEvent | null {
  switch (kind) {
    case 'feed':
      return 'fed'
    case 'wash':
      return 'washed'
    case 'pat':
    case 'sleep':
    case 'wake':
      return null
  }
}

/**
 * 종류에 맞는 액션 함수를 고른다.
 *
 * 훅 바깥에 두는 이유는 이 함수가 React 상태를 하나도 보지 않기 때문이다.
 */
function runAction(
  save: PetSave,
  kind: ActionKind,
  food: FoodId | undefined,
  now: number,
): ActionOutcome | null {
  switch (kind) {
    case 'feed':
      return food === undefined ? null : feed(save, food, now)
    case 'wash':
      return wash(save, now)
    case 'pat':
      return pat(save, now)
    case 'sleep':
      return startSleep(save, now)
    case 'wake':
      return wakeUp(save, now)
  }
}

export interface UsePetResult {
  save: PetSave | null
  report: ElapsedReport | null
  recovered: string | null
  /** 저장이 실패하고 있으면 사용자에게 보일 문구. 성공 중이면 null. */
  persistError: string | null
  start: (name: string) => void
  /**
   * 돌봄 행동을 한 번 한다. 세이브가 아직 없으면(이름 입력 전) null.
   *
   * 결과의 message 는 성공이든 거절이든 화면에 그대로 띄우면 된다. 거절 사유를
   * 화면이 다시 판단하지 않는다 — 규칙은 actions.ts 한 곳에만 있다.
   */
  act: (kind: ActionKind, food?: FoodId) => ActionOutcome | null
  /**
   * 지금 이 미니게임에 들어갈 수 있는가. 막히면 이유가 문장으로 들어 있다.
   *
   * 화면이 에너지를 직접 비교하지 않게 하려고 훅이 대신 물어봐 준다. 조건이 두
   * 곳에 적히면 "버튼은 눌리는데 정산이 거절하는" 상태가 만들어진다.
   */
  checkPlay: (game: MinigameId) => PlayCheck
  /**
   * 한 판이 끝났다. 에너지 차감과 보상 지급이 여기서 한 번에 일어난다.
   *
   * 결과를 그대로 돌려주므로 화면은 그 값을 카드에 옮기기만 하면 된다. 세이브가
   * 아직 없으면(이름 입력 전) null 이다.
   */
  finishGame: (game: MinigameId, score: number) => Settlement | null
  /**
   * 상점에서 하나 산다. 돈이 모자라면 거절이고 이유가 message 에 들어 있다.
   *
   * 성공하면 튜토리얼 5단계가 넘어간다 — 그 판단은 tutorial.ts 가 하고 여기서는
   * "샀다"는 사건만 넘긴다.
   */
  buyItem: (item: ItemId) => PurchaseOutcome | null
  /** 가방에서 꺼내 방에 놓는다. 좌표는 논리 픽셀 왼쪽 위. */
  placeFurniture: (item: FurnitureId, x: number, y: number) => DecorOutcome | null
  /** 이미 놓인 것을 옮긴다. */
  moveFurniture: (index: number, x: number, y: number) => DecorOutcome | null
  /** 방에서 빼서 가방으로 되돌린다. */
  pickUpFurniture: (index: number) => DecorOutcome | null
  /**
   * '확인'으로 넘어가는 단계를 넘긴다.
   *
   * 사건 이름을 화면이 고르지 않게 이 한 함수만 내보낸다. 나머지 사건(먹임 ·
   * 씻김 · 놀았음 · 삼)은 그 행동을 한 함수가 스스로 알린다.
   */
  confirmTutorial: () => void
  /** 남은 단계를 건너뛴다. 건너뛸 수 있는지의 판단은 tutorial.ts 의 canSkip 이 한다. */
  skipTutorial: () => void
  /**
   * 튜토리얼이 방금 끝난 순간의 시각. 아직이면 null.
   *
   * 값이 바뀌는 것 자체가 신호다. 화면은 이 값이 생길 때 완료 연출을 한 번
   * 띄운다 — done 플래그를 보면 새로고침할 때마다 다시 축하한다.
   */
  tutorialFinishedAt: number | null
  /** 개발 전용 시간 점프. M1 완료 기준을 손으로 확인하는 수단이다. */
  jump: (ms: number) => void
  /**
   * 개발 전용 물건 지급.
   *
   * M4 에서 상점이 열려 코인으로 살 수 있게 됐지만 이 경로는 남긴다. 돌봄 규칙만
   * 확인하려는데 매번 미니게임으로 코인을 벌어야 하면 확인 한 번이 몇 분짜리가 된다.
   */
  grant: (item: ItemId, count: number) => void
  dismissReport: () => void
  /**
   * 첫 화면을 무엇으로 그릴지. 'loading' 동안에는 아무것도 판단하지 않는다.
   *
   * save 가 null 인 것만 보고 이름 입력을 띄우면 **이미 펫이 있는 사람이 새
   * 펫을 만든다.** 서버에 물어보기 전에는 없는 것인지 아직 모르는 것인지
   * 구분되지 않는다.
   */
  phase: LoadPhase
  /** 로컬과 서버가 갈라졌다. 자동으로 합치지 않고 사람이 고른다(§5). */
  conflict: ConflictPrompt | null
  /** 서버에 올리지 못하고 있으면 사용자에게 보일 문구. 성공 중이면 null. */
  syncError: string | null
  /**
   * 충돌을 사람이 고른 대로 정리한다.
   *
   * 'mine' 은 서버가 알려준 시각을 기준으로 다시 올린다 — 그 요청은 통과한다.
   * 'theirs' 는 서버 것을 받아 로컬을 갈아 끼운다.
   */
  resolveConflict: (choice: ConflictChoice) => Promise<void>
  /**
   * 로그아웃. **올리고 나서 지운다.**
   *
   * 올리지 못하면 지우지 않고 실패를 돌려준다. 순서를 뒤집으면 진행이
   * 사라지고, 지우지 않고 두면 다음 사람이 그 펫을 본다(§10).
   */
  logout: () => Promise<LogoutResult>
  /** 서버를 못 만나 시작하지 못했을 때 다시 시도한다. */
  retryLoad: () => void
}

/**
 * localStorage 는 접근 자체가 던질 수 있다(사파리 사생활 보호 모드, 쿠키 차단).
 * 저장을 못 하더라도 화면은 떠야 하므로 여기서 삼키고 null 을 돌린다.
 */
function getStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const PERSIST_FAILED = '진행이 저장되지 않고 있어요. 저장 공간이 가득 찼거나 저장이 막혀 있습니다.'

/** 화면을 막지 않는 문구다. 서버가 죽어도 이미 로그인한 세션은 로컬로 돈다(§10). */
const SYNC_FAILED =
  '서버에 진행을 올리지 못하고 있어요. 놀 수는 있지만 나가기 전에 꼭 다시 시도해 주세요.'

const SERVER_SAVE_BROKEN = '서버에 있던 세이브를 읽지 못했어요. 이 기기의 진행을 그대로 씁니다.'

const SERVER_SAVE_UNREADABLE =
  '서버에 있던 세이브를 읽지 못했어요. 서버 쪽은 지우지 않았으니 새로 시작해도 됩니다.'

const LOGOUT_BUSY = '진행을 올리는 중이에요. 잠시 후에 다시 눌러 주세요.'

const LOGOUT_FAILED =
  '진행을 서버에 올리지 못해서 나가지 않았어요. 연결을 확인하고 다시 눌러 주세요.'

const LOGOUT_CONFLICT = '먼저 어느 쪽 진행을 쓸지 골라 주세요.'

/** 서버에 올린 결과. **충돌은 실패와 다르다** — 사람이 고르면 이어서 올라간다. */
type PushResult = 'ok' | 'conflict' | 'failed' | 'busy'

/**
 * 충돌 카드에 보일 만큼만 서버 세이브를 읽는다. 읽을 수 없으면 null.
 *
 * 로컬 세이브와 같은 검증을 지난다(save.ts). 여기서 읽히지 않는 값은 "가져오기"를
 * 골라도 쓸 수 없는 값이므로, 그 사실이 카드에 먼저 나타나야 한다.
 */
function summarize(snapshot: PetSnapshot): ConflictSide | null {
  const parsed = readServerSave(snapshot.save)
  if (parsed === null) return null

  return { level: parsed.pet.level, coins: parsed.wallet.coins, at: parsed.lastSeenAt }
}

export function usePet(session: Session): UsePetResult {
  const [save, setSave] = useState<PetSave | null>(null)
  const [report, setReport] = useState<ElapsedReport | null>(null)
  const [recovered, setRecovered] = useState<string | null>(null)
  const [persistError, setPersistError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [tutorialFinishedAt, setTutorialFinishedAt] = useState<number | null>(null)
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [conflict, setConflict] = useState<ConflictPrompt | null>(null)

  /**
   * 이 회원의 자리. **회원마다 다르다**(§10).
   *
   * 칸이 하나면 로그아웃이 늦거나 브라우저가 갑자기 죽었을 때 다음 사람이
   * 앞사람의 펫을 덮어쓴다.
   */
  const keys = useMemo(
    () => ({ save: saveKey(session.memberId), sync: syncKey(session.memberId) }),
    [session.memberId],
  )

  // 30초 타이머와 visibilitychange 핸들러는 한 번만 붙이고 싶은데 그 안에서
  // 최신 세이브를 봐야 한다. 상태를 의존성에 넣으면 세이브가 바뀔 때마다
  // 리스너를 떼었다 붙이게 되므로, 최신 값은 ref 로 따로 들고 있는다.
  const saveRef = useRef<PetSave | null>(null)

  /**
   * 로컬 세이브가 서버의 **어느 시점에서 갈라져 나왔는지**. 모르면 null.
   *
   * 올릴 때 그대로 보낸다. 서버의 synced_at 과 다르면 그 사이 다른 기기가 올린
   * 것이므로 409 가 오고, 그때는 사람에게 묻는다(§5).
   */
  const baseRef = useRef<number | null>(null)

  /**
   * 저장 경로를 껐는가. **로그아웃이 켠다.**
   *
   * 자동 저장은 visibilitychange 와 언마운트 정리에서도 마지막 상태를 쓴다.
   * 로그아웃 뒤에 그 경로가 한 번 더 돌면 **방금 지운 키가 되살아나고, 다음
   * 사람이 그 펫을 본다**(§10). 지우기 전에 반드시 먼저 끈다.
   */
  const stoppedRef = useRef(false)

  /** 올리기가 겹치지 않게. 두 요청이 같은 baseSyncedAt 을 쓰면 뒤엣것이 409 다. */
  const pushingRef = useRef(false)

  /**
   * 답을 기다리는 충돌. 서버 상태를 같이 들고 있는다.
   *
   * 상태(conflict)와 따로 두는 이유는 30초 타이머의 클로저가 최신 값을 봐야 하기
   * 때문이다 — 카드가 떠 있는 동안 자동으로 올려 버리면 물어본 것이 무의미해진다.
   */
  const conflictRef = useRef<{ prompt: ConflictPrompt; server: PetSnapshot } | null>(null)

  const commit = useCallback((next: PetSave, nextReport: ElapsedReport | null) => {
    saveRef.current = next
    setSave(next)
    if (nextReport) setReport(nextReport)
  }, [])

  /**
   * writeSave 는 실패를 삼키지 않고 던진다(save.ts 의 계약). 던진 것을 받는
   * 책임은 이쪽이다 — React 18 은 effect 에서 새어 나온 예외를 잡을 바운더리가
   * 없으면 루트를 통째로 언마운트하므로, 감싸지 않으면 저장 실패가 흰 화면이
   * 된다. 특히 cleanup 에서 던지면 언마운트 자체가 깨진다.
   */
  const persist = useCallback(
    (storage: Storage, next: PetSave) => {
      // 로그아웃이 저장 경로를 껐으면 아무것도 쓰지 않는다. 이 한 줄이 없으면
      // 로그아웃 직후의 언마운트 정리가 방금 지운 키를 되살린다.
      if (stoppedRef.current) return

      try {
        writeSave(storage, keys.save, next)
        setPersistError(null)
      } catch {
        // 삼키되 조용히 넘어가지 않는다. 저장되고 있다고 믿은 채 계속 노는 것이
        // 이 게임에서 제일 나쁜 결말이다(§1).
        setPersistError(PERSIST_FAILED)
      }
    },
    [keys.save],
  )

  /**
   * 서버에 올린다.
   *
   * 성공하면 서버가 알려준 시각이 다음 기준이 된다. 그 값을 로컬에도 적어 두는
   * 이유는, 새로고침한 뒤에도 "로컬이 그 행의 연장선"임을 알아야 하기 때문이다 —
   * 모르면 새로고침할 때마다 충돌을 묻게 된다(sync.ts).
   */
  const push = useCallback(
    async (next: PetSave): Promise<PushResult> => {
      // 이미 물어봐 둔 것이 있으면 올리지 않는다. 지금 올리면 사람이 고르기도
      // 전에 한쪽이 이겨 버린다.
      if (conflictRef.current !== null) return 'conflict'
      if (pushingRef.current) return 'busy'

      pushingRef.current = true
      try {
        const result = await petApi.put(next, baseRef.current)
        baseRef.current = result.syncedAt

        const storage = getStorage()
        if (storage) writeSyncBase(storage, keys.sync, result.syncedAt)

        setSyncError(null)
        return 'ok'
      } catch (caught) {
        if (caught instanceof PetConflictError) {
          const prompt: ConflictPrompt = { when: 'push', server: summarize(caught.server) }
          conflictRef.current = { prompt, server: caught.server }
          setConflict(prompt)
          return 'conflict'
        }

        // 401 이면 공용 클라이언트가 이미 세션을 끝냈다(api.ts). 여기서는 다른
        // 실패와 똑같이 알리기만 한다 — 화면 전환은 세션 쪽이 맡는다.
        setSyncError(SYNC_FAILED)
        return 'failed'
      } finally {
        pushingRef.current = false
      }
    },
    [keys.sync],
  )

  // ---- 첫 진입 -------------------------------------------------------------

  /**
   * 로컬과 서버를 맞춰 이 세션의 출발점을 정한다.
   *
   * 로컬을 먼저 읽는 것은 그것이 동기이고, 서버를 못 만나도 이 사람의 진행이
   * 여기 남아 있을 수 있어서다. 무엇을 쓸지 고르는 규칙 자체는 sync.ts 에 있다.
   */
  const load = useCallback(async () => {
    setPhase('loading')

    const storage = getStorage()
    const now = Date.now()

    let local: PetSave | null = null

    if (storage) {
      // loadSave 도 던질 수 있다. 손상 복구가 백업을 쓰는데(save.ts 의 recover),
      // 저장소가 가득 차 있으면 그 setItem 이 던진다. 감싸지 않으면 "세이브가
      // 깨진 바로 그 사용자"가 복구 안내조차 못 보고 흰 화면을 만난다.
      let result: LoadResult
      try {
        result = loadSave(storage, keys.save, now)
      } catch {
        // 백업 쓰기가 실패한 것이므로 원본은 아직 지워지지 않았다(백업을 먼저
        // 쓰고 원본을 지우는 순서라서다). **여기서 서버를 부르지 않는다** —
        // 서버 것을 받아 로컬에 쓰면 그 원본을 덮어쓰게 되고, 방금 "지우지
        // 않았다"고 한 말이 거짓이 된다. 서버에 펫이 있다면 첫 올리기가 충돌로
        // 알려 주고, 그 카드에서 서버 것을 가져올 수 있다.
        setRecovered(
          '저장 파일을 읽지 못했고 백업도 만들지 못했습니다(저장 공간 부족). 원본은 지우지 않았습니다.',
        )
        setPhase('ready')
        return
      }

      if (result.kind === 'ok') local = result.save

      if (result.kind === 'recovered') {
        // 조용히 초기화하면 사용자는 3주 키운 펫이 왜 사라졌는지 영영 모른다.
        // 백업 키를 함께 보여줘야 "남겨 뒀다"는 말이 확인 가능한 사실이 된다.
        setRecovered(
          `저장 파일을 읽지 못했어요. 백업은 남겨 두었습니다. (${result.reason} · ${result.backupKey})`,
        )
      }
    }

    const base = storage ? readSyncBase(storage, keys.sync) : null

    let snapshot: PetSnapshot | null = null
    let server: ServerState
    try {
      snapshot = await petApi.get()
      server =
        snapshot === null ? { kind: 'absent' } : { kind: 'present', syncedAt: snapshot.syncedAt }
    } catch {
      // 401 이면 세션이 이미 끝났고 화면은 로그인으로 돌아간다(api.ts). 그 밖의
      // 실패는 "서버를 못 만났다"로 같이 다룬다 — 아래 규칙이 그 경우를 안다.
      server = { kind: 'unreachable' }
    }

    const decision = reconcile({ localPresent: local !== null, base, server })

    if (decision.kind === 'retry') {
      setPhase('retry')
      return
    }

    if (decision.kind === 'fresh') {
      // 서버에도 로컬에도 없다. 처음 오는 사람이라 이름부터 짓는다.
      baseRef.current = null
      setPhase('ready')
      return
    }

    if (decision.kind === 'server') {
      // 서버에서 온 값도 손상된 로컬 세이브와 똑같이 검증한다(save.ts).
      const adopted = snapshot === null ? null : readServerSave(snapshot.save)

      if (adopted === null || snapshot === null) {
        setRecovered(SERVER_SAVE_UNREADABLE)
        baseRef.current = null
        setPhase('ready')
        return
      }

      baseRef.current = snapshot.syncedAt
      if (storage) writeSyncBase(storage, keys.sync, snapshot.syncedAt)

      const applied = applyElapsed(adopted, Date.now())
      commit(applied.next, applied.report)
      if (storage) persist(storage, applied.next)
      setPhase('ready')
      return
    }

    // 'local' 과 'ask' 는 둘 다 로컬로 시작한다. 다른 점은 물어보는지뿐이다 —
    // 카드 뒤에서 게임이 이미 돌고 있어야 "이 기기 것"이 무엇인지 눈에 보인다.
    if (local === null) {
      setPhase('ready')
      return
    }

    baseRef.current = base

    const applied = applyElapsed(local, Date.now())
    commit(applied.next, applied.report)

    if (decision.kind === 'ask' && snapshot !== null) {
      const prompt: ConflictPrompt = { when: 'load', server: summarize(snapshot) }
      conflictRef.current = { prompt, server: snapshot }
      setConflict(prompt)
    }

    setPhase('ready')
  }, [commit, keys.save, keys.sync, persist])

  useEffect(() => {
    void load()
  }, [load])

  const retryLoad = useCallback(() => {
    void load()
  }, [load])

  // ---- 자동 저장 -----------------------------------------------------------

  // 상태가 바뀔 때마다. 명세 §10 의 "상태가 바뀌는 모든 행동 직후".
  useEffect(() => {
    if (!save) return
    const storage = getStorage()
    if (!storage) return
    persist(storage, save)
  }, [save, persist])

  useEffect(() => {
    const storage = getStorage()
    if (!storage) return

    /**
     * 켜 둔 채 흐른 시간을 그때그때 반영하고 lastSeenAt 을 전진시킨다.
     *
     * 저장만 하고 경과를 반영하지 않으면 lastSeenAt 이 마운트 시각에 멈춰 있어,
     * 탭을 12시간 열어 둔 뒤 껐다 곧바로 켜면 "12시간 만이야!" 카드가 뜨고
     * 배고픔이 72 떨어진다 — 방금 껐다 켰는데도. (창에 가려진 탭도 Visibility
     * API 는 visible 로 보므로 흔한 상황이다.)
     *
     * 반대로 lastSeenAt 만 now 로 밀면 켜 둔 동안 펫이 영영 배고파지지 않는다.
     * 그래서 경과 계산을 그대로 한 번 더 지나게 한다. 쪼개어 불러도 결과는 같다
     * — 감소는 선형이고 0 에서 잘리며, 수면 회복은 sleep.since 기준 누적으로
     * 재기 때문이다(sleepRecoverMs).
     *
     * report 는 버린다. 복귀 카드는 마운트와 visible 에서 온 리포트로만 띄운다.
     */
    const catchUp = (): PetSave | null => {
      const current = saveRef.current
      if (!current) return null
      const applied = applyElapsed(current, Date.now())
      commit(applied.next, null)
      return applied.next
    }

    const tick = () => {
      const next = catchUp()
      if (!next) return

      persist(storage, next)

      // **서버에도 같은 자리에서 올린다**(§10 의 "올리는 시점"). 행동마다 올리면
      // 요청이 쏟아지고, 로그아웃 때만 올리면 브라우저가 갑자기 죽었을 때 그
      // 세션이 통째로 날아간다.
      if (!stoppedRef.current) void push(next)
    }

    const handleVisibility = () => {
      // 모바일 브라우저는 백그라운드로 보낸 탭을 예고 없이 죽인다. 그때
      // beforeunload 는 불리지 않으므로 hidden 이 되는 순간에 반드시 써 둔다.
      // 상태 갱신에 딸린 effect 를 기다리지 않고 직접 쓰는 것도 같은 이유다.
      //
      // 여기서 시작한 올리기는 탭이 먼저 죽으면 끝나지 못한다. 그래도 로컬 쓰기는
      // 이미 끝났고 기준 시각도 그대로라, 다음 로그인에서 "로컬이 그 행의
      // 연장선"으로 읽혀 이어진다(sync.ts). 그러라고 두 값을 남기는 것이다.
      if (document.visibilityState === 'hidden') {
        tick()
        return
      }

      // 다시 앞으로 나온 것도 "화면에 들어오는" 순간이다. 여기서 경과를
      // 반영하지 않으면 탭을 하루 재웠다 깨웠을 때 게이지가 멈춰 있다.
      const current = saveRef.current
      if (!current) return
      const applied = applyElapsed(current, Date.now())
      commit(applied.next, applied.report)
    }

    const timer = window.setInterval(tick, AUTOSAVE_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
      // 언마운트도 화면을 떠나는 순간이다. 마지막 상태를 흘리지 않는다.
      // 여기서 commit(setState) 을 부르면 언마운트 중 갱신이 되므로 쓰기만 한다.
      // 로그아웃으로 인한 언마운트라면 persist 가 스스로 아무것도 하지 않는다.
      const current = saveRef.current
      if (current) persist(storage, current)
    }
  }, [commit, persist, push])

  // ---- 서버와 맞추기 --------------------------------------------------------

  /**
   * 충돌을 사람이 고른 대로 정리한다. (§5)
   *
   * 어느 쪽이 최신인지 코드가 고르지 않는다. `lastSeenAt` 이 큰 쪽을 자동으로
   * 쓰고 싶어지지만 그 값은 클라이언트가 보낸 것이고 기기 시계는 틀릴 수 있다.
   */
  const resolveConflict = useCallback(
    async (choice: ConflictChoice) => {
      const pending = conflictRef.current
      if (!pending) return

      const storage = getStorage()

      if (choice === 'theirs') {
        const adopted = readServerSave(pending.server.save)
        conflictRef.current = null
        setConflict(null)

        if (adopted === null) {
          // 읽지 못한 값으로 갈아 끼우면 멀쩡한 진행까지 잃는다. 이 기기 것을
          // 그대로 두고 알리기만 한다.
          setSyncError(SERVER_SAVE_BROKEN)
          return
        }

        baseRef.current = pending.server.syncedAt
        if (storage) writeSyncBase(storage, keys.sync, pending.server.syncedAt)

        const applied = applyElapsed(adopted, Date.now())
        commit(applied.next, applied.report)
        if (storage) persist(storage, applied.next)
        setSyncError(null)
        return
      }

      // 이 기기 것으로 덮는다. 서버가 알려준 시각을 기준으로 다시 올리면
      // 두 번째 요청은 통과한다(§5).
      baseRef.current = pending.server.syncedAt
      conflictRef.current = null
      setConflict(null)

      const current = saveRef.current
      if (current) await push(current)
    },
    [commit, keys.sync, persist, push],
  )

  /**
   * 로그아웃. **올리고 나서 지운다.**
   *
   * 순서가 규칙이다(§10). 올리기 전에 지우면 진행이 사라지고, 지우지 않고 두면
   * 다음 사람이 그 펫을 본다. 그래서 올리지 못하면 아무것도 지우지 않고 나가지도
   * 않는다 — 무엇이 남았는지 사용자가 알아야 한다.
   */
  const logout = useCallback(async (): Promise<LogoutResult> => {
    const storage = getStorage()

    // 저장 경로를 **먼저** 끈다. 아래에서 지운 뒤에 언마운트 정리나
    // visibilitychange 가 한 번 더 돌면 그 키가 되살아난다.
    stoppedRef.current = true

    const finish = () => {
      if (storage) {
        clearSave(storage, keys.save)
        clearSyncBase(storage, keys.sync)
      }
      endSession()
    }

    const current = saveRef.current

    // 이름을 짓기 전이면 올릴 것이 없다.
    if (!current) {
      finish()
      return { ok: true, message: null }
    }

    const result = await push(current)

    if (result !== 'ok') {
      // 나가지 못했으니 계속 놀 수 있어야 한다. 저장 경로를 되돌린다.
      stoppedRef.current = false

      if (result === 'conflict') return { ok: false, message: LOGOUT_CONFLICT }
      if (result === 'busy') return { ok: false, message: LOGOUT_BUSY }
      return { ok: false, message: LOGOUT_FAILED }
    }

    finish()
    return { ok: true, message: null }
  }, [keys.save, keys.sync, push])

  // ---- 조작 ---------------------------------------------------------------

  const start = useCallback(
    (name: string) => {
      setRecovered(null)

      // 새 세이브도 applyElapsed 를 한 번 지나게 한다. 경과가 0이라 스탯은 그대로지만
      // 출석 코인 지급이 그 안에 있어서, 건너뛰면 부화 직후 코인이 0이었다가 다음
      // 접속에야 30이 들어온다. 명세 §7 의 "일일 첫 접속"은 첫 세션도 포함한다.
      const now = Date.now()

      // **튜토리얼을 여는 것은 여기 한 곳뿐이다.** 2단계(먹이기)는 아무도 "들어가지"
      // 않는 단계라 — 세이브가 거기서 시작한다 — advance() 만으로는 진입 지급인
      // 사과 3개를 줄 경로가 없다. 그 지급이 빠지면 먹일 것도 살 것도 없이 2단계에서
      // 막힌다. 지급 규칙 자체는 tutorial.ts 안에 있고, 화면은 시작을 알릴 뿐이다.
      const fresh = applyElapsed(startTutorial(createSave(name, now)), now)
      commit(fresh.next, null)
    },
    [commit],
  )

  /**
   * 사건 하나를 튜토리얼에 알린다.
   *
   * 지금 단계를 끝내는 사건이 아니면 tutorial.ts 가 세이브를 그대로 돌려주므로,
   * 부르는 쪽은 지금이 몇 단계인지 몰라도 된다. 그게 이 모듈이 상태 머신인
   * 이유다 — 화면이 단계를 세면 그 판단이 곧 두 벌이 된다.
   */
  const notifyTutorial = useCallback((current: PetSave, event: TutorialEvent): PetSave => {
    const next = advance(current, event)
    // done 이 켜지는 순간만 잡는다. done 플래그 자체를 보면 새로고침할 때마다
    // 완료 축하가 다시 뜬다.
    if (!current.tutorial.done && next.tutorial.done) setTutorialFinishedAt(Date.now())
    return next
  }, [])

  /**
   * 돌봄 행동.
   *
   * **액션 함수를 부르기 전에 반드시 applyElapsed 를 지난다.** 액션은 시간을
   * 다루지 않는다는 것이 actions.ts 와의 계약이라, 여기서 최신 상태로 만들어
   * 넘기지 않으면 마지막 접속 이후의 감소가 통째로 빠진 값 위에 효과가 얹힌다.
   * 반대로 액션 안에서 다시 계산하면 이중 적용이 된다.
   *
   * 여기서 나온 리포트는 버린다. 복귀 카드는 화면에 들어오는 순간에만 뜬다 —
   * 밥을 줄 때마다 "12시간 만이야!" 카드가 뜨면 안 된다.
   */
  const act = useCallback(
    (kind: ActionKind, food?: FoodId): ActionOutcome | null => {
      const current = saveRef.current
      if (!current) return null

      const now = Date.now()
      const fresh = applyElapsed(current, now)
      const outcome = runAction(fresh.next, kind, food, now)
      if (!outcome) return null

      // 실제로 통한 행동만 튜토리얼에 알린다. 사과가 없어 거절당한 먹이기까지
      // '먹였다'로 넘기면 가방이 빈 채로 2단계가 통과한다.
      const event = outcome.changed ? tutorialEventFor(kind) : null
      const next = event === null ? outcome.next : notifyTutorial(outcome.next, event)

      // 거절(changed:false)이어도 커밋한다. outcome.next 는 경과가 반영된
      // 세이브이므로, 버리면 방금 지나간 시간이 없던 일이 된다.
      commit(next, null)

      // 커밋한 세이브를 그대로 돌려준다. outcome.next 를 그냥 내보내면 튜토리얼이
      // 넘어간 뒤의 세이브와 화면이 받은 세이브가 갈린다.
      return { ...outcome, next }
    },
    [commit, notifyTutorial],
  )

  /**
   * 진입 가능 여부.
   *
   * saveRef 가 아니라 save 상태를 보는 이유는 이 함수가 렌더 중에 불리기
   * 때문이다. 메뉴는 매 렌더 이 값을 다시 물어보므로, 에너지가 바뀌면 버튼도
   * 함께 갱신되어야 한다.
   */
  const checkPlay = useCallback(
    (game: MinigameId): PlayCheck => {
      if (!save) return { ok: false, reason: '아직 펫이 없어요.' }
      return canPlay(save, game)
    },
    [save],
  )

  /**
   * 미니게임 정산.
   *
   * **돌봄 액션과 똑같이 정산 직전에 applyElapsed 를 지난다.** 한 판이 1분 넘게
   * 걸릴 수 있어서(간식받기 60초), 게임을 시작할 때의 스탯으로 정산하면 그동안의
   * 감소가 통째로 사라진다. 배고픔 0 벌칙(§4)은 판이 끝난 시점의 배고픔으로
   * 판정되어야 하므로 순서도 이쪽이 맞다.
   *
   * 리포트는 버린다. 복귀 카드는 화면에 들어오는 순간에만 뜬다 — 게임이 끝날
   * 때마다 "12시간 만이야!"가 뜨면 안 된다.
   *
   * 튜토리얼 중이면 에너지를 되돌린다(§9 "튜토리얼 판은 에너지를 소모하지 않는다").
   * 판정도 되돌리기도 tutorial.ts 가 하고, 여기서는 정산 전후를 넘겨줄 뿐이다 —
   * 정산은 계속 튜토리얼을 모른다.
   */
  const finishGame = useCallback(
    (game: MinigameId, score: number): Settlement | null => {
      const current = saveRef.current
      if (!current) return null

      const now = Date.now()
      const fresh = applyElapsed(current, now)
      const settled = settle(fresh.next, game, score, now)
      const settlement: Settlement = {
        ...settled,
        next: keepTutorialEnergy(fresh.next, settled.next),
      }

      // 점수가 0 이어도 한 판을 끝낸 것이다. 명세 §9 의 4단계 조건은 "게임 종료"
      // 이지 "몇 점 이상"이 아니다 — 첫 판에서 못한 사람이 튜토리얼에 갇힌다.
      const next = notifyTutorial(settlement.next, 'played')
      commit(next, null)
      return { ...settlement, next }
    },
    [commit, notifyTutorial],
  )

  /**
   * 상점 구매.
   *
   * 돌봄 액션과 같은 이유로 applyElapsed 를 먼저 지난다. 상점을 오래 켜 둔 채
   * 사면 그동안의 감소가 통째로 사라진다.
   */
  const buyItem = useCallback(
    (item: ItemId): PurchaseOutcome | null => {
      const current = saveRef.current
      if (!current) return null

      const fresh = applyElapsed(current, Date.now())
      const outcome = buy(fresh.next, item)
      const next = outcome.changed ? notifyTutorial(outcome.next, 'bought') : outcome.next

      commit(next, null)
      return { ...outcome, next }
    },
    [commit, notifyTutorial],
  )

  /**
   * 가구 배치.
   *
   * 세 함수가 같은 모양이라 하나로 묶었다. **applyElapsed 를 지나지 않는다** —
   * 배치는 펫의 상태를 건드리지 않고, 여기서까지 경과를 반영하면 가구를 끌어
   * 옮기는 동안 게이지가 줄어드는 것처럼 보인다(손을 뗄 때마다 한 번씩 반영된다).
   * 시간은 30초 타이머와 화면 복귀가 따라잡는다.
   */
  const runDecor = useCallback(
    (run: (current: PetSave) => DecorOutcome): DecorOutcome | null => {
      const current = saveRef.current
      if (!current) return null

      const outcome = run(current)
      commit(outcome.next, null)
      return outcome
    },
    [commit],
  )

  const placeFurniture = useCallback(
    (item: FurnitureId, x: number, y: number) => runDecor((current) => place(current, item, x, y)),
    [runDecor],
  )

  const moveFurniture = useCallback(
    (index: number, x: number, y: number) => runDecor((current) => moveTo(current, index, x, y)),
    [runDecor],
  )

  const pickUpFurniture = useCallback(
    (index: number) => runDecor((current) => pickUp(current, index)),
    [runDecor],
  )

  const confirmTutorial = useCallback(() => {
    const current = saveRef.current
    if (!current) return
    commit(notifyTutorial(current, 'confirm'), null)
  }, [commit, notifyTutorial])

  const skipTutorial = useCallback(() => {
    const current = saveRef.current
    if (!current) return

    const next = skip(current)
    // 스킵도 완료다. 남은 단계를 건너뛰고 완료 보상까지 정산하는 것이 skip 의
    // 계약이므로, 화면은 끝까지 한 사람과 같은 축하를 본다.
    if (!current.tutorial.done && next.tutorial.done) setTutorialFinishedAt(Date.now())
    commit(next, null)
  }, [commit])

  const jump = useCallback(
    (ms: number) => {
      const current = saveRef.current
      if (!current) return

      // lastSeenAt 을 과거로 미는 것만으로 "그만큼 자리를 비웠다"가 된다.
      // 기기 시계를 건드리지 않으므로 다른 탭이나 OS 에 영향이 없고,
      // 경과 계산 경로는 실제 복귀와 완전히 같은 코드를 지난다.
      //
      // 기준을 current.lastSeenAt 이 아니라 now 로 잡는 이유: lastSeenAt 은 마지막
      // 갱신 시각이라 지금보다 몇 초 과거다. 거기서 12시간을 빼면 경과가 12시간을
      // 몇 초 넘겨 상한에 걸리고, "12시간까지만 반영했어요"라는 안내가 잘리지도
      // 않았는데 뜬다. 점프 도구는 명세의 수치를 정확히 재현해야 쓸모가 있다.
      const now = Date.now()
      const shifted: PetSave = {
        ...current,
        lastSeenAt: now - ms,
        // 자고 있었다면 잠든 시각도 같이 밀어야 "그동안 자고 있었다"가 된다.
        sleep: current.sleep ? { ...current.sleep, since: current.sleep.since - ms } : null,
      }

      const applied = applyElapsed(shifted, now)
      commit(applied.next, applied.report)
    },
    [commit],
  )

  /**
   * 개발용 지급.
   *
   * 규칙이 아니므로 ActionOutcome 을 쓰지 않고 결과 문구도 없다. 여기서
   * applyElapsed 를 돌리지 않는 것도 같은 이유다 — 이건 게임 안의 행동이 아니라
   * 상태를 손으로 밀어 넣는 도구이고, 시간과 얽히면 도구가 게임을 바꾼다.
   */
  const grant = useCallback(
    (item: ItemId, count: number) => {
      const current = saveRef.current
      if (!current) return
      commit(grantItem(current, item, count), null)
    },
    [commit],
  )

  const dismissReport = useCallback(() => setReport(null), [])

  return {
    save,
    report,
    recovered,
    persistError,
    syncError,
    phase,
    conflict,
    resolveConflict,
    logout,
    retryLoad,
    start,
    act,
    checkPlay,
    finishGame,
    buyItem,
    placeFurniture,
    moveFurniture,
    pickUpFurniture,
    confirmTutorial,
    skipTutorial,
    tutorialFinishedAt,
    jump,
    grant,
    dismissReport,
  }
}
