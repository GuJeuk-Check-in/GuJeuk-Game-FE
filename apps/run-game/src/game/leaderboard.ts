// 게임 랭킹보드 — 저장 백엔드를 갈아끼울 수 있는 구조.
//
// 지금은 localStorage에 저장하지만, LeaderboardStore 인터페이스를 "비동기"로
// 두었기 때문에 나중에 서버 API 구현체(ApiLeaderboardStore)를 호출부 수정 없이
// 그대로 끼워 넣을 수 있다. 백엔드가 생기면 createLeaderboard() 한 곳만 바꾸면 된다.

export interface ScoreEntry {
  name: string
  score: number
  date: number // Unix ms
  players: number // 그 판을 함께 한 인원 (1 = 혼자)
}

export interface LeaderboardStore {
  /** 점수 높은 순 상위 목록. */
  top(limit?: number): Promise<ScoreEntry[]>
  /** 기록을 추가하고 갱신된 상위 목록을 돌려준다. */
  submit(entry: ScoreEntry): Promise<ScoreEntry[]>
}

const MAX_STORED = 50

function isEntry(v: unknown): v is ScoreEntry {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return (
    typeof e.name === 'string' &&
    typeof e.score === 'number' &&
    typeof e.date === 'number' &&
    typeof e.players === 'number'
  )
}

function sortTrim(list: ScoreEntry[]): ScoreEntry[] {
  // 점수 내림차순, 동점이면 먼저 세운 기록이 위로.
  return [...list].sort((a, b) => b.score - a.score || a.date - b.date).slice(0, MAX_STORED)
}

/** 현재 저장소: 이 기기(localStorage)에만 기록을 남긴다. */
export class LocalLeaderboardStore implements LeaderboardStore {
  constructor(private readonly key: string) {}

  private read(): ScoreEntry[] {
    try {
      const raw = localStorage.getItem(this.key)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(isEntry) : []
    } catch {
      return []
    }
  }

  private write(list: ScoreEntry[]): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(list))
    } catch {
      /* 용량 초과 · 시크릿 모드 등 — 조용히 무시 */
    }
  }

  async top(limit = MAX_STORED): Promise<ScoreEntry[]> {
    return sortTrim(this.read()).slice(0, limit)
  }

  async submit(entry: ScoreEntry): Promise<ScoreEntry[]> {
    const next = sortTrim([...this.read(), entry])
    this.write(next)
    return next.slice(0, MAX_STORED)
  }
}

/**
 * 미래 저장소: 모든 기기가 공유하는 서버 랭킹.
 * 서버에 점수 API가 생기면 createLeaderboard()에서 이걸로 교체한다.
 * 엔드포인트 경로는 백엔드 확정 시 맞춘다. (예시 경로)
 */
export class ApiLeaderboardStore implements LeaderboardStore {
  constructor(
    private readonly base: string,
    private readonly game: string,
  ) {}

  async top(limit = MAX_STORED): Promise<ScoreEntry[]> {
    const res = await fetch(`${this.base}/games/${this.game}/scores?limit=${limit}`)
    if (!res.ok) throw new Error(`랭킹 조회 실패 (${res.status})`)
    return (await res.json()) as ScoreEntry[]
  }

  async submit(entry: ScoreEntry): Promise<ScoreEntry[]> {
    const res = await fetch(`${this.base}/games/${this.game}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
    if (!res.ok) throw new Error(`랭킹 저장 실패 (${res.status})`)
    return (await res.json()) as ScoreEntry[]
  }
}

/**
 * 게임별 랭킹 저장소를 만든다. 백엔드 전환 지점(seam)은 여기 한 곳뿐이다.
 *
 * 서버 API 준비되면 아래 주석을 풀어 ApiLeaderboardStore로 교체:
 *   const base = import.meta.env.VITE_API_BASE as string | undefined
 *   if (base) return new ApiLeaderboardStore(base, game)
 */
export function createLeaderboard(game: string): LeaderboardStore {
  return new LocalLeaderboardStore(`gujuck_${game}_scores`)
}

// ── 이름 입력 오버레이 ────────────────────────────────────────────────────────

let stylesInjected = false
function ensureStyles(): void {
  if (stylesInjected) return
  stylesInjected = true
  const style = document.createElement('style')
  style.textContent = `
.gj-name-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
  background:rgba(15,10,35,0.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
  font-family:'Jua','Apple SD Gothic Neo',sans-serif;padding:24px;box-sizing:border-box;animation:gj-fade .18s ease}
.gj-name-card{width:min(92vw,380px);background:linear-gradient(160deg,#ffffff 0%,#ffeef5 100%);border-radius:24px;
  padding:26px 22px 22px;box-shadow:0 18px 50px rgba(0,0,0,.35);text-align:center;
  animation:gj-pop .22s cubic-bezier(.2,1.3,.4,1)}
.gj-name-title{font-size:22px;color:#3a2b4a;margin-bottom:18px;line-height:1.35}
.gj-name-input{width:100%;box-sizing:border-box;font-family:inherit;font-size:22px;text-align:center;
  padding:12px 14px;border:3px solid #ffc2d6;border-radius:16px;outline:none;color:#3a2b4a;background:#fff;
  transition:border-color .15s}
.gj-name-input:focus{border-color:#ff8fab}
.gj-name-row{display:flex;gap:10px;margin-top:18px}
.gj-name-btn{flex:1;font-family:inherit;font-size:19px;padding:13px 0;border:none;border-radius:16px;cursor:pointer;
  color:#fff;transition:transform .08s,filter .15s}
.gj-name-btn:active{transform:translateY(2px)}
.gj-name-btn:hover{filter:brightness(1.05)}
.gj-name-skip{background:#b8b0c4}
.gj-name-save{background:linear-gradient(160deg,#ff9ec0,#ff6f9c)}
@keyframes gj-fade{from{opacity:0}to{opacity:1}}
@keyframes gj-pop{from{opacity:0;transform:scale(.85) translateY(10px)}to{opacity:1;transform:none}}
`
  document.head.append(style)
}

/**
 * 예쁜 오버레이로 이름을 받는다. 저장하면 입력값(trim), 건너뛰기/취소하면 null.
 * 캔버스 게임 위에 떠서 게임 흐름을 막지 않고 Promise로 결과만 돌려준다.
 */
export function promptName(message: string): Promise<string | null> {
  ensureStyles()
  return new Promise((resolve) => {
    let done = false

    const overlay = document.createElement('div')
    overlay.className = 'gj-name-overlay'

    const card = document.createElement('div')
    card.className = 'gj-name-card'

    const title = document.createElement('div')
    title.className = 'gj-name-title'
    title.textContent = message

    const input = document.createElement('input')
    input.className = 'gj-name-input'
    input.type = 'text'
    input.maxLength = 12
    input.placeholder = '이름'
    input.autocomplete = 'off'

    const row = document.createElement('div')
    row.className = 'gj-name-row'

    const skip = document.createElement('button')
    skip.type = 'button'
    skip.className = 'gj-name-btn gj-name-skip'
    skip.textContent = '건너뛰기'

    const save = document.createElement('button')
    save.type = 'button'
    save.className = 'gj-name-btn gj-name-save'
    save.textContent = '저장 ✨'

    row.append(skip, save)
    card.append(title, input, row)
    overlay.append(card)
    document.body.append(overlay)

    requestAnimationFrame(() => input.focus())

    function finish(value: string | null): void {
      if (done) return
      done = true
      window.removeEventListener('keydown', onKey, true)
      overlay.remove()
      resolve(value)
    }
    function submit(): void {
      const v = input.value.trim()
      finish(v.length ? v : null)
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        finish(null)
      }
    }

    save.addEventListener('click', submit)
    skip.addEventListener('click', () => finish(null))
    window.addEventListener('keydown', onKey, true)
  })
}

/** 컴포넌트 언마운트 시 떠 있던 오버레이를 정리한다. */
export function closeNameOverlays(): void {
  document.querySelectorAll('.gj-name-overlay').forEach((n) => n.remove())
}
