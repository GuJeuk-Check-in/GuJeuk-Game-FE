export function initGame(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!

  // ── Palette ──────────────────────────────────────────────────────────────
  const C  = ['#E8503A', '#2DBF8A', '#4A9FE0', '#F0C840']  // main colors
  const CD = ['#B03020', '#1A8A60', '#2A6FAA', '#C09000']  // dark
  const CL = ['#FFAA99', '#90EED0', '#A8D4F8', '#FFE88A']  // light
  const CNAME = ['빨강', '초록', '파랑', '노랑']
  const LS_KEY = 'gujuck_garden_best'
  const ROUND_TIME = 60
  const GROUND_Y_FRAC = 0.44

  // ── State ─────────────────────────────────────────────────────────────────
  let W = 0, H = 0, dpr = 1
  let state = 'menu'
  let playerCount = 1
  let players: Player[] = []

  type Particle  = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; r: number; rot: number; vr: number; star: boolean }
  type FloatText = { x: number; y: number; vy: number; life: number; maxLife: number; text: string; color: string; size: number }
  type Butterfly = { x: number; y: number; vx: number; phase: number; color: string }
  type Cloud     = { x: number; y: number; w: number; spd: number }
  type CritterType = 'color' | 'gold' | 'bomb' | 'quick' | 'sleep'
  type Hole   = { x: number; y: number; r: number; critter: Critter | null; scolding: number }
  type Critter = { type: CritterType; color: number; state: 'rising' | 'up' | 'falling' | 'scold'; life: number; maxLife: number; appear: number; bob: number; blinkT: number; blink: number }
  type Player = { idx: number; x: number; w: number; holes: Hole[]; score: number; combo: number; bestCombo: number; spawnT: number }

  let particles: Particle[] = []
  let floats:    FloatText[] = []
  let butterflies: Butterfly[] = []
  let clouds: Cloud[] = []
  let elapsed = 0, timeLeft = 0
  let ruleColor = 0, ruleTimer = 0, bannerT = 0
  let shake = 0
  let feverActive = false, feverTimer = 0
  let bestSolo = (() => { try { return parseInt(localStorage.getItem(LS_KEY) ?? '0', 10) || 0 } catch { return 0 } })()
  let uiButtons: { x: number; y: number; w: number; h: number; action: string; data?: number }[] = []

  // ── Audio ─────────────────────────────────────────────────────────────────
  let actx: AudioContext | null = null
  function initAudio() {
    if (!actx) try { actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() } catch (_) {}
  }
  function blip(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.06) {
    if (!actx) return
    try {
      const o = actx.createOscillator(), g = actx.createGain()
      o.type = type; o.frequency.value = freq
      g.gain.setValueAtTime(vol, actx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur)
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur)
    } catch (_) {}
  }
  const sPop   = (c: number) => blip(440 + Math.min(c, 20) * 22, 0.10, 'square')
  const sGold  = () => { blip(880, 0.12, 'triangle'); setTimeout(() => blip(1320, 0.12, 'triangle'), 70) }
  const sBad   = () => blip(120, 0.22, 'sawtooth', 0.07)
  const sRule  = () => { blip(660, 0.1, 'sine'); setTimeout(() => blip(990, 0.12, 'sine'), 90) }
  const sFever = () => { blip(880, 0.08, 'triangle', 0.08); setTimeout(() => blip(1100, 0.08, 'triangle', 0.08), 80); setTimeout(() => blip(1320, 0.12, 'triangle', 0.10), 160) }
  const sQuick = () => blip(1100, 0.06, 'square', 0.06)
  const sSleep = () => blip(330, 0.15, 'triangle', 0.06)

  // ── Layout helpers ────────────────────────────────────────────────────────
  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  }

  function starPath(cx: number, cy: number, r: number) {
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5, a2 = a + Math.PI / 5
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      ctx.lineTo(cx + Math.cos(a2) * r * 0.42, cy + Math.sin(a2) * r * 0.42)
    }
    ctx.closePath()
  }

  function layoutHoles(p: Player) {
    const cols = playerCount === 1 ? 4 : 2
    const rows = playerCount === 1 ? 3 : 2
    const padX = p.w * 0.10, usable = p.w - 2 * padX
    const r = Math.min((usable / cols) * 0.30, H * 0.065)
    const rowYs = playerCount === 1
      ? [H * 0.52, H * 0.68, H * 0.84]
      : [H * 0.60, H * 0.80]
    const holes: Hole[] = []
    for (let row = 0; row < rows; row++)
      for (let c = 0; c < cols; c++)
        holes.push({ x: p.x + padX + (c + 0.5) * (usable / cols), y: rowYs[row], r, critter: null, scolding: 0 })
    p.holes = holes
  }

  function makePlayer(i: number, n: number): Player {
    const lw = W / n
    const p: Player = { idx: i, x: i * lw, w: lw, holes: [], score: 0, combo: 0, bestCombo: 0, spawnT: 0.3 + Math.random() * 0.4 }
    layoutHoles(p)
    return p
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth; H = window.innerHeight
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr)
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    initScenery()
    for (const p of players) layoutHoles(p)
  }

  function initScenery() {
    if (!clouds.length) for (let i = 0; i < 5; i++) clouds.push({ x: Math.random() * W, y: H * (0.05 + Math.random() * 0.14), w: W * (0.08 + Math.random() * 0.07), spd: 8 + Math.random() * 14 })
    if (!butterflies.length) {
      const bc = ['#FF88CC', '#88DDFF', '#FFCC44', '#AAFFAA', '#FF99EE']
      for (let i = 0; i < 6; i++) butterflies.push({ x: Math.random() * W, y: H * (0.24 + Math.random() * 0.18), vx: (Math.random() < 0.5 ? 1 : -1) * (18 + Math.random() * 28), phase: Math.random() * Math.PI * 2, color: bc[i % bc.length] })
    }
  }

  // ── Game logic ────────────────────────────────────────────────────────────
  function startGame(n: number) {
    playerCount = n; elapsed = 0; timeLeft = ROUND_TIME
    players = []; particles = []; floats = []
    feverActive = false; feverTimer = 0; shake = 0
    for (let i = 0; i < n; i++) players.push(makePlayer(i, n))
    ruleColor = Math.floor(Math.random() * 4); ruleTimer = 9; bannerT = 1.2
    state = 'playing'
    initScenery()
  }

  function changeRule() {
    let n: number; do { n = Math.floor(Math.random() * 4) } while (n === ruleColor)
    ruleColor = n; ruleTimer = 8 + Math.random() * 5; bannerT = 1.2; sRule()
    floats.push({ x: W / 2, y: H * 0.22, vy: -55, life: 1.2, maxLife: 1.2, text: '색깔 바뀜!', color: '#fff', size: H * 0.055 })
  }

  function spawnCritter(p: Player) {
    const free = p.holes.filter(h => !h.critter)
    if (!free.length) return
    const h = free[Math.floor(Math.random() * free.length)]
    const roll = Math.random()
    let type: CritterType = 'color', color = ruleColor
    if      (roll < 0.05)                    type = 'gold'
    else if (roll < 0.17)                    type = 'bomb'
    else if (roll < 0.24 && elapsed > 8)     type = 'quick'
    else if (roll < 0.31 && elapsed > 14)    type = 'sleep'
    else { type = 'color'; color = Math.random() < 0.52 ? ruleColor : Math.floor(Math.random() * 4) }
    if (feverActive && type === 'color') color = ruleColor
    const maxLife = type === 'quick' ? 0.55 : Math.max(0.8, 1.5 - elapsed * 0.009)
    h.critter = { type, color, state: 'rising', life: maxLife, maxLife, appear: 0, bob: Math.random() * 6, blinkT: 1.5 + Math.random() * 2.5, blink: 0 }
  }

  function update(dt: number) {
    for (const c of clouds) { c.x -= c.spd * dt; if (c.x < -c.w * 1.5) c.x = W + c.w }
    for (const b of butterflies) {
      b.x += b.vx * dt; b.phase += dt * 4.5; b.y += Math.sin(b.phase) * 15 * dt
      if (b.x < -40) { b.x = W + 40; b.vx = Math.abs(b.vx) }
      if (b.x > W + 40) { b.x = -40; b.vx = -Math.abs(b.vx) }
    }
    for (const pt of particles) { pt.vy += H * 1.1 * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; pt.rot += pt.vr * dt }
    particles = particles.filter(pt => pt.life > 0)
    for (const f of floats) { f.y += f.vy * dt; f.life -= dt }
    floats = floats.filter(f => f.life > 0)
    if (shake > 0) shake = Math.max(0, shake - dt * 3)
    if (state !== 'playing') return

    elapsed += dt; timeLeft -= dt
    if (timeLeft <= 0) { timeLeft = 0; gameOver(); return }
    ruleTimer -= dt; if (ruleTimer <= 0) changeRule()
    if (bannerT > 0) bannerT = Math.max(0, bannerT - dt)
    if (feverActive) { feverTimer -= dt; if (feverTimer <= 0) { feverActive = false; feverTimer = 0 } }

    for (const p of players) {
      p.spawnT -= dt
      if (p.spawnT <= 0) {
        spawnCritter(p)
        const base = Math.max(0.35, 1.0 - elapsed * 0.012)
        p.spawnT = (feverActive ? base * 0.6 : base) + Math.random() * 0.4
      }
      for (const h of p.holes) {
        if (h.scolding > 0) h.scolding -= dt
        const cr = h.critter; if (!cr) continue
        cr.blinkT -= dt; if (cr.blinkT <= 0) { cr.blink = 0.12; cr.blinkT = 1.8 + Math.random() * 2.5 }
        cr.blink = Math.max(0, cr.blink - dt)
        if      (cr.state === 'rising')  { cr.appear += dt / 0.12; if (cr.appear >= 1) { cr.appear = 1; cr.state = 'up' } }
        else if (cr.state === 'up')      { cr.life -= dt; if (cr.life <= 0) cr.state = 'falling' }
        else if (cr.state === 'scold')   { cr.appear -= dt / 0.18; if (cr.appear <= 0) h.critter = null }
        else if (cr.state === 'falling') { cr.appear -= dt / 0.10; if (cr.appear <= 0) h.critter = null }
      }
    }
  }

  function gameOver() {
    state = 'over'
    for (const p of players) p.bestCombo = Math.max(p.bestCombo, p.combo)
    if (playerCount === 1) {
      const s = Math.floor(players[0].score)
      if (s > bestSolo) { bestSolo = s; try { localStorage.setItem(LS_KEY, String(s)) } catch (_) {} }
    }
  }

  function burst(x: number, y: number, color: string, n: number, star: boolean) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = H * (0.22 + Math.random() * 0.55)
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - H * 0.28, life: 0.55 + Math.random() * 0.55, maxLife: 1.1, color, r: H * (star ? 0.015 : 0.011) * (1 + Math.random() * 0.5), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, star })
    }
    if (particles.length > 400) particles.splice(0, particles.length - 400)
  }

  // ── Background ─────────────────────────────────────────────────────────────
  function drawBackground() {
    const t = performance.now() / 1000
    const dayP = Math.min(1, elapsed / ROUND_TIME)

    // Sky
    const sg = ctx.createLinearGradient(0, 0, 0, H * GROUND_Y_FRAC)
    sg.addColorStop(0, feverActive ? '#FFD070' : `hsl(${202 - dayP * 28}, 78%, ${70 - dayP * 14}%)`)
    sg.addColorStop(1, feverActive ? '#FFF0A0' : `hsl(${197 - dayP * 22}, 72%, ${84 - dayP * 12}%)`)
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H * GROUND_Y_FRAC)

    // Sun
    const sunX = W * 0.88, sunY = H * 0.09
    ctx.save(); ctx.globalAlpha = 0.88 - dayP * 0.25
    ctx.fillStyle = '#FFD66B'
    ctx.beginPath(); ctx.arc(sunX, sunY, H * 0.046, 0, 7); ctx.fill()
    ctx.strokeStyle = 'rgba(255,214,107,0.35)'; ctx.lineCap = 'round'
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + t / 8
      ctx.lineWidth = H * 0.006
      ctx.beginPath(); ctx.moveTo(sunX + Math.cos(a) * H * 0.060, sunY + Math.sin(a) * H * 0.060)
      ctx.lineTo(sunX + Math.cos(a) * H * 0.082, sunY + Math.sin(a) * H * 0.082); ctx.stroke()
    }
    ctx.restore()

    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    for (const c of clouds) {
      ctx.beginPath()
      ctx.arc(c.x, c.y, c.w * 0.28, 0, 7)
      ctx.arc(c.x + c.w * 0.28, c.y - c.w * 0.08, c.w * 0.20, 0, 7)
      ctx.arc(c.x - c.w * 0.26, c.y + c.w * 0.02, c.w * 0.18, 0, 7); ctx.fill()
    }

    // Far hills
    ctx.fillStyle = feverActive ? '#A0E068' : '#8BC06A'
    ctx.beginPath(); ctx.moveTo(0, H * GROUND_Y_FRAC)
    for (let x = 0; x <= W; x += W / 6)
      ctx.quadraticCurveTo(x + W / 12, H * (GROUND_Y_FRAC - 0.06), x + W / 6, H * GROUND_Y_FRAC)
    ctx.lineTo(W, H * GROUND_Y_FRAC); ctx.closePath(); ctx.fill()

    // Ground
    const gg = ctx.createLinearGradient(0, H * GROUND_Y_FRAC, 0, H)
    gg.addColorStop(0,    feverActive ? '#90DD60' : '#7FC442')
    gg.addColorStop(0.12, feverActive ? '#88CC55' : '#6AB038')
    gg.addColorStop(1, '#548C2A')
    ctx.fillStyle = gg; ctx.fillRect(0, H * GROUND_Y_FRAC, W, H - H * GROUND_Y_FRAC)

    drawFence()
    drawFlowerBeds()
    drawTrees()
    drawButterflies()
  }

  function drawFence() {
    const fy = H * (GROUND_Y_FRAC + 0.018), fh = H * 0.058, pw = H * 0.017
    ctx.fillStyle = '#C8A060'
    ctx.fillRect(0, fy, W, fh * 0.15)
    ctx.fillRect(0, fy + fh * 0.48, W, fh * 0.15)
    for (let x = 0; x < W + pw; x += W * 0.076) {
      ctx.fillStyle = '#B89050'; ctx.fillRect(x - pw / 2, fy - fh * 0.08, pw, fh * 1.18)
      ctx.fillStyle = '#D4AA70'; ctx.beginPath(); ctx.arc(x, fy - fh * 0.08, pw * 0.68, Math.PI, 0); ctx.fill()
    }
  }

  function drawFlowerBeds() {
    const t = performance.now() / 1000
    const scoreP = players.length > 0 ? Math.min(1, (players[0]?.score || 0) / 200) : 0
    const nF = Math.floor(8 + scoreP * 22)
    const seed = 37
    const fc = ['#FF88CC', '#FF4488', '#FFDD44', '#88FFCC', '#AA88FF', '#FF8844']
    for (let i = 0; i < nF; i++) {
      const fx = ((seed * 7 + i * 139) % Math.max(1, W - 60)) + 30
      const fy = H * (GROUND_Y_FRAC + 0.06) + ((seed * 11 + i * 53) % (H * 0.34))
      const stemH = H * 0.038
      ctx.strokeStyle = '#4A8A30'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - stemH); ctx.stroke()
      const pr2 = H * 0.013, cy = fy - stemH
      ctx.fillStyle = fc[i % fc.length]
      for (let pi = 0; pi < 5; pi++) {
        const a = (pi / 5) * Math.PI * 2 + t * 0.25 + i
        ctx.beginPath(); ctx.arc(fx + Math.cos(a) * pr2, cy + Math.sin(a) * pr2, pr2 * 0.75, 0, 7); ctx.fill()
      }
      ctx.fillStyle = '#FFDD44'; ctx.beginPath(); ctx.arc(fx, cy, pr2 * 0.65, 0, 7); ctx.fill()
    }
  }

  function drawTrees() {
    const drawOne = (tx: number, ty: number) => {
      ctx.fillStyle = '#7A5030'; ctx.fillRect(tx - H * 0.018, ty - H * 0.14, H * 0.036, H * 0.15)
      ctx.fillStyle = '#3A7A28'; ctx.beginPath(); ctx.arc(tx, ty - H * 0.21, H * 0.105, 0, 7); ctx.fill()
      ctx.fillStyle = '#4A9A38'
      ctx.beginPath(); ctx.arc(tx - H * 0.055, ty - H * 0.26, H * 0.078, 0, 7); ctx.fill()
      ctx.beginPath(); ctx.arc(tx + H * 0.048, ty - H * 0.25, H * 0.070, 0, 7); ctx.fill()
      ctx.fillStyle = '#5AB048'; ctx.beginPath(); ctx.arc(tx, ty - H * 0.31, H * 0.055, 0, 7); ctx.fill()
    }
    const ty = H * (GROUND_Y_FRAC - 0.015)
    drawOne(W * 0.04, ty); drawOne(W * 0.96, ty)
    if (W > 600) { drawOne(W * 0.115, ty + H * 0.01); drawOne(W * 0.885, ty + H * 0.01) }
  }

  function drawButterflies() {
    const t = performance.now() / 1000
    for (const b of butterflies) {
      const flap = Math.sin(t * 7 + b.phase) * 0.38
      ctx.save(); ctx.translate(b.x, b.y); ctx.globalAlpha = 0.78
      ctx.fillStyle = b.color
      for (const side of [-1, 1]) {
        ctx.save(); ctx.scale(side * (b.vx < 0 ? -1 : 1), 1)
        ctx.beginPath(); ctx.ellipse(7, flap * 8, 9, 6, -0.4, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
      ctx.fillStyle = '#5A3A20'; ctx.beginPath(); ctx.ellipse(0, 0, 2.5, 7, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
  }

  // ── Holes & Critters ──────────────────────────────────────────────────────
  function drawHoles(p: Player) {
    for (const h of p.holes) {
      ctx.fillStyle = 'rgba(0,0,0,0.20)'
      ctx.beginPath(); ctx.ellipse(h.x, h.y + h.r * 0.1, h.r * 1.08, h.r * 0.52, 0, 0, 7); ctx.fill()
      const hg = ctx.createRadialGradient(h.x, h.y - h.r * 0.1, 0, h.x, h.y, h.r * 0.95)
      hg.addColorStop(0, '#18280A'); hg.addColorStop(0.5, '#28480A'); hg.addColorStop(1, '#386018')
      ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r * 0.95, h.r * 0.44, 0, 0, 7); ctx.fill()
      ctx.strokeStyle = '#8A6A30'; ctx.lineWidth = h.r * 0.11
      ctx.beginPath(); ctx.ellipse(h.x, h.y - h.r * 0.04, h.r * 0.94, h.r * 0.41, 0, Math.PI, 0); ctx.stroke()
    }
    for (const h of p.holes) drawCritter(h)
  }

  function drawCritter(h: Hole) {
    const cr = h.critter; if (!cr || cr.appear <= 0) return
    const ap = cr.appear, r = h.r * ap
    const cy = h.y - h.r * 0.60 * ap
    const t = performance.now() / 1000
    const bob = Math.sin(t * 1.9 + cr.bob) * r * 0.036

    ctx.save()
    ctx.beginPath(); ctx.rect(h.x - h.r * 2.2, 0, h.r * 4.4, h.y + 6); ctx.clip()

    // Fever glow
    if (feverActive && cr.type === 'color' && cr.color === ruleColor) {
      ctx.save(); ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 8); ctx.fillStyle = '#FFD700'
      ctx.beginPath(); ctx.arc(h.x, cy + bob, r * 1.55, 0, 7); ctx.fill(); ctx.restore()
    }

    if (cr.type === 'gold') {
      ctx.fillStyle = '#FFD23E'; starPath(h.x, cy + bob, r * 1.12); ctx.fill()
      ctx.fillStyle = '#FFF3B0'; starPath(h.x, cy + bob, r * 0.56); ctx.fill()
      ctx.fillStyle = '#5A3A00'
      ctx.beginPath(); ctx.arc(h.x - r * 0.24, cy - r * 0.06 + bob, r * 0.12, 0, 7); ctx.arc(h.x + r * 0.24, cy - r * 0.06 + bob, r * 0.12, 0, 7); ctx.fill()
      ctx.strokeStyle = '#5A3A00'; ctx.lineWidth = r * 0.10; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(h.x, cy + r * 0.14 + bob, r * 0.25, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke()

    } else if (cr.type === 'bomb') {
      ctx.fillStyle = '#33393F'; ctx.beginPath(); ctx.arc(h.x, cy + bob, r * 0.9, 0, 7); ctx.fill()
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4
        ctx.fillStyle = '#232830'; ctx.beginPath(); ctx.arc(h.x + Math.cos(a) * r * 0.88, cy + Math.sin(a) * r * 0.88 + bob, r * 0.14, 0, 7); ctx.fill()
      }
      ctx.strokeStyle = '#C0A060'; ctx.lineWidth = r * 0.1
      ctx.beginPath(); ctx.moveTo(h.x + r * 0.1, cy - r * 0.9 + bob); ctx.quadraticCurveTo(h.x + r * 0.44, cy - r * 1.32 + bob, h.x + r * 0.2, cy - r * 1.52 + bob); ctx.stroke()
      const sparkA = (t * 5) % (Math.PI * 2)
      ctx.fillStyle = '#FF8800'; ctx.beginPath(); ctx.arc(h.x + r * 0.2 + Math.cos(sparkA) * r * 0.05, cy - r * 1.52 + Math.sin(sparkA) * r * 0.05 + bob, r * 0.10, 0, 7); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(h.x - r * 0.28, cy + bob, r * 0.16, 0, 7); ctx.arc(h.x + r * 0.28, cy + bob, r * 0.16, 0, 7); ctx.fill()
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(h.x - r * 0.28, cy + bob, r * 0.08, 0, 7); ctx.arc(h.x + r * 0.28, cy + bob, r * 0.08, 0, 7); ctx.fill()

    } else if (cr.type === 'quick') {
      const lifeP = cr.life / cr.maxLife
      ctx.fillStyle = `hsl(${188 + lifeP * 28}, 84%, 54%)`
      roundRect(h.x - r * 0.88, cy - r * 0.92 + bob, r * 1.76, r * 1.82, r * 0.74); ctx.fill()
      // Lightning bolt emblem
      ctx.fillStyle = '#FFF700'
      ctx.beginPath()
      ctx.moveTo(h.x + r * 0.08,  cy - r * 0.58 + bob); ctx.lineTo(h.x - r * 0.12, cy + bob)
      ctx.lineTo(h.x + r * 0.06,  cy + bob);             ctx.lineTo(h.x - r * 0.08, cy + r * 0.52 + bob)
      ctx.lineTo(h.x + r * 0.20,  cy + r * 0.05 + bob);  ctx.lineTo(h.x + r * 0.02, cy + r * 0.05 + bob)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(h.x - r * 0.3, cy - r * 0.08 + bob, r * 0.20, 0, 7); ctx.arc(h.x + r * 0.3, cy - r * 0.08 + bob, r * 0.20, 0, 7); ctx.fill()
      ctx.fillStyle = '#111';  ctx.beginPath(); ctx.arc(h.x - r * 0.28, cy - r * 0.06 + bob, r * 0.10, 0, 7); ctx.arc(h.x + r * 0.32, cy - r * 0.06 + bob, r * 0.10, 0, 7); ctx.fill()
      if (lifeP < 0.35) {
        ctx.save(); ctx.globalAlpha = (1 - lifeP / 0.35) * 0.5 * (Math.sin(t * 22) > 0 ? 1 : 0.15)
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(h.x, cy + bob, r * 1.15, 0, 7); ctx.fill(); ctx.restore()
      }

    } else if (cr.type === 'sleep') {
      const lifeP = cr.life / cr.maxLife
      const col = C[cr.color]
      roundRect(h.x - r * 0.88, cy - r * 0.92 + bob, r * 1.76, r * 1.84, r * 0.74); ctx.fillStyle = col; ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; roundRect(h.x - r * 0.58, cy - r * 0.80 + bob, r * 0.70, r * 0.42, r * 0.20); ctx.fill()
      // Closed eyes
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = r * 0.10; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(h.x - r * 0.30, cy - r * 0.05 + bob, r * 0.17, Math.PI, 0); ctx.stroke()
      ctx.beginPath(); ctx.arc(h.x + r * 0.30, cy - r * 0.05 + bob, r * 0.17, Math.PI, 0); ctx.stroke()
      // Rosy cheeks
      ctx.save(); ctx.globalAlpha = 0.42; ctx.fillStyle = '#FF8888'
      ctx.beginPath(); ctx.arc(h.x - r * 0.52, cy + r * 0.10 + bob, r * 0.22, 0, 7); ctx.fill()
      ctx.beginPath(); ctx.arc(h.x + r * 0.52, cy + r * 0.10 + bob, r * 0.22, 0, 7); ctx.fill()
      ctx.restore()
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = r * 0.09
      ctx.beginPath(); ctx.arc(h.x, cy + r * 0.34 + bob, r * 0.22, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke()
      // ZZZ floating
      if (lifeP > 0.5) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        for (let z = 0; z < 3; z++) {
          const za = (t * 0.85 + z * 0.42) % 1
          ctx.save(); ctx.globalAlpha = (1 - za) * 0.85; ctx.fillStyle = '#8888FF'
          ctx.font = `bold ${r * 0.48}px sans-serif`
          ctx.fillText('z', h.x + r * (0.58 + za * 0.65), cy - r * (0.82 + za * 0.82) + bob)
          ctx.restore()
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      }

    } else {
      // Normal color critter — round cute blob
      const col = C[cr.color], light = CL[cr.color]
      const bob2 = Math.sin(t * 2.3 + cr.bob) * r * 0.04
      roundRect(h.x - r * 0.88, cy - r * 0.95 + bob2, r * 1.76, r * 1.92, r * 0.76); ctx.fillStyle = col; ctx.fill()
      ctx.save(); ctx.globalAlpha = 0.28; roundRect(h.x - r * 0.58, cy - r * 0.82 + bob2, r * 0.70, r * 0.44, r * 0.22); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore()
      ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(h.x, cy + r * 0.22 + bob2, r * 0.50, r * 0.40, 0, 0, 7); ctx.fill()
      ctx.save(); ctx.globalAlpha = 0.50; ctx.fillStyle = '#FF9999'
      ctx.beginPath(); ctx.arc(h.x - r * 0.52, cy + r * 0.05 + bob2, r * 0.20, 0, 7); ctx.fill()
      ctx.beginPath(); ctx.arc(h.x + r * 0.52, cy + r * 0.05 + bob2, r * 0.20, 0, 7); ctx.fill()
      ctx.restore()
      if (cr.blink <= 0) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(h.x - r * 0.32, cy - r * 0.08 + bob2, r * 0.21, 0, 7); ctx.arc(h.x + r * 0.32, cy - r * 0.08 + bob2, r * 0.21, 0, 7); ctx.fill()
        ctx.fillStyle = '#1a1a2e'; ctx.beginPath(); ctx.arc(h.x - r * 0.30, cy - r * 0.06 + bob2, r * 0.12, 0, 7); ctx.arc(h.x + r * 0.34, cy - r * 0.06 + bob2, r * 0.12, 0, 7); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(h.x - r * 0.27, cy - r * 0.10 + bob2, r * 0.05, 0, 7); ctx.arc(h.x + r * 0.37, cy - r * 0.10 + bob2, r * 0.05, 0, 7); ctx.fill()
      } else {
        ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = r * 0.09; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(h.x - r * 0.44, cy - r * 0.08 + bob2); ctx.lineTo(h.x - r * 0.20, cy - r * 0.08 + bob2); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(h.x + r * 0.20, cy - r * 0.08 + bob2); ctx.lineTo(h.x + r * 0.44, cy - r * 0.08 + bob2); ctx.stroke()
      }
      ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = r * 0.09; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(h.x, cy + r * 0.37 + bob2, r * 0.26, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke()
      if (h.scolding > 0) {
        ctx.save(); ctx.globalAlpha = Math.min(1, h.scolding * 3)
        ctx.fillStyle = '#FF3333'; ctx.font = `bold ${r * 0.62}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('✕', h.x, cy - r * 1.08 + bob2); ctx.restore()
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      }
    }
    ctx.restore()
  }

  // ── Particles & Floats ────────────────────────────────────────────────────
  function drawParticles() {
    for (const pt of particles) {
      ctx.save(); ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife); ctx.fillStyle = pt.color
      ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot)
      if (pt.star) { starPath(0, 0, pt.r); ctx.fill() } else { ctx.beginPath(); ctx.arc(0, 0, pt.r, 0, 7); ctx.fill() }
      ctx.restore()
    }
  }

  function drawFloats() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const f of floats) {
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, f.life / f.maxLife))
      ctx.font = `bold ${Math.floor(f.size)}px Jua, sans-serif`
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = f.size * 0.13
      ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y)
      ctx.restore()
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  // ── Game UI ────────────────────────────────────────────────────────────────
  function drawUI() {
    const t = performance.now() / 1000
    const urgency = timeLeft < 10

    // Timer bar
    const barH = H * 0.026
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, W, barH)
    const frac = Math.max(0, timeLeft / ROUND_TIME)
    const tg = ctx.createLinearGradient(0, 0, W * frac, 0)
    if (urgency) { tg.addColorStop(0, '#FF2244'); tg.addColorStop(1, '#FF7744') }
    else         { tg.addColorStop(0, '#44DDAA'); tg.addColorStop(0.5, '#66EEBB'); tg.addColorStop(1, '#44CCFF') }
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W * frac * (urgency ? (1 + Math.sin(t * 9) * 0.015) : 1), barH)
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.floor(barH * 1.1)}px Jua, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText(Math.ceil(timeLeft) + 's', W - 8, barH / 2)

    // Fever banner
    if (feverActive) {
      const glow = 0.72 + 0.28 * Math.sin(t * 11)
      ctx.save(); ctx.globalAlpha = glow
      ctx.fillStyle = '#FFD700'
      roundRect(W / 2 - H * 0.22, H * 0.038, H * 0.44, H * 0.065, H * 0.022); ctx.fill()
      ctx.fillStyle = '#5A3A00'; ctx.font = `bold ${Math.floor(H * 0.040)}px Jua, sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🔥 피버! 다 맞아요!', W / 2, H * 0.070)
      // Fever countdown bar
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      roundRect(W / 2 - H * 0.18, H * 0.096, H * 0.36, H * 0.013, H * 0.006); ctx.fill()
      ctx.fillStyle = '#FF8800'
      roundRect(W / 2 - H * 0.18, H * 0.096, H * 0.36 * (feverTimer / 3), H * 0.013, H * 0.006); ctx.fill()
      ctx.restore()
    } else {
      // Rule banner
      const pulse = 1 + bannerT * 0.26
      const bw = H * 0.32 * pulse, bh = H * 0.068 * pulse, by = H * 0.038 + bh / 2
      ctx.save(); ctx.globalAlpha = 0.93
      ctx.fillStyle = C[ruleColor]; roundRect(W / 2 - bw / 2, by - bh / 2, bw, bh, bh * 0.42); ctx.fill()
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = H * 0.008
      ctx.font = `bold ${Math.floor(H * 0.037 * pulse)}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.strokeText(CNAME[ruleColor] + ' 친구만 콕!', W / 2, by); ctx.fillText(CNAME[ruleColor] + ' 친구만 콕!', W / 2, by)
      ctx.restore()
    }

    // Scores
    for (const p of players) {
      const cx = p.x + p.w / 2; ctx.textAlign = 'center'
      if (playerCount > 1) {
        ctx.fillStyle = C[p.idx]; ctx.font = `bold ${Math.floor(H * 0.030)}px Jua, sans-serif`; ctx.fillText((p.idx + 1) + 'P', cx, H * 0.168)
      }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = H * 0.007
      ctx.font = `bold ${Math.floor(H * 0.064)}px Jua, sans-serif`; ctx.textBaseline = 'middle'
      ctx.strokeText(String(Math.floor(p.score)), cx, H * 0.228); ctx.fillText(String(Math.floor(p.score)), cx, H * 0.228)
      if (p.combo > 1) {
        const icon = p.combo >= 10 ? '🔥' : '⭐'
        ctx.fillStyle = p.combo >= 10 ? '#FFD700' : '#FF8A3D'
        ctx.font = `bold ${Math.floor(H * 0.036)}px Jua, sans-serif`
        ctx.fillText(icon + ' 콤보 x' + p.combo, cx, H * 0.276)
      }
    }

    if (playerCount > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.62)'; ctx.lineWidth = Math.max(3, W * 0.004); ctx.setLineDash([12, 10])
      for (let i = 1; i < playerCount; i++) { const x = i * (W / playerCount); ctx.beginPath(); ctx.moveTo(x, H * GROUND_Y_FRAC); ctx.lineTo(x, H); ctx.stroke() }
      ctx.setLineDash([])
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  // ── Buttons ────────────────────────────────────────────────────────────────
  function button(x: number, y: number, w: number, h: number, label: string, color: string, action: string, data?: number) {
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; roundRect(x + 3, y + 5, w, h, h * 0.28); ctx.fill()
    roundRect(x, y, w, h, h * 0.28); ctx.fillStyle = color; ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; roundRect(x + h * 0.08, y + h * 0.10, w - h * 0.16, h * 0.40, h * 0.20); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.floor(h * 0.42)}px Jua, sans-serif`
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 4
    ctx.fillText(label, x + w / 2, y + h / 2); ctx.restore()
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    uiButtons.push({ x, y, w, h, action, data })
  }

  // ── Menu ──────────────────────────────────────────────────────────────────
  function drawMenu() {
    drawBackground()
    ctx.fillStyle = 'rgba(10,35,8,0.56)'; ctx.fillRect(0, 0, W, H)
    const bob = Math.sin(performance.now() / 320) * H * 0.012
    ctx.save(); ctx.shadowColor = '#88FF88'; ctx.shadowBlur = 28
    ctx.strokeStyle = 'rgba(40,120,40,0.5)'; ctx.lineWidth = H * 0.008
    ctx.font = `bold ${Math.floor(H * 0.11)}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#E8FFE0'; ctx.strokeText('콕콕 정원', W / 2, H * 0.175 + bob); ctx.fillText('콕콕 정원', W / 2, H * 0.175 + bob)
    ctx.restore()

    const info = [
      { t: '맞는 색깔 두더지를 콕! 폭탄은 참아요!',        c: '#D8FFD0' },
      { t: '⚡ 번개두더지 +20점   😴 잠든두더지 일찍 누르면 2배!', c: '#C0F0FF' },
      { t: '🔥 10콤보 달성 → 3초 피버! 전부 정답!',       c: '#FFE88A' },
      { t: '⭐ 황금별 +30점 (콤보 보너스)',               c: '#FFD700' },
    ]
    info.forEach((inf, i) => {
      ctx.fillStyle = inf.c; ctx.font = `${Math.floor(H * 0.034)}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(inf.t, W / 2, H * 0.298 + i * H * 0.060)
    })

    ctx.fillStyle = '#E8FFE0'; ctx.font = `${Math.floor(H * 0.036)}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('몇 명이 할까?', W / 2, H * 0.540)

    uiButtons = []
    const bw = Math.min(W * 0.2, H * 0.22), bh = bw * 0.65, gap = W * 0.025
    const totalW = bw * 4 + gap * 3; let bx = (W - totalW) / 2
    for (let i = 0; i < 4; i++) { button(bx, H * 0.608, bw, bh, ['혼자', '2명', '3명', '4명'][i], CD[i], 'start', i + 1); bx += bw + gap }

    ctx.fillStyle = '#FFD700'; ctx.font = `bold ${Math.floor(H * 0.040)}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('🏆 최고 점수: ' + bestSolo, W / 2, H * 0.808)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  // ── Game Over ─────────────────────────────────────────────────────────────
  function drawOver() {
    drawBackground()
    ctx.fillStyle = 'rgba(10,35,8,0.62)'; ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.save(); ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 22
    ctx.fillStyle = '#FFFACC'; ctx.font = `bold ${Math.floor(H * 0.10)}px Jua, sans-serif`
    ctx.fillText('결과!', W / 2, H * 0.14); ctx.restore()
    const scores = players.map(p => ({ i: p.idx, s: Math.floor(p.score), bc: p.bestCombo, c: C[p.idx] }))
    const best = Math.max(...scores.map(o => o.s))
    ctx.font = `bold ${Math.floor(H * 0.050)}px Jua, sans-serif`
    scores.forEach((o, k) => {
      ctx.save(); ctx.shadowColor = o.c; ctx.shadowBlur = 8; ctx.fillStyle = o.c
      ctx.fillText((playerCount > 1 ? (o.i + 1) + 'P : ' : '') + o.s + '점  최고콤보 ' + o.bc + (o.s === best && playerCount > 1 ? '  🥇' : ''), W / 2, H * 0.26 + k * H * 0.08)
      ctx.restore()
    })
    if (playerCount === 1) {
      const isNew = Math.floor(players[0].score) >= bestSolo
      ctx.fillStyle = '#FFD700'; ctx.font = `bold ${Math.floor(H * 0.040)}px Jua, sans-serif`
      ctx.fillText((isNew ? '🎉 신기록! ' : '🏆 최고 점수: ') + bestSolo, W / 2, H * 0.655)
    }
    uiButtons = []
    const bw = Math.min(W * 0.30, H * 0.32), bh = bw * 0.38, gap = W * 0.03
    const totalW = bw * 2 + gap; let bx = (W - totalW) / 2
    button(bx, H * 0.760, bw, bh, '또 하기 ▶', '#2DBF8A', 'again'); bx += bw + gap
    button(bx, H * 0.760, bw, bh, '처음으로',   '#4A9FE0', 'menu')
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  let last = performance.now(), animId: number

  function loop(now: number) {
    let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05
    update(dt)
    ctx.save()
    if (shake > 0) { const a = shake * H * 0.022; ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a) }
    if (state === 'playing') { drawBackground(); for (const p of players) drawHoles(p); drawParticles(); drawFloats(); drawUI() }
    else if (state === 'menu') drawMenu()
    else drawOver()
    ctx.restore()
    animId = requestAnimationFrame(loop)
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  function playerAt(x: number) { return Math.max(0, Math.min(playerCount - 1, Math.floor(x / (W / playerCount)))) }

  function tapGame(x: number, y: number) {
    const p = players[playerAt(x)]
    let target: Hole | null = null, td = 1e9
    for (const h of p.holes) {
      const cr = h.critter; if (!cr || cr.appear < 0.25) continue
      const cy = h.y - h.r * 0.60 * cr.appear
      const d = Math.hypot(x - h.x, y - cy)
      if (d < h.r * 1.95 && d < td) { td = d; target = h }
    }
    if (!target) return
    const cr = target.critter!, cy = target.y - target.r * 0.60

    if (cr.type === 'gold') {
      p.combo++; const pts = 30 + p.combo * 2; p.score += pts
      burst(target.x, cy, '#FFD23E', 18, true); sGold()
      floats.push({ x: target.x, y: cy, vy: -95, life: 1.0, maxLife: 1.0, text: '+' + pts, color: '#FFD23E', size: H * 0.048 })

    } else if (cr.type === 'bomb') {
      p.bestCombo = Math.max(p.bestCombo, p.combo); p.combo = 0; p.score = Math.max(0, p.score - 5)
      burst(target.x, cy, '#555', 10, false); shake = 0.28; sBad()
      floats.push({ x: target.x, y: cy, vy: -75, life: 0.9, maxLife: 0.9, text: '펑! -5', color: '#fff', size: H * 0.046 })

    } else if (cr.type === 'quick') {
      p.combo++; const pts = 20 + p.combo; p.score += pts
      burst(target.x, cy, '#44DDFF', 14, false); sQuick()
      floats.push({ x: target.x, y: cy, vy: -100, life: 0.85, maxLife: 0.85, text: '⚡+' + pts, color: '#44DDFF', size: H * 0.044 })

    } else if (cr.type === 'sleep') {
      const lifeP = cr.life / cr.maxLife
      const isEarly = lifeP > 0.5
      p.combo++; const pts = isEarly ? 20 : 10; p.score += pts
      burst(target.x, cy, CL[cr.color], 12, false); sSleep()
      floats.push({ x: target.x, y: cy, vy: -88, life: 0.9, maxLife: 0.9, text: isEarly ? '😴 +' + pts + ' 보너스!' : '+' + pts, color: isEarly ? '#AAAAFF' : '#fff', size: H * 0.044 })

    } else {
      const correct = cr.color === ruleColor || feverActive
      if (correct) {
        p.combo++; const pts = 5 + p.combo; p.score += pts
        burst(target.x, cy, C[cr.color], 13, false); sPop(p.combo)
        floats.push({ x: target.x, y: cy, vy: -82, life: 0.88, maxLife: 0.88, text: '+' + pts, color: C[cr.color], size: H * 0.042 })
        if (p.combo > 0 && p.combo % 5 === 0) {
          burst(target.x, cy, '#fff', 14, true)
          floats.push({ x: target.x, y: cy - H * 0.045, vy: -95, life: 1.0, maxLife: 1.0, text: '콤보!', color: '#FF8A3D', size: H * 0.052 })
        }
        // Fever trigger at 10 combo
        if (p.combo >= 10 && !feverActive) {
          feverActive = true; feverTimer = 3.0; sFever()
          floats.push({ x: W / 2, y: H * 0.32, vy: -62, life: 1.2, maxLife: 1.2, text: '🔥 피버!', color: '#FFD700', size: H * 0.072 })
          burst(W / 2, H * 0.52, '#FFD700', 28, true)
        }
      } else {
        p.bestCombo = Math.max(p.bestCombo, p.combo); p.combo = 0; p.score = Math.max(0, p.score - 3)
        shake = 0.18; sBad(); target.scolding = 0.5
        floats.push({ x: target.x, y: cy, vy: -65, life: 0.80, maxLife: 0.80, text: '아니야~ -3', color: '#FFB0B0', size: H * 0.038 })
      }
    }
    target.critter = null
  }

  const handlePointerDown = (e: PointerEvent) => {
    e.preventDefault(); initAudio()
    const r = canvas.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    if (state === 'playing') tapGame(x, y)
    else {
      for (const b of uiButtons) {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          if (b.action === 'start') startGame(b.data!)
          else if (b.action === 'again') startGame(playerCount)
          else if (b.action === 'menu') { state = 'menu'; players = [] }
          break
        }
      }
    }
  }

  canvas.addEventListener('pointerdown', handlePointerDown, { passive: false })
  window.addEventListener('resize', resize)
  resize()
  animId = requestAnimationFrame(loop)

  return () => {
    cancelAnimationFrame(animId)
    canvas.removeEventListener('pointerdown', handlePointerDown)
    window.removeEventListener('resize', resize)
  }
}
