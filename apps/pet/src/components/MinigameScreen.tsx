import { useCallback, useEffect, useRef, useState } from 'react'
import { GameCanvas } from '@gujuck/ui'
import type { CanvasStage } from '@gujuck/game-core'
import { CatchGame } from '../game/minigames/CatchGame'
import { EchoGame } from '../game/minigames/EchoGame'
import { HopGame } from '../game/minigames/HopGame'
import { loadSprites } from '../game/sprites'
import type { SpriteSet } from '../game/sprites'
import type { MinigameHost } from '../game/minigames/types'
import type { MinigameId } from '../game/pet/economy'
import * as music from '../game/music'
import type { Stage } from '../game/types'

/**
 * 세 게임이 공통으로 갖는 것.
 *
 * 만드는 쪽은 셋 다 다르지만 정리 책임은 같다 — 자기가 만든 루프와 리스너를
 * destroy() 에서 전부 뗀다.
 */
interface Minigame {
  destroy: () => void
}

export interface MinigameScreenProps {
  game: MinigameId
  /**
   * 지금 펫의 성장 단계. 방에서 보이던 그 펫이 그대로 나와야 한다.
   *
   * 레벨이 아니라 이미 정해진 단계를 받는다 — 레벨 → 단계 판정은 economy.ts 의
   * stageForLevel 한 곳에만 둔다(명세 §6).
   */
  petStage: Stage
  /**
   * 기분이 0 인가. 방에서 시무룩하던 펫은 미니게임에서도 시무룩해야 한다.
   *
   * 판정을 여기서 하지 않고 값을 받는 것은 petStage 와 같은 이유다 — "언제
   * 시무룩한가"는 face.ts 의 규칙이고, 화면마다 다시 판단하면 규칙이 여러 벌이 된다.
   */
  moodZero: boolean
  /** 판이 끝났을 때 최종 점수. 정산은 부르는 쪽(usePet)이 한다. */
  onEnd: (score: number) => void
  /** 중도 포기. 명세대로 보상도 소모도 없다. */
  onExit: () => void
}

/**
 * 고른 미니게임을 캔버스 위에 띄운다.
 *
 * 이 컴포넌트는 **규칙을 모른다.** 점수를 만드는 것은 게임 클래스이고, 그 점수로
 * 코인·EXP·에너지를 정하는 것은 game/pet/minigames.ts 다. 여기가 하는 일은 둘을
 * 잇고 화면을 정리하는 것뿐이다.
 */
export function MinigameScreen({ game, petStage, moodZero, onEnd, onExit }: MinigameScreenProps) {
  const [sprites, setSprites] = useState<SpriteSet | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  // handleMount 는 GameCanvas 가 마운트 때 한 번만 부르는 콜백이라 그 안에서
  // 최신 props 를 보려면 ref 가 필요하다. 의존성에 넣으면 부모가 인라인 화살표
  // 함수를 넘기는 순간 게임이 매 렌더 다시 만들어진다.
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd

  const spritesRef = useRef<SpriteSet | null>(null)
  spritesRef.current = sprites

  /**
   * 단계도 같은 이유로 ref 로 읽는다. 의존성에 넣으면 판이 도는 중에 레벨이 올라
   * 단계가 바뀌는 순간 게임이 통째로 다시 만들어진다 — 점수가 0 으로 돌아간다.
   *
   * 판이 끝날 때까지 이 판의 펫은 시작할 때의 모습으로 둔다. 한 판이 1분이라
   * 그동안 커지지 않는 것이 오히려 자연스럽고, 다음 판부터 큰 펫이 나온다.
   */
  const petStageRef = useRef(petStage)
  petStageRef.current = petStage

  /** 기분도 같은 이유로 ref 다. 판이 도는 동안의 값은 시작할 때의 것으로 굳는다. */
  const moodZeroRef = useRef(moodZero)
  moodZeroRef.current = moodZero

  /**
   * 이 판의 정산이 이미 나갔는가.
   *
   * 계약상 게임 클래스는 onEnd 를 한 판에 정확히 한 번만 부르지만, StrictMode 는
   * 캔버스를 마운트 → 언마운트 → 재마운트 시켜 게임 인스턴스를 두 벌 만든다.
   * 첫 인스턴스가 죽기 전에 끝을 알리면 정산이 두 번 돌아 에너지가 두 번 깎인다.
   * 컴포넌트가 사는 동안 한 번만 통과시키는 것으로 그 경로를 막는다.
   */
  const settledRef = useRef(false)

  /**
   * 판이 도는 동안에는 그 게임의 곡을 건다.
   *
   * 거실의 느린 곡이 미니게임까지 이어지면 무엇이 바뀌었는지 몸이 모른다 —
   * 화면만 바뀌고 분위기는 그대로라 판이 시작된 느낌이 나지 않는다. 나갈 때
   * 기본 곡으로 되돌리는 것을 정리 함수에 두어, 중도 포기든 정상 종료든 같은
   * 경로를 지나게 한다.
   */
  useEffect(() => {
    music.play(game)
    return () => music.play('home')
  }, [game])

  useEffect(() => {
    // 언마운트 뒤에 도착하는 로딩 콜백이 죽은 컴포넌트의 상태를 건드리지 않게 한다.
    let alive = true

    loadSprites().then(
      (loaded) => {
        if (alive) setSprites(loaded)
      },
      (error: unknown) => {
        if (!alive) return
        // 조용히 빈 캔버스로 두지 않는다. 화면에는 사람이 읽을 문구를, 콘솔에는
        // 어느 파일이 실패했는지를 남긴다(sprites.ts 가 이유를 담아 던진다).
        console.error(error)
        setLoadFailed(true)
      },
    )

    return () => {
      alive = false
    }
  }, [])

  /**
   * 게임을 만들고, 정리 함수에서 반드시 destroy() 를 부른다.
   *
   * host 를 변수로 만들어 세 생성자에 그대로 넘긴다. **타입을 명시한다** —
   * 표기 없이 두면 이 리터럴이 어느 게임의 계약에도 고정되지 않아, 한 게임이
   * 계약을 바꿔도 구조적 타이핑 때문에 세 호출이 전부 계속 통과한다. 계약이
   * game/minigames/types.ts 한 벌인 것도 같은 이유다.
   */
  const handleMount = useCallback(
    (stage: CanvasStage) => {
      const loaded = spritesRef.current
      // 로딩이 끝난 뒤에만 캔버스를 붙이므로 여기서 null 일 수 없다. 타입을 좁히기
      // 위한 가드다.
      if (loaded === null) return

      const host: MinigameHost = {
        stage,
        sprites: loaded,
        petStage: petStageRef.current,
        moodZero: moodZeroRef.current,
        onEnd: (value: number) => {
          if (settledRef.current) return
          settledRef.current = true
          onEndRef.current(value)
        },
      }

      const instance: Minigame =
        game === 'catch'
          ? new CatchGame(host)
          : game === 'hop'
            ? new HopGame(host)
            : new EchoGame(host)

      return () => instance.destroy()
    },
    [game],
  )

  return (
    <div className="pt-minigame">
      {sprites === null ? (
        <p className="pt-minigame__notice" role="status">
          {loadFailed ? '그림을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.' : '준비 중…'}
        </p>
      ) : (
        // key 를 걸어 게임이 바뀌면 캔버스째 다시 만든다. GameCanvas 는 onMount 를
        // 마운트 때 한 번만 부르므로, 같은 캔버스를 재사용하면 새 게임이 시작되지 않는다.
        <GameCanvas key={game} onMount={handleMount} />
      )}

      {/* 점수·시간·라이프는 게임 클래스가 캔버스 안에 그린다. 여기서 한 번 더
          그리면 같은 숫자가 두 곳에 뜨고, 캔버스 HUD 와 자리가 겹친다. */}
      <div className="pt-minigame__hud">
        <button
          type="button"
          className="gj-btn pt-minigame__exit"
          onClick={onExit}
          title="나가면 보상도 기운 소모도 없어요"
        >
          나가기
        </button>
        {/* 중도 포기의 대가를 미리 밝힌다. 나가고 나서 "코인이 없다"를 알게 되면
            잃은 것처럼 느껴진다 — 실제로는 소모도 없었는데도. */}
        <span className="pt-minigame__note">보상도 소모도 없어요</span>
      </div>
    </div>
  )
}
