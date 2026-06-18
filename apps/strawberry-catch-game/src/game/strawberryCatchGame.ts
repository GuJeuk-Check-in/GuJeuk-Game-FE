export function initGame(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!

  // ── Config ────────────────────────────────────────────────────────────────
  const LS_KEY = 'gujuck_strawberry_best'
  const MAX_HEARTS = 3
  const GROUND_Y_FRAC = 0.78

  type ItemKind = 'strawberry' | 'cherry' | 'apple' | 'golden' | 'bomb' | 'clover'
  type Item = {
    kind: ItemKind; x: number; y: number; vy: number; r: number
    rot: number; vr: number; sway: number; swaySpd: number; baseX: number
    judged: boolean; good: boolean; caught?: boolean
  }
  type Particle  = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; r: number; rot: number; vr: number; star: boolean }
  type FloatText = { x: number; y: number; vy: number; life: number; maxLife: number; text: string; color: string; size: number }
  type Cloud     = { x: number; y: number; w: number; spd: number }
  type Bird      = { x: number; y: number; vx: number; phase: number }

  // ── State ─────────────────────────────────────────────────────────────────
  let W = 0, H = 0, dpr = 1
  let state: 'menu' | 'playing' | 'over' = 'menu'

  let items: Item[] = []
  let particles: Particle[] = []
  let floats: FloatText[] = []
  let clouds: Cloud[] = []
  let birds: Bird[] = []

  let basketX = 0, basketTargetX = 0
  let score = 0, combo = 0, bestCombo = 0
  let hearts = MAX_HEARTS
  let elapsed = 0, spawnT = 0
  let shake = 0, heartFlash = 0, catchPulse = 0
  let feverActive = false, feverTimer = 0
  let best = (() => { try { return parseInt(localStorage.getItem(LS_KEY) ?? '0', 10) || 0 } catch { return 0 } })()
  let uiButtons: { x: number; y: number; w: number; h: number; action: string }[] = []
  let keyDir = 0

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
  const sCatch = (c: number) => blip(520 + Math.min(c, 20) * 24, 0.09, 'square')
  const sGold  = () => { blip(880, 0.10, 'triangle'); setTimeout(() => blip(1320, 0.12, 'triangle'), 70) }
  const sBomb  = () => blip(110, 0.26, 'sawtooth', 0.08)
  const sHeal  = () => { blip(660, 0.1, 'sine'); setTimeout(() => blip(990, 0.13, 'sine'), 80) }
  const sFever = () => { blip(880, 0.08, 'triangle', 0.08); setTimeout(() => blip(1100, 0.08, 'triangle', 0.08), 80); setTimeout(() => blip(1320, 0.12, 'triangle', 0.1), 160) }
  const sOver  = () => { blip(440, 0.14, 'triangle'); setTimeout(() => blip(330, 0.16, 'triangle'), 130); setTimeout(() => blip(220, 0.26, 'triangle'), 280) }

  // ── Helpers ───────────────────────────────────────────────────────────────
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
  const basketW = () => Math.min(W * 0.22, H * 0.20) * (feverActive ? 1.35 : 1)
  const basketRimY = () => H * 0.80
  const itemR = () => Math.max(16, H * 0.034)

  // ── Layout / scenery ──────────────────────────────────────────────────────
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth; H = window.innerHeight
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr)
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (basketX === 0) { basketX = W / 2; basketTargetX = W / 2 }
    initScenery()
  }
  function initScenery() {
    if (!clouds.length) for (let i = 0; i < 5; i++) clouds.push({ x: Math.random() * W, y: H * (0.05 + Math.random() * 0.16), w: W * (0.08 + Math.random() * 0.07), spd: 7 + Math.random() * 12 })
    if (!birds.length) for (let i = 0; i < 3; i++) birds.push({ x: Math.random() * W, y: H * (0.10 + Math.random() * 0.12), vx: (Math.random() < 0.5 ? 1 : -1) * (22 + Math.random() * 18), phase: Math.random() * 6 })
  }

  // ── Game logic ────────────────────────────────────────────────────────────
  function startGame() {
    state = 'playing'
    items = []; particles = []; floats = []
    score = 0; combo = 0; bestCombo = 0; hearts = MAX_HEARTS
    elapsed = 0; spawnT = 0.6; shake = 0; heartFlash = 0; catchPulse = 0
    feverActive = false; feverTimer = 0
    basketTargetX = basketX = W / 2
    initScenery()
  }

  function spawnItem() {
    const roll = Math.random()
    let kind: ItemKind
    const bombChance = feverActive || elapsed < 5 ? 0 : 0.18
    if (roll < bombChance)                              kind = 'bomb'
    else if (roll < bombChance + 0.03)                 kind = 'clover'
    else if (roll < bombChance + 0.09)                 kind = 'golden'
    else {
      const f = Math.random()
      kind = f < 0.5 ? 'strawberry' : f < 0.78 ? 'apple' : 'cherry'
    }
    const r = itemR() * (kind === 'cherry' ? 0.82 : kind === 'golden' ? 1.08 : 1)
    const baseX = r * 1.5 + Math.random() * (W - r * 3)
    const fall = H * (0.30 + elapsed * 0.0065) * (kind === 'cherry' ? 1.18 : 1)
    items.push({
      kind, x: baseX, baseX, y: -r * 2, vy: Math.min(fall, H * 0.78), r,
      rot: 0, vr: (Math.random() - 0.5) * 2.5, sway: 0, swaySpd: 1 + Math.random() * 1.5,
      judged: false, good: kind !== 'bomb',
    })
  }

  function update(dt: number) {
    for (const c of clouds) { c.x -= c.spd * dt; if (c.x < -c.w * 1.5) c.x = W + c.w }
    for (const b of birds) {
      b.x += b.vx * dt; b.phase += dt * 6
      if (b.x < -50) b.x = W + 50; if (b.x > W + 50) b.x = -50
    }
    for (const pt of particles) { pt.vy += H * 1.0 * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; pt.rot += pt.vr * dt }
    particles = particles.filter(pt => pt.life > 0)
    for (const f of floats) { f.y += f.vy * dt; f.life -= dt }
    floats = floats.filter(f => f.life > 0)
    if (shake > 0) shake = Math.max(0, shake - dt * 3)
    if (heartFlash > 0) heartFlash = Math.max(0, heartFlash - dt * 2)
    if (catchPulse > 0) catchPulse = Math.max(0, catchPulse - dt * 4)
    if (state !== 'playing') return

    elapsed += dt
    if (feverActive) { feverTimer -= dt; if (feverTimer <= 0) { feverActive = false; feverTimer = 0 } }

    // Basket follows pointer target, plus keyboard nudge, with smoothing
    if (keyDir !== 0) basketTargetX += keyDir * W * 1.3 * dt
    const half = basketW() / 2
    basketTargetX = Math.max(half, Math.min(W - half, basketTargetX))
    basketX += (basketTargetX - basketX) * Math.min(1, dt * 16)

    // Spawn
    spawnT -= dt
    if (spawnT <= 0) {
      spawnItem()
      const base = Math.max(0.34, 0.92 - elapsed * 0.012)
      spawnT = (feverActive ? base * 0.62 : base) + Math.random() * 0.35
    }

    // Items
    const rimY = basketRimY()
    for (const it of items) {
      it.y += it.vy * dt; it.rot += it.vr * dt
      it.sway += dt * it.swaySpd
      it.x = it.baseX + Math.sin(it.sway) * it.r * 0.5
      if (!it.judged && it.y + it.r * 0.5 >= rimY) {
        it.judged = true
        if (Math.abs(it.x - basketX) < basketW() * 0.46 + it.r * 0.4) catchItem(it)
      }
    }
    items = items.filter(it => {
      if (it.y - it.r > H + 8) {
        if (it.good && it.kind !== 'clover') { bestCombo = Math.max(bestCombo, combo); combo = 0 } // dropped a fruit
        return false
      }
      return it.caught !== true
    })
  }

  function catchItem(it: Item) {
    it.caught = true
    const cx = it.x, cy = basketRimY()
    if (it.kind === 'bomb') {
      hearts--; bestCombo = Math.max(bestCombo, combo); combo = 0
      shake = 0.35; heartFlash = 1; sBomb()
      burst(cx, cy, '#555', 16, false); burst(cx, cy, '#FF7733', 10, false)
      floats.push({ x: cx, y: cy - it.r, vy: -80, life: 0.9, maxLife: 0.9, text: '펑! 💔', color: '#fff', size: H * 0.05 })
      if (hearts <= 0) gameOver()
      return
    }
    if (it.kind === 'clover') {
      if (hearts < MAX_HEARTS) { hearts++; floats.push({ x: cx, y: cy - it.r, vy: -85, life: 1.0, maxLife: 1.0, text: '+❤️ 회복!', color: '#5BD46B', size: H * 0.046 }) }
      else { score += 15; floats.push({ x: cx, y: cy - it.r, vy: -85, life: 1.0, maxLife: 1.0, text: '+15', color: '#5BD46B', size: H * 0.044 }) }
      burst(cx, cy, '#6CE07A', 16, true); sHeal(); catchPulse = 1
      return
    }

    combo++
    const mult = feverActive ? 2 : 1
    let base = it.kind === 'golden' ? 30 : it.kind === 'cherry' ? 8 : it.kind === 'apple' ? 6 : 5
    const pts = (base + combo) * mult
    score += pts
    catchPulse = 1

    if (it.kind === 'golden') {
      burst(cx, cy, '#FFD23E', 20, true); sGold()
      floats.push({ x: cx, y: cy - it.r, vy: -100, life: 1.0, maxLife: 1.0, text: '+' + pts, color: '#FFD23E', size: H * 0.05 })
    } else {
      const col = it.kind === 'apple' ? '#E8503A' : it.kind === 'cherry' ? '#C62352' : '#FF4D6D'
      burst(cx, cy, col, 12, false); sCatch(combo)
      floats.push({ x: cx, y: cy - it.r, vy: -82, life: 0.85, maxLife: 0.85, text: '+' + pts, color: '#fff', size: H * 0.04 })
    }

    if (combo > 0 && combo % 5 === 0) {
      burst(cx, cy, '#fff', 14, true)
      floats.push({ x: cx, y: cy - it.r * 1.6, vy: -95, life: 1.0, maxLife: 1.0, text: '콤보 x' + combo + '!', color: '#FF8A3D', size: H * 0.05 })
    }
    if (combo >= 10 && !feverActive) {
      feverActive = true; feverTimer = 4; sFever()
      floats.push({ x: W / 2, y: H * 0.34, vy: -60, life: 1.3, maxLife: 1.3, text: '🔥 피버! 바구니 커짐!', color: '#FFD700', size: H * 0.06 })
      burst(W / 2, H * 0.5, '#FFD700', 28, true)
    }
  }

  function gameOver() {
    state = 'over'; sOver()
    bestCombo = Math.max(bestCombo, combo)
    if (Math.floor(score) > best) { best = Math.floor(score); try { localStorage.setItem(LS_KEY, String(best)) } catch (_) {} }
  }

  function burst(x: number, y: number, color: string, n: number, star: boolean) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = H * (0.22 + Math.random() * 0.5)
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - H * 0.25, life: 0.5 + Math.random() * 0.5, maxLife: 1, color, r: H * (star ? 0.014 : 0.011) * (1 + Math.random() * 0.5), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, star })
    }
    if (particles.length > 400) particles.splice(0, particles.length - 400)
  }

  // ── Background ────────────────────────────────────────────────────────────
  function drawBackground() {
    const t = performance.now() / 1000
    const sg = ctx.createLinearGradient(0, 0, 0, H * GROUND_Y_FRAC)
    sg.addColorStop(0, feverActive ? '#FFCF66' : '#7FC9F2')
    sg.addColorStop(1, feverActive ? '#FFEFA8' : '#CDEEFE')
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H * GROUND_Y_FRAC)

    // Sun
    const sx = W * 0.86, sy = H * 0.12
    ctx.save(); ctx.globalAlpha = 0.85
    ctx.fillStyle = '#FFD66B'; ctx.beginPath(); ctx.arc(sx, sy, H * 0.05, 0, 7); ctx.fill()
    ctx.strokeStyle = 'rgba(255,214,107,0.35)'; ctx.lineCap = 'round'; ctx.lineWidth = H * 0.006
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + t / 8
      ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * H * 0.064, sy + Math.sin(a) * H * 0.064)
      ctx.lineTo(sx + Math.cos(a) * H * 0.086, sy + Math.sin(a) * H * 0.086); ctx.stroke()
    }
    ctx.restore()

    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    for (const c of clouds) {
      ctx.beginPath()
      ctx.arc(c.x, c.y, c.w * 0.28, 0, 7)
      ctx.arc(c.x + c.w * 0.28, c.y - c.w * 0.08, c.w * 0.20, 0, 7)
      ctx.arc(c.x - c.w * 0.26, c.y + c.w * 0.02, c.w * 0.18, 0, 7); ctx.fill()
    }

    // Birds
    ctx.strokeStyle = 'rgba(80,80,90,0.5)'; ctx.lineWidth = Math.max(2, H * 0.003); ctx.lineCap = 'round'
    for (const b of birds) {
      const flap = Math.sin(b.phase) * H * 0.012
      const dir = b.vx < 0 ? -1 : 1
      ctx.beginPath()
      ctx.moveTo(b.x - 10 * dir, b.y); ctx.quadraticCurveTo(b.x, b.y - flap - 5, b.x + 4 * dir, b.y)
      ctx.quadraticCurveTo(b.x + 8 * dir, b.y - flap - 5, b.x + 18 * dir, b.y); ctx.stroke()
    }

    // Hills
    ctx.fillStyle = '#8BC06A'
    ctx.beginPath(); ctx.moveTo(0, H * GROUND_Y_FRAC)
    for (let x = 0; x <= W; x += W / 5) ctx.quadraticCurveTo(x + W / 10, H * (GROUND_Y_FRAC - 0.07), x + W / 5, H * GROUND_Y_FRAC)
    ctx.lineTo(W, H * GROUND_Y_FRAC); ctx.closePath(); ctx.fill()

    // Ground
    const gg = ctx.createLinearGradient(0, H * GROUND_Y_FRAC, 0, H)
    gg.addColorStop(0, feverActive ? '#90DD60' : '#7FC442')
    gg.addColorStop(1, '#548C2A')
    ctx.fillStyle = gg; ctx.fillRect(0, H * GROUND_Y_FRAC, W, H - H * GROUND_Y_FRAC)

    drawStrawberryRows()
  }

  // Strawberry field furrows on the ground
  function drawStrawberryRows() {
    ctx.save()
    ctx.strokeStyle = 'rgba(70,110,40,0.35)'; ctx.lineWidth = Math.max(2, H * 0.004)
    for (let r = 0; r < 3; r++) {
      const y = H * (GROUND_Y_FRAC + 0.05 + r * 0.06)
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + H * 0.01); ctx.stroke()
    }
    // little berries dotted along the field
    for (let i = 0; i < 14; i++) {
      const bx = ((i * 137) % Math.max(1, W - 30)) + 15
      const by = H * (GROUND_Y_FRAC + 0.08) + ((i * 53) % (H * 0.10))
      ctx.fillStyle = '#3A7A28'; ctx.beginPath(); ctx.arc(bx, by - 5, 4, 0, 7); ctx.fill()
      ctx.fillStyle = '#E8345A'; ctx.beginPath(); ctx.arc(bx, by, 5, 0, 7); ctx.fill()
    }
    ctx.restore()
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  function drawItem(it: Item) {
    const r = it.r
    ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(Math.sin(it.sway) * 0.18)
    // soft shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.7, r * 0.22, 0, 0, 7); ctx.fill()

    if (it.kind === 'strawberry' || it.kind === 'golden') {
      const body = it.kind === 'golden' ? '#FFD23E' : '#FF4D6D'
      const dark = it.kind === 'golden' ? '#E0A800' : '#D62E54'
      // body (heart-ish berry)
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.moveTo(0, r * 1.05)
      ctx.bezierCurveTo(r * 1.05, r * 0.45, r * 0.92, -r * 0.55, 0, -r * 0.35)
      ctx.bezierCurveTo(-r * 0.92, -r * 0.55, -r * 1.05, r * 0.45, 0, r * 1.05)
      ctx.closePath(); ctx.fill()
      // shine
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.05, r * 0.22, r * 0.34, -0.4, 0, 7); ctx.fill(); ctx.restore()
      // seeds
      ctx.fillStyle = dark
      const seeds = [[-0.35, 0.1], [0.35, 0.1], [0, 0.4], [-0.2, 0.55], [0.2, 0.55], [-0.15, -0.05], [0.15, -0.05], [0, 0.75]]
      for (const [sx, sy] of seeds) { ctx.beginPath(); ctx.ellipse(sx * r, sy * r, r * 0.06, r * 0.1, 0, 0, 7); ctx.fill() }
      // leaf
      ctx.fillStyle = '#3FA64A'
      for (let i = -2; i <= 2; i++) {
        ctx.save(); ctx.rotate(i * 0.42)
        ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r * 0.18, r * 0.34, 0, 0, 7); ctx.fill(); ctx.restore()
      }
      ctx.fillStyle = '#2E8B3A'; ctx.fillRect(-r * 0.05, -r * 0.75, r * 0.1, r * 0.22)
      if (it.kind === 'golden') {
        const tw = performance.now() / 1000
        ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(tw * 8); ctx.fillStyle = '#FFF6C0'
        starPath(r * 0.5, -r * 0.4, r * 0.22); ctx.fill(); ctx.restore()
      }

    } else if (it.kind === 'apple') {
      ctx.fillStyle = '#E8503A'
      ctx.beginPath(); ctx.arc(-r * 0.32, 0, r * 0.7, 0, 7); ctx.arc(r * 0.32, 0, r * 0.7, 0, 7)
      ctx.rect(-r * 0.32, -r * 0.7, r * 0.64, r * 1.4); ctx.fill()
      ctx.fillStyle = '#C03020'; ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r * 0.14, r * 0.1, 0, 0, 7); ctx.fill()
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.2, r * 0.18, r * 0.3, -0.4, 0, 7); ctx.fill(); ctx.restore()
      ctx.strokeStyle = '#6B3F1F'; ctx.lineWidth = r * 0.1; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.08, -r * 0.95); ctx.stroke()
      ctx.fillStyle = '#3FA64A'; ctx.beginPath(); ctx.ellipse(r * 0.3, -r * 0.85, r * 0.26, r * 0.14, -0.5, 0, 7); ctx.fill()

    } else if (it.kind === 'cherry') {
      ctx.strokeStyle = '#6B3F1F'; ctx.lineWidth = r * 0.12; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-r * 0.35, r * 0.1); ctx.quadraticCurveTo(0, -r * 0.9, r * 0.1, -r * 0.9); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(r * 0.4, r * 0.1); ctx.quadraticCurveTo(r * 0.1, -r * 0.7, r * 0.1, -r * 0.9); ctx.stroke()
      ctx.fillStyle = '#3FA64A'; ctx.beginPath(); ctx.ellipse(r * 0.35, -r * 0.85, r * 0.3, r * 0.13, 0.4, 0, 7); ctx.fill()
      for (const cx of [-r * 0.35, r * 0.4]) {
        ctx.fillStyle = '#C62352'; ctx.beginPath(); ctx.arc(cx, r * 0.45, r * 0.5, 0, 7); ctx.fill()
        ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - r * 0.18, r * 0.28, r * 0.13, 0, 7); ctx.fill(); ctx.restore()
      }

    } else if (it.kind === 'clover') {
      ctx.fillStyle = '#3FA64A'
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4
        const lx = Math.cos(a) * r * 0.42, ly = Math.sin(a) * r * 0.42
        ctx.beginPath(); ctx.arc(lx, ly, r * 0.4, 0, 7); ctx.fill()
      }
      ctx.fillStyle = '#2E8B3A'; ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, 7); ctx.fill()
      ctx.strokeStyle = '#2E8B3A'; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.moveTo(0, r * 0.2); ctx.lineTo(0, r * 0.95); ctx.stroke()

    } else { // bomb
      ctx.fillStyle = '#33393F'; ctx.beginPath(); ctx.arc(0, r * 0.1, r * 0.82, 0, 7); ctx.fill()
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.fillStyle = '#232830'; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.8, r * 0.1 + Math.sin(a) * r * 0.8, r * 0.13, 0, 7); ctx.fill() }
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.2, r * 0.2, 0, 7); ctx.fill(); ctx.restore()
      ctx.strokeStyle = '#C0A060'; ctx.lineWidth = r * 0.1
      ctx.beginPath(); ctx.moveTo(r * 0.1, -r * 0.7); ctx.quadraticCurveTo(r * 0.45, -r * 1.05, r * 0.2, -r * 1.25); ctx.stroke()
      const sa = (performance.now() / 1000 * 5) % (Math.PI * 2)
      ctx.fillStyle = '#FF8800'; ctx.beginPath(); ctx.arc(r * 0.2 + Math.cos(sa) * r * 0.06, -r * 1.25 + Math.sin(sa) * r * 0.06, r * 0.11, 0, 7); ctx.fill()
    }
    ctx.restore()
  }

  // ── Basket ────────────────────────────────────────────────────────────────
  function drawBasket() {
    const bw = basketW(), bh = bw * 0.62
    const cx = basketX, top = basketRimY()
    const sc = 1 + catchPulse * 0.06
    ctx.save(); ctx.translate(cx, top); ctx.scale(sc, sc)

    if (feverActive) {
      ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(performance.now() / 80)
      ctx.fillStyle = '#FFD700'; roundRect(-bw * 0.62, -bh * 0.2, bw * 1.24, bh * 1.2, bh * 0.3); ctx.fill(); ctx.restore()
    }

    // body (trapezoid)
    ctx.fillStyle = '#B5793E'
    ctx.beginPath()
    ctx.moveTo(-bw * 0.5, 0); ctx.lineTo(bw * 0.5, 0)
    ctx.lineTo(bw * 0.36, bh); ctx.lineTo(-bw * 0.36, bh); ctx.closePath(); ctx.fill()
    // weave
    ctx.strokeStyle = 'rgba(90,55,25,0.5)'; ctx.lineWidth = Math.max(1.5, bh * 0.04)
    for (let i = 1; i < 5; i++) { const yy = (bh / 5) * i; ctx.beginPath(); ctx.moveTo(-bw * (0.5 - 0.028 * i), yy); ctx.lineTo(bw * (0.5 - 0.028 * i), yy); ctx.stroke() }
    for (let i = -3; i <= 3; i++) { const xx = (bw * 0.13) * i; ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx * 0.72, bh); ctx.stroke() }
    // rim
    ctx.fillStyle = '#D9A05B'; roundRect(-bw * 0.54, -bh * 0.16, bw * 1.08, bh * 0.26, bh * 0.13); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; roundRect(-bw * 0.5, -bh * 0.12, bw * 0.5, bh * 0.08, bh * 0.04); ctx.fill()
    // a couple berries peeking out of the basket
    ctx.fillStyle = '#FF4D6D'
    ctx.beginPath(); ctx.arc(-bw * 0.18, -bh * 0.05, bh * 0.16, 0, 7); ctx.arc(bw * 0.12, -bh * 0.08, bh * 0.18, 0, 7); ctx.fill()
    ctx.fillStyle = '#3FA64A'
    ctx.beginPath(); ctx.ellipse(bw * 0.24, -bh * 0.16, bh * 0.12, bh * 0.06, -0.5, 0, 7); ctx.fill()
    ctx.restore()
  }

  // ── Particles & floats ────────────────────────────────────────────────────
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

  // ── HUD ───────────────────────────────────────────────────────────────────
  function drawHUD() {
    const t = performance.now() / 1000
    // Score
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = H * 0.007
    ctx.font = `bold ${Math.floor(H * 0.062)}px Jua, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.strokeText(String(Math.floor(score)), W * 0.04, H * 0.03); ctx.fillText(String(Math.floor(score)), W * 0.04, H * 0.03)
    ctx.font = `${Math.floor(H * 0.026)}px Jua, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText('최고 ' + best, W * 0.04, H * 0.095)

    // Hearts
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'
    const hr = H * 0.022
    for (let i = 0; i < MAX_HEARTS; i++) {
      const hx = W - W * 0.04 - i * hr * 3, hy = H * 0.055
      const filled = i < hearts
      ctx.save()
      if (filled && heartFlash > 0 && i === hearts) { /* never */ }
      ctx.translate(hx, hy)
      const beat = filled ? 1 + Math.sin(t * 3 + i) * 0.04 : 1
      ctx.scale(beat, beat)
      ctx.fillStyle = filled ? '#FF4D6D' : 'rgba(255,255,255,0.28)'
      ctx.beginPath()
      ctx.moveTo(0, hr * 0.7)
      ctx.bezierCurveTo(hr * 1.1, -hr * 0.1, hr * 0.5, -hr * 0.85, 0, -hr * 0.25)
      ctx.bezierCurveTo(-hr * 0.5, -hr * 0.85, -hr * 1.1, -hr * 0.1, 0, hr * 0.7)
      ctx.closePath(); ctx.fill()
      ctx.restore()
    }
    if (heartFlash > 0) { ctx.save(); ctx.globalAlpha = heartFlash * 0.3; ctx.fillStyle = '#FF0000'; ctx.fillRect(0, 0, W, H); ctx.restore() }

    // Combo
    if (combo > 1) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = combo >= 10 ? '#FFD700' : '#FF8A3D'
      ctx.font = `bold ${Math.floor(H * 0.04)}px Jua, sans-serif`
      ctx.fillText((combo >= 10 ? '🔥' : '⭐') + ' 콤보 x' + combo, W / 2, H * 0.07)
    }

    // Fever bar
    if (feverActive) {
      const bw = H * 0.34, bx = W / 2 - bw / 2, by = H * 0.12
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; roundRect(bx, by, bw, H * 0.014, H * 0.007); ctx.fill()
      ctx.fillStyle = '#FF8800'; roundRect(bx, by, bw * (feverTimer / 4), H * 0.014, H * 0.007); ctx.fill()
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  // ── Buttons / Menus ───────────────────────────────────────────────────────
  function button(x: number, y: number, w: number, h: number, label: string, color: string, action: string) {
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; roundRect(x + 3, y + 5, w, h, h * 0.28); ctx.fill()
    roundRect(x, y, w, h, h * 0.28); ctx.fillStyle = color; ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; roundRect(x + h * 0.08, y + h * 0.10, w - h * 0.16, h * 0.4, h * 0.2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.floor(h * 0.42)}px Jua, sans-serif`; ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 4
    ctx.fillText(label, x + w / 2, y + h / 2); ctx.restore()
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    uiButtons.push({ x, y, w, h, action })
  }

  function drawMenu() {
    drawBackground(); drawBasket()
    ctx.fillStyle = 'rgba(10,30,40,0.5)'; ctx.fillRect(0, 0, W, H)
    const bob = Math.sin(performance.now() / 320) * H * 0.012
    ctx.save(); ctx.shadowColor = '#FF6B8A'; ctx.shadowBlur = 28
    ctx.strokeStyle = 'rgba(120,40,60,0.5)'; ctx.lineWidth = H * 0.008
    ctx.font = `bold ${Math.floor(H * 0.11)}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#FFEAF0'; ctx.strokeText('🍓 딸기 따기', W / 2, H * 0.20 + bob); ctx.fillText('🍓 딸기 따기', W / 2, H * 0.20 + bob)
    ctx.restore()

    const info = [
      { t: '바구니를 좌우로 움직여 떨어지는 과일을 받아요!', c: '#FFE0E8' },
      { t: '🍓 딸기 · 🍎 사과 · 🍒 체리 모으기', c: '#FFD0DC' },
      { t: '⭐ 황금딸기 +30점   🍀 네잎클로버 하트 회복', c: '#FFE88A' },
      { t: '💣 폭탄은 피하기! (하트 -1)', c: '#FFC0C0' },
      { t: '🔥 10콤보 → 피버! 바구니가 커지고 2배 점수!', c: '#FFD700' },
    ]
    info.forEach((inf, i) => {
      ctx.fillStyle = inf.c; ctx.font = `${Math.floor(H * 0.032)}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(inf.t, W / 2, H * 0.36 + i * H * 0.058)
    })

    uiButtons = []
    const bw = Math.min(W * 0.5, H * 0.5), bh = bw * 0.26
    button(W / 2 - bw / 2, H * 0.70, bw, bh, '시작하기 ▶', '#E8345A', 'start')

    ctx.fillStyle = '#FFD700'; ctx.font = `bold ${Math.floor(H * 0.038)}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('🏆 최고 점수: ' + best, W / 2, H * 0.88)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  function drawOver() {
    drawBackground()
    ctx.fillStyle = 'rgba(10,30,40,0.58)'; ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.save(); ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 22
    ctx.fillStyle = '#FFFACC'; ctx.font = `bold ${Math.floor(H * 0.10)}px Jua, sans-serif`
    ctx.fillText('게임 끝!', W / 2, H * 0.20); ctx.restore()

    const isNew = Math.floor(score) >= best
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.floor(H * 0.07)}px Jua, sans-serif`
    ctx.fillText(Math.floor(score) + '점', W / 2, H * 0.36)
    ctx.fillStyle = '#FFE0A0'; ctx.font = `${Math.floor(H * 0.038)}px Jua, sans-serif`
    ctx.fillText('최고 콤보 ' + bestCombo, W / 2, H * 0.45)
    ctx.fillStyle = '#FFD700'; ctx.font = `bold ${Math.floor(H * 0.044)}px Jua, sans-serif`
    ctx.fillText((isNew ? '🎉 신기록! ' : '🏆 최고 점수: ') + best, W / 2, H * 0.55)

    uiButtons = []
    const bw = Math.min(W * 0.34, H * 0.34), bh = bw * 0.36, gap = W * 0.03
    let bx = (W - (bw * 2 + gap)) / 2
    button(bx, H * 0.68, bw, bh, '다시 ▶', '#E8345A', 'again'); bx += bw + gap
    button(bx, H * 0.68, bw, bh, '처음으로', '#4A9FE0', 'menu')
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  let last = performance.now(), animId = 0
  function loop(now: number) {
    let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05
    update(dt)
    ctx.save()
    if (shake > 0) { const a = shake * H * 0.02; ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a) }
    if (state === 'playing') {
      drawBackground()
      for (const it of items) drawItem(it)
      drawBasket(); drawParticles(); drawFloats(); drawHUD()
    } else if (state === 'menu') drawMenu()
    else drawOver()
    ctx.restore()
    animId = requestAnimationFrame(loop)
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  function pointerXY(e: PointerEvent) {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onDown = (e: PointerEvent) => {
    e.preventDefault(); initAudio()
    const { x, y } = pointerXY(e)
    if (state === 'playing') { basketTargetX = x; return }
    for (const b of uiButtons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        if (b.action === 'start' || b.action === 'again') startGame()
        else if (b.action === 'menu') { state = 'menu' }
        break
      }
    }
  }
  const onMove = (e: PointerEvent) => {
    if (state !== 'playing') return
    if (e.buttons === 0 && e.pointerType === 'mouse') { basketTargetX = pointerXY(e).x; return } // hover-follow on desktop
    basketTargetX = pointerXY(e).x
  }
  const onKey = (e: KeyboardEvent, down: boolean) => {
    if (e.key === 'ArrowLeft') keyDir = down ? -1 : (keyDir === -1 ? 0 : keyDir)
    else if (e.key === 'ArrowRight') keyDir = down ? 1 : (keyDir === 1 ? 0 : keyDir)
    else if (down && (e.key === ' ' || e.key === 'Enter') && state !== 'playing') { initAudio(); startGame() }
  }
  const keyDown = (e: KeyboardEvent) => onKey(e, true)
  const keyUp = (e: KeyboardEvent) => onKey(e, false)

  canvas.addEventListener('pointerdown', onDown, { passive: false })
  canvas.addEventListener('pointermove', onMove, { passive: false })
  window.addEventListener('keydown', keyDown)
  window.addEventListener('keyup', keyUp)
  window.addEventListener('resize', resize)
  resize()
  animId = requestAnimationFrame(loop)

  return () => {
    cancelAnimationFrame(animId)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    window.removeEventListener('keydown', keyDown)
    window.removeEventListener('keyup', keyUp)
    window.removeEventListener('resize', resize)
  }
}
