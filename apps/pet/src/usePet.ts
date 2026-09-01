import { useCallback, useEffect, useRef, useState } from 'react'
import type { ElapsedReport, FoodId, ItemId, PetSave } from './game/types'
import { applyElapsed } from './game/pet/stats'
import type { LoadResult } from './game/pet/save'
import { createSave, loadSave, writeSave } from './game/pet/save'
import type { ActionOutcome } from './game/pet/actions'
import { feed, grantItem, pat, startSleep, wakeUp, wash } from './game/pet/actions'
import type { MinigameId } from './game/pet/economy'
import type { PlayCheck, Settlement } from './game/pet/minigames'
import { canPlay, settle } from './game/pet/minigames'

/**
 * 세이브를 들고 있는 유일한 곳.
 *
 * 규칙(stats · save)은 React 를 모르는 순수 모듈이고, 이 훅은 그것들을 화면에
 * 잇기만 한다. 감소율이나 상한 같은 수치는 여기에 한 줄도 적지 않는다 —
 * 적는 순간 economy.ts 가 유일한 출처가 아니게 된다.
 */

/** 주기 저장 간격. 명세 §10 의 "30초마다". */
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
 * 종류에 맞는 액션 함수를 고른다.
 *
 * 훅 바깥에 두는 이유는 이 함수가 React 상태를 하나도 보지 않기 때문이다.
 * 안에 두면 매 렌더마다 다시 만들어지고, useCallback 의존성에도 끌려 들어온다.
 */
function runAction(
  save: PetSave,
  kind: ActionKind,
  food: FoodId | undefined,
  now: number,
): ActionOutcome | null {
  switch (kind) {
    case 'feed':
      // 무엇을 먹일지는 화면이 인벤토리에서 고른다. 고르지 않고 온 것은 규칙
      // 위반이 아니라 화면의 실수이므로, 세이브를 건드리지 않고 돌려보낸다.
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
  /** 개발 전용 시간 점프. M1 완료 기준을 손으로 확인하는 수단이다. */
  jump: (ms: number) => void
  /** 개발 전용 물건 지급. 상점·튜토리얼(M4)이 없어 음식을 얻을 길이 없다. */
  grant: (item: ItemId, count: number) => void
  dismissReport: () => void
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

export function usePet(): UsePetResult {
  const [save, setSave] = useState<PetSave | null>(null)
  const [report, setReport] = useState<ElapsedReport | null>(null)
  const [recovered, setRecovered] = useState<string | null>(null)
  const [persistError, setPersistError] = useState<string | null>(null)

  // 30초 타이머와 visibilitychange 핸들러는 한 번만 붙이고 싶은데 그 안에서
  // 최신 세이브를 봐야 한다. 상태를 의존성에 넣으면 세이브가 바뀔 때마다
  // 리스너를 떼었다 붙이게 되므로, 최신 값은 ref 로 따로 들고 있는다.
  const saveRef = useRef<PetSave | null>(null)

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
  const persist = useCallback((storage: Storage, next: PetSave) => {
    try {
      writeSave(storage, next)
      setPersistError(null)
    } catch {
      // 삼키되 조용히 넘어가지 않는다. 저장되고 있다고 믿은 채 계속 노는 것이
      // 이 게임에서 제일 나쁜 결말이다(§1).
      setPersistError(PERSIST_FAILED)
    }
  }, [])

  // ---- 첫 진입 -------------------------------------------------------------

  useEffect(() => {
    const storage = getStorage()
    if (!storage) return

    const now = Date.now()

    // loadSave 도 던질 수 있다. 손상 복구가 백업을 쓰는데(save.ts 의 recover),
    // 저장소가 가득 차 있으면 그 setItem 이 던진다. 감싸지 않으면 "세이브가
    // 깨진 바로 그 사용자"가 복구 안내조차 못 보고 흰 화면을 만난다.
    let result: LoadResult
    try {
      result = loadSave(storage, now)
    } catch {
      // 백업 쓰기가 실패한 것이므로 원본은 아직 지워지지 않았다(백업을 먼저 쓰고
      // 원본을 지우는 순서라서다). 원본 보존이라는 §10 의 목적은 여기서도 지켜진다.
      setRecovered(
        '저장 파일을 읽지 못했고 백업도 만들지 못했습니다(저장 공간 부족). 원본은 지우지 않았습니다.',
      )
      return
    }

    if (result.kind === 'ok') {
      const applied = applyElapsed(result.save, now)
      commit(applied.next, applied.report)
      return
    }

    if (result.kind === 'recovered') {
      // 조용히 초기화하면 사용자는 3주 키운 펫이 왜 사라졌는지 영영 모른다.
      // 백업 키를 함께 보여줘야 "남겨 뒀다"는 말이 확인 가능한 사실이 된다.
      setRecovered(
        `저장 파일을 읽지 못했어요. 백업은 남겨 두었습니다. (${result.reason} · ${result.backupKey})`,
      )
    }

    // kind:'empty' 는 신규 사용자다. save 가 null 로 남아 화면이 이름 입력을 띄운다.
  }, [commit])

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
      if (next) persist(storage, next)
    }

    const handleVisibility = () => {
      // 모바일 브라우저는 백그라운드로 보낸 탭을 예고 없이 죽인다. 그때
      // beforeunload 는 불리지 않으므로 hidden 이 되는 순간에 반드시 써 둔다.
      // 상태 갱신에 딸린 effect 를 기다리지 않고 직접 쓰는 것도 같은 이유다.
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
      const current = saveRef.current
      if (current) persist(storage, current)
    }
  }, [commit, persist])

  // ---- 조작 ---------------------------------------------------------------

  const start = useCallback(
    (name: string) => {
      setRecovered(null)

      // 새 세이브도 applyElapsed 를 한 번 지나게 한다. 경과가 0이라 스탯은 그대로지만
      // 출석 코인 지급이 그 안에 있어서, 건너뛰면 부화 직후 코인이 0이었다가 다음
      // 접속에야 30이 들어온다. 명세 §7 의 "일일 첫 접속"은 첫 세션도 포함한다.
      const now = Date.now()
      const fresh = applyElapsed(createSave(name, now), now)
      commit(fresh.next, null)
    },
    [commit],
  )

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

      // 거절(changed:false)이어도 커밋한다. outcome.next 는 경과가 반영된
      // 세이브이므로, 버리면 방금 지나간 시간이 없던 일이 된다.
      commit(outcome.next, null)
      return outcome
    },
    [commit],
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
   */
  const finishGame = useCallback(
    (game: MinigameId, score: number): Settlement | null => {
      const current = saveRef.current
      if (!current) return null

      const now = Date.now()
      const fresh = applyElapsed(current, now)
      const settlement = settle(fresh.next, game, score, now)
      commit(settlement.next, null)
      return settlement
    },
    [commit],
  )

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
    start,
    act,
    checkPlay,
    finishGame,
    jump,
    grant,
    dismissReport,
  }
}
