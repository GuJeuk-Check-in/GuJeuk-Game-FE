export function initGame(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!

  // ── Palette ──────────────────────────────────────────────────────────────
  const CHAR_COLORS  = ['#FF8FAB', '#74C7EC', '#F9E2AF', '#A6E3A1']
  const CHAR_SHADOW  = ['#E8507A', '#4BA6D4', '#D4A520', '#4CAF50']
  const NDASH = 7

  // ── State ─────────────────────────────────────────────────────────────────
  let W = 0, H = 0, dpr = 1, horizonY = 0, nearY = 0
  let state: 'menu' | 'playing' | 'over' = 'menu'
  let playerCount = 1
  let lanes: Lane[] = []
  let elapsed = 0
  let bestSolo = 0
  let uiButtons: { x: number; y: number; w: number; h: number; action: string; data?: number }[] = []
  let shakeX = 0, shakeY = 0, shakeDur = 0, shakeAmt = 0

  // ── Audio ─────────────────────────────────────────────────────────────────
  let actx: AudioContext | null = null
  function initAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() } catch (_) {}
    }
  }
  function blip(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.07) {
    if (!actx) return
    try {
      const o = actx.createOscillator(), g = actx.createGain()
      o.type = type; o.frequency.value = freq
      g.gain.setValueAtTime(vol, actx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur)
      o.connect(g); g.connect(actx.destination)
      o.start(); o.stop(actx.currentTime + dur)
    } catch (_) {}
  }
  const sJump   = () => blip(520, 0.12, 'square')
  const sDJump  = () => { blip(780, 0.08, 'triangle', 0.09); blip(1040, 0.14, 'triangle', 0.06) }
  const sStar   = () => blip(880, 0.18, 'triangle', 0.09)
  const sHit    = () => blip(140, 0.28, 'sawtooth', 0.10)
  const sLand   = () => blip(260, 0.06, 'square', 0.04)
  const sCombo  = (n: number) => blip(440 + n * 80, 0.14, 'triangle', 0.08)

  // ── Types ─────────────────────────────────────────────────────────────────
  type Particle = {
    x: number; y: number; vx: number; vy: number
    life: number; maxLife: number; color: string; r: number; gravity: number
  }
  type FloatText = {
    x: number; y: number; vy: number
    life: number; maxLife: number; text: string; color: string; size: number
  }
  type Obstacle = { z: number; resolved: boolean; type: 'mushroom' | 'crystal' | 'spike' | 'doubleMush' }
  type Star     = { z: number; resolved: boolean; got: boolean; h: number }
  type Cloud    = { x: number; y: number; w: number; s: number; puffs: number[] }
  type TrailDot = { x: number; y: number; life: number; maxLife: number; r: number }

  type Lane = {
    idx: number; x: number; w: number; center: number; charSize: number
    jumpOffset: number; vy: number; onGround: boolean
    canDoubleJump: boolean; jumpCount: number; wasGrounded: boolean
    hearts: number; score: number; alive: boolean; invuln: number
    sqX: number; sqY: number
    obstacles: Obstacle[]
    stars: Star[]
    particles: Particle[]
    floatTexts: FloatText[]
    trail: TrailDot[]
    combo: number; comboTimer: number
    spawnT: number; starT: number; roadPhase: number; phase: number
    blink: number; blinkT: number
    clouds: Cloud[]
    mtFarPhase: number; mtNearPhase: number
  }

  // ── Lane factory ──────────────────────────────────────────────────────────
  function makeLane(i: number, n: number): Lane {
    const lw = W / n
    const clouds: Cloud[] = []
    for (let k = 0; k < 3; k++) {
      clouds.push({
        x: Math.random() * lw, y: H * (0.05 + Math.random() * 0.10),
        w: lw * (0.18 + Math.random() * 0.16),
        s: H * (0.008 + Math.random() * 0.008),
        puffs: [0, Math.random() * 0.3 + 0.2, -(Math.random() * 0.3 + 0.2)],
      })
    }
    return {
      idx: i, x: i * lw, w: lw, center: i * lw + lw / 2,
      charSize: Math.min(lw * 0.34, H * 0.12),
      jumpOffset: 0, vy: 0, onGround: true,
      canDoubleJump: false, jumpCount: 0, wasGrounded: true,
      hearts: 3, score: 0, alive: true, invuln: 0,
      sqX: 1, sqY: 1,
      obstacles: [], stars: [], particles: [], floatTexts: [], trail: [],
      combo: 0, comboTimer: 0,
      spawnT: 1.2 + Math.random() * 0.8, starT: 2.5 + Math.random() * 2,
      roadPhase: Math.random(), phase: Math.random() * 6,
      blink: 0, blinkT: 1.5 + Math.random() * 3,
      clouds, mtFarPhase: Math.random(), mtNearPhase: Math.random(),
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth; H = window.innerHeight
    canvas.width  = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr)
    canvas.style.width  = W + 'px';      canvas.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    horizonY = H * 0.18; nearY = H * 0.77
    for (const l of lanes) {
      const lw = W / playerCount
      l.x = l.idx * lw; l.w = lw; l.center = l.x + lw / 2
      l.charSize = Math.min(lw * 0.34, H * 0.12)
    }
  }

  function proj(z: number) {
    const p = 1 - Math.max(0, Math.min(1, z))
    const e = Math.pow(p, 1.7)
    return { y: horizonY + (nearY - horizonY) * e, scale: 0.10 + 0.90 * e }
  }

  function lerpColor(c1: string, c2: string, t: number): string {
    t = Math.max(0, Math.min(1, t))
    const p = (h: string) => parseInt(h, 16)
    const r1 = p(c1.slice(1,3)), g1 = p(c1.slice(3,5)), b1 = p(c1.slice(5,7))
    const r2 = p(c2.slice(1,3)), g2 = p(c2.slice(3,5)), b2 = p(c2.slice(5,7))
    const r = Math.round(r1 + (r2 - r1) * t)
    const g = Math.round(g1 + (g2 - g1) * t)
    const b = Math.round(b1 + (b2 - b1) * t)
    return `rgb(${r},${g},${b})`
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  }

  function triggerShake(amount: number, dur: number) {
    shakeAmt = amount; shakeDur = dur
  }

  function spawnParticles(
    l: Lane, x: number, y: number, n: number,
    colors: string[], spread = 1, gravity = 800
  ) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const spd = (60 + Math.random() * 180) * spread
      l.particles.push({
        x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 120,
        life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
        color: colors[Math.floor(Math.random() * colors.length)],
        r: 3 + Math.random() * 5, gravity,
      })
    }
  }

  function spawnFloatText(l: Lane, x: number, y: number, text: string, color: string, size: number) {
    l.floatTexts.push({ x, y, vy: -90, life: 0.9, maxLife: 0.9, text, color, size })
  }

  // ── Game start ────────────────────────────────────────────────────────────
  function startGame(n: number) {
    playerCount = n; elapsed = 0; lanes = []
    shakeX = 0; shakeY = 0; shakeDur = 0
    for (let i = 0; i < n; i++) lanes.push(makeLane(i, n))
    resize(); state = 'playing'
  }

  function doJump(li: number) {
    const l = lanes[li]; if (!l || !l.alive) return
    if (l.onGround) {
      l.vy = 9.2 * l.charSize; l.onGround = false
      l.canDoubleJump = true; l.jumpCount = 1
      l.sqX = 0.75; l.sqY = 1.3; sJump()
      spawnParticles(l, l.center, nearY, 6, ['#fff', '#ffe0f0'], 0.6, 600)
    } else if (l.canDoubleJump) {
      l.vy = 8.0 * l.charSize; l.canDoubleJump = false; l.jumpCount = 2
      l.sqX = 0.70; l.sqY = 1.35; sDJump()
      const cx = l.center, by = nearY - l.jumpOffset
      spawnParticles(l, cx, by, 12, ['#FFD700', '#FFF', '#F0A0FF', '#A0DFFF'], 1.1, 400)
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────
  function update(dt: number) {
    if (state !== 'playing') return
    elapsed += dt
    const speed = 0.45 + Math.min(elapsed * 0.007, 0.55)
    let anyAlive = false

    // screen shake
    if (shakeDur > 0) {
      shakeDur -= dt
      const a = shakeAmt * (shakeDur / 0.3)
      shakeX = (Math.random() * 2 - 1) * Math.min(a, shakeAmt)
      shakeY = (Math.random() * 2 - 1) * Math.min(a, shakeAmt)
    } else { shakeX = 0; shakeY = 0 }

    for (const l of lanes) {
      // parallax bg
      const bgSpeed = speed * 0.04
      l.mtFarPhase  = (l.mtFarPhase  + bgSpeed * 0.3 * dt) % 1
      l.mtNearPhase = (l.mtNearPhase + bgSpeed * 0.7 * dt) % 1
      for (const c of l.clouds) {
        c.x -= c.s * dt
        if (c.x + c.w < 0) c.x = l.w + Math.random() * l.w * 0.4
      }
      l.roadPhase = (l.roadPhase + speed * dt) % 1

      if (!l.alive) continue
      anyAlive = true

      // physics
      const g = 26 * l.charSize
      l.vy -= g * dt; l.jumpOffset += l.vy * dt
      const hitGround = l.jumpOffset <= 0
      if (hitGround && !l.wasGrounded) {
        l.jumpOffset = 0; l.vy = 0; l.onGround = true
        l.canDoubleJump = false; l.jumpCount = 0
        l.sqX = 1.3; l.sqY = 0.72; sLand()
        spawnParticles(l, l.center, nearY, 5, ['#ccc', '#fff'], 0.5, 500)
      } else if (hitGround) {
        l.jumpOffset = 0; l.vy = 0; l.onGround = true
      }
      l.wasGrounded = l.onGround

      // squash/stretch spring back
      l.sqX += (1 - l.sqX) * Math.min(1, dt * 14)
      l.sqY += (1 - l.sqY) * Math.min(1, dt * 14)

      l.invuln = Math.max(0, l.invuln - dt)
      l.blinkT -= dt
      if (l.blinkT <= 0) { l.blink = 0.12; l.blinkT = 1.5 + Math.random() * 3 }
      l.blink = Math.max(0, l.blink - dt)

      // combo timer
      if (l.comboTimer > 0) { l.comboTimer -= dt; if (l.comboTimer <= 0) l.combo = 0 }

      // obstacle spawn — varied patterns
      l.spawnT -= dt
      if (l.spawnT <= 0) {
        const types: Obstacle['type'][] = ['mushroom', 'crystal', 'spike', 'doubleMush']
        const weights = elapsed < 15 ? [5, 3, 1, 1] : elapsed < 40 ? [3, 3, 2, 2] : [2, 2, 3, 3]
        const total = weights.reduce((a, b) => a + b, 0)
        let r = Math.random() * total, chosen: Obstacle['type'] = 'mushroom'
        for (let k = 0; k < types.length; k++) {
          r -= weights[k]; if (r <= 0) { chosen = types[k]; break }
        }
        l.obstacles.push({ z: 1, resolved: false, type: chosen })
        l.spawnT = Math.max(0.6, 1.5 - elapsed * 0.018) + Math.random() * 0.7

        // occasionally spawn a cluster (2 obstacles close together)
        if (elapsed > 20 && Math.random() < 0.25) {
          const t2: Obstacle['type'][] = ['mushroom', 'crystal', 'spike']
          l.obstacles.push({ z: 1.18, resolved: false, type: t2[Math.floor(Math.random() * t2.length)] })
        }
      }

      // star spawn with height tiers
      l.starT -= dt
      if (l.starT <= 0) {
        const r = Math.random()
        const h = r < 0.5 ? 0.5 : r < 0.8 ? 1.0 : 1.8
        l.stars.push({ z: 1, resolved: false, got: false, h })
        l.starT = 2.5 + Math.random() * 2.5
      }

      for (const o of l.obstacles) o.z -= speed * dt
      for (const s of l.stars)    s.z -= speed * dt

      // trail when airborne
      if (!l.onGround) {
        const by = nearY - l.jumpOffset
        l.trail.push({ x: l.center, y: by, life: 0.2, maxLife: 0.2, r: l.charSize * 0.35 })
      }
      for (const t of l.trail) t.life -= dt
      l.trail = l.trail.filter(t => t.life > 0)

      // collision
      for (const o of l.obstacles) {
        if (!o.resolved && o.z <= 0.06) {
          o.resolved = true
          if (l.onGround && l.invuln <= 0) {
            l.hearts--; l.invuln = 1.2; l.combo = 0
            sHit(); triggerShake(12, 0.28)
            const cx = l.center, by = nearY - l.jumpOffset
            spawnParticles(l, cx, by, 10, ['#FF4444', '#FF8800', '#FFFF00'], 1.2, 700)
            spawnFloatText(l, cx, by - l.charSize * 1.5, '💔', '#FF4444', Math.floor(H * 0.07))
            if (l.hearts <= 0) {
              l.alive = false
              spawnParticles(l, cx, by, 20, [CHAR_COLORS[l.idx], '#fff', '#FFD700'], 1.5, 500)
            }
          }
        }
      }
      for (const s of l.stars) {
        if (!s.resolved && s.z <= 0.06) {
          s.resolved = true
          const jumpH = l.jumpOffset / (l.charSize * 2.5)
          const canGet = (s.h <= 0.6) || (s.h <= 1.2 && jumpH > 0.3) || (s.h > 1.2 && jumpH > 0.9)
          if (canGet) {
            s.got = true
            l.combo++; l.comboTimer = 3.5
            const mul = Math.max(1, Math.floor(l.combo / 3))
            const pts = 50 * mul
            l.score += pts; sStar()
            const cx = l.center, sy = nearY - l.jumpOffset - s.h * l.charSize * 1.6
            spawnParticles(l, cx, sy, 10, ['#FFD700', '#FFF', '#FFB800'], 1.2, 300)
            const label = l.combo >= 3 ? `x${mul} 콤보!` : `+${pts}`
            const col = l.combo >= 6 ? '#FF8FAB' : l.combo >= 3 ? '#FFD700' : '#ffffff'
            spawnFloatText(l, cx, sy - l.charSize * 0.5, label, col, Math.floor(H * 0.055))
            if (l.combo > 0 && l.combo % 3 === 0) sCombo(Math.floor(l.combo / 3))
          }
        }
      }

      l.obstacles = l.obstacles.filter(o => o.z > -0.2)
      l.stars     = l.stars.filter(s => !s.got && s.z > -0.2)

      // particles
      for (const p of l.particles) {
        p.x += p.vx * dt; p.y += p.vy * dt
        p.vy += p.gravity * dt; p.life -= dt
      }
      l.particles = l.particles.filter(p => p.life > 0)

      // float texts
      for (const f of l.floatTexts) { f.y += f.vy * dt; f.life -= dt }
      l.floatTexts = l.floatTexts.filter(f => f.life > 0)

      l.score += dt * 10
    }
    if (!anyAlive) gameOver()
  }

  function gameOver() {
    state = 'over'
    if (playerCount === 1) bestSolo = Math.max(bestSolo, Math.floor(lanes[0].score))
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────
  function skyColor(t: number) {
    // 0→day bright, 60s→dusk, 120s→night
    const p = Math.min(1, t / 120)
    if (p < 0.5) {
      const u = p * 2
      const top = lerpColor('#5EC8FF', '#FF9E6A', u)
      const bot = lerpColor('#C8EEFF', '#FFD4A0', u)
      return { top, bot }
    } else {
      const u = (p - 0.5) * 2
      const top = lerpColor('#FF9E6A', '#1A1042', u)
      const bot = lerpColor('#FFD4A0', '#2D2060', u)
      return { top, bot }
    }
  }

  function drawBackground(l: Lane) {
    const sky = skyColor(elapsed)
    const sg = ctx.createLinearGradient(0, 0, 0, horizonY)
    sg.addColorStop(0, sky.top); sg.addColorStop(1, sky.bot)
    ctx.fillStyle = sg; ctx.fillRect(l.x, 0, l.w, horizonY)

    // stars at night
    const nightP = Math.max(0, (elapsed - 70) / 50)
    if (nightP > 0) {
      ctx.save()
      ctx.globalAlpha = nightP * 0.9
      ctx.fillStyle = '#ffffff'
      const seed = l.idx * 137
      for (let i = 0; i < 28; i++) {
        const sx = l.x + ((seed * 7 + i * 83) % l.w)
        const sy = ((seed * 13 + i * 47) % (horizonY * 0.85))
        const twink = 0.5 + 0.5 * Math.sin(performance.now() / 500 + i * 1.7)
        ctx.globalAlpha = nightP * twink * 0.85
        ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, 7); ctx.fill()
      }
      ctx.restore()
    }

    // moon / sun
    const sunP = Math.max(0, 1 - elapsed / 80)
    const moonP = Math.max(0, (elapsed - 60) / 60)
    if (sunP > 0) {
      ctx.save(); ctx.globalAlpha = sunP
      ctx.fillStyle = '#FFE066'
      ctx.beginPath(); ctx.arc(l.x + l.w * 0.82, H * 0.09, l.charSize * 0.52, 0, 7); ctx.fill()
      ctx.restore()
    }
    if (moonP > 0) {
      ctx.save(); ctx.globalAlpha = moonP
      ctx.fillStyle = '#E0E8FF'
      ctx.beginPath(); ctx.arc(l.x + l.w * 0.78, H * 0.09, l.charSize * 0.42, 0, 7); ctx.fill()
      ctx.fillStyle = sky.top
      ctx.beginPath(); ctx.arc(l.x + l.w * 0.81, H * 0.082, l.charSize * 0.38, 0, 7); ctx.fill()
      ctx.restore()
    }

    // parallax mountains (far)
    drawMountains(l, l.x, l.w, horizonY, l.mtFarPhase, 0.28, '#B8D4F0', '#8FB8E0', 6)
    // parallax mountains (near)
    drawMountains(l, l.x, l.w, horizonY, l.mtNearPhase, 0.42, '#8CB87A', '#6A9A58', 4)

    // clouds
    for (const c of l.clouds) drawCloud(l, c)

    // ground gradient
    const groundP = elapsed / 120
    const grassTop = lerpColor('#86cf57', '#3D5C30', Math.min(1, groundP))
    const grassBot = lerpColor('#6ab040', '#2E4520', Math.min(1, groundP))
    const gg = ctx.createLinearGradient(0, horizonY, 0, H)
    gg.addColorStop(0, grassTop); gg.addColorStop(1, grassBot)
    ctx.fillStyle = gg; ctx.fillRect(l.x, horizonY, l.w, H - horizonY)
  }

  function drawMountains(
    l: Lane, lx: number, lw: number, hy: number, phase: number,
    heightFrac: number, col1: string, col2: string, count: number
  ) {
    const mh = hy * heightFrac
    ctx.save(); ctx.beginPath(); ctx.rect(lx, 0, lw, hy); ctx.clip()
    const mg = ctx.createLinearGradient(0, hy - mh, 0, hy)
    mg.addColorStop(0, col1); mg.addColorStop(1, col2)
    ctx.fillStyle = mg
    ctx.beginPath()
    ctx.moveTo(lx, hy)
    const segW = lw / count
    for (let i = -1; i <= count + 1; i++) {
      const px = lx + ((i + phase) % (count + 1)) * segW
      const midX = px + segW / 2
      ctx.lineTo(px, hy)
      ctx.quadraticCurveTo(midX, hy - mh * (0.7 + 0.3 * Math.sin(i * 2.1)), px + segW, hy)
    }
    ctx.lineTo(lx + lw + 10, hy); ctx.closePath(); ctx.fill()
    ctx.restore()
  }

  function drawCloud(l: Lane, c: Cloud) {
    ctx.save(); ctx.globalAlpha = 0.88
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(l.x + c.x, c.y, c.w * 0.28, 0, 7)
    for (const off of c.puffs) {
      ctx.arc(l.x + c.x + c.w * off, c.y - c.w * 0.06, c.w * 0.19, 0, 7)
    }
    ctx.fill(); ctx.restore()
  }

  function drawRoad(l: Lane) {
    const topHW = l.w * 0.05, botHW = l.w * 0.36, cx = l.center
    const roadP = elapsed / 120
    const roadTop = lerpColor('#e3cf95', '#706050', Math.min(1, roadP))
    ctx.fillStyle = roadTop
    ctx.beginPath()
    ctx.moveTo(cx - topHW, horizonY); ctx.lineTo(cx + topHW, horizonY)
    ctx.lineTo(cx + botHW, H); ctx.lineTo(cx - botHW, H); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = lerpColor('#cdb678', '#504030', Math.min(1, roadP))
    ctx.lineWidth = Math.max(2, l.w * 0.01)
    ctx.beginPath()
    ctx.moveTo(cx - topHW, horizonY); ctx.lineTo(cx - botHW, H)
    ctx.moveTo(cx + topHW, horizonY); ctx.lineTo(cx + botHW, H); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    for (let k = 0; k < NDASH; k++) {
      const z = 1 - (((k / NDASH) + l.roadPhase) % 1)
      const pr = proj(z), dw = Math.max(2, botHW * 0.12 * pr.scale), dh = Math.max(3, H * 0.05 * pr.scale)
      ctx.fillRect(cx - dw / 2, pr.y - dh, dw, dh)
    }
  }

  function drawObstacle(l: Lane, o: Obstacle, cx: number, pr: { y: number; scale: number }) {
    const s = l.charSize * 0.95 * pr.scale, y = pr.y

    if (o.type === 'mushroom') {
      // stem
      ctx.fillStyle = '#F5DEB3'
      roundRect(cx - s * 0.2, y - s * 0.55, s * 0.4, s * 0.55, s * 0.08); ctx.fill()
      // cap
      ctx.fillStyle = '#E84040'
      ctx.beginPath()
      ctx.ellipse(cx, y - s * 0.52, s * 0.55, s * 0.4, 0, Math.PI, 0); ctx.fill()
      // spots
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.arc(cx - s * 0.18, y - s * 0.72, s * 0.1, 0, 7); ctx.fill()
      ctx.beginPath(); ctx.arc(cx + s * 0.15, y - s * 0.82, s * 0.08, 0, 7); ctx.fill()
    } else if (o.type === 'crystal') {
      ctx.fillStyle = '#9B59FF'
      ctx.beginPath()
      ctx.moveTo(cx, y - s); ctx.lineTo(cx + s * 0.32, y - s * 0.45)
      ctx.lineTo(cx + s * 0.22, y); ctx.lineTo(cx - s * 0.22, y)
      ctx.lineTo(cx - s * 0.32, y - s * 0.45); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(200,160,255,0.55)'
      ctx.beginPath()
      ctx.moveTo(cx, y - s); ctx.lineTo(cx + s * 0.12, y - s * 0.5)
      ctx.lineTo(cx, y - s * 0.08); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#C88AFF'; ctx.lineWidth = s * 0.04
      ctx.beginPath()
      ctx.moveTo(cx, y - s); ctx.lineTo(cx + s * 0.32, y - s * 0.45)
      ctx.lineTo(cx + s * 0.22, y); ctx.lineTo(cx - s * 0.22, y)
      ctx.lineTo(cx - s * 0.32, y - s * 0.45); ctx.closePath(); ctx.stroke()
    } else if (o.type === 'spike') {
      ctx.fillStyle = '#708090'
      const n = 3
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * s * 0.38
        ctx.beginPath()
        ctx.moveTo(cx + ox, y)
        ctx.lineTo(cx + ox - s * 0.15, y)
        ctx.lineTo(cx + ox, y - s * 0.9)
        ctx.closePath(); ctx.fill()
      }
      ctx.fillStyle = '#A0B0C0'
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * s * 0.38
        ctx.beginPath()
        ctx.moveTo(cx + ox, y - s * 0.9)
        ctx.lineTo(cx + ox - s * 0.06, y - s * 0.7)
        ctx.lineTo(cx + ox - s * 0.01, y - s * 0.4)
        ctx.closePath(); ctx.fill()
      }
    } else { // doubleMush — two small mushrooms
      for (const dx of [-s * 0.35, s * 0.32]) {
        ctx.fillStyle = '#F5DEB3'
        roundRect(cx + dx - s * 0.14, y - s * 0.4, s * 0.28, s * 0.4, s * 0.06); ctx.fill()
        ctx.fillStyle = dx < 0 ? '#FF6B35' : '#FF3D9A'
        ctx.beginPath()
        ctx.ellipse(cx + dx, y - s * 0.38, s * 0.38, s * 0.28, 0, Math.PI, 0); ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath(); ctx.arc(cx + dx - s * 0.12, y - s * 0.52, s * 0.07, 0, 7); ctx.fill()
      }
    }
  }

  function drawStar(l: Lane, s: Star, cx: number, pr: { y: number; scale: number }) {
    const r = l.charSize * 0.42 * pr.scale
    const cy = pr.y - s.h * l.charSize * 1.6 * pr.scale
    const t = performance.now() / 400
    const bob = Math.sin(t + s.z * 4) * r * 0.18
    const glow = Math.abs(Math.sin(t * 1.3)) * 0.5 + 0.5

    // glow ring
    ctx.save(); ctx.globalAlpha = glow * 0.4
    ctx.fillStyle = '#FFE566'
    ctx.beginPath(); ctx.arc(cx, cy + bob, r * 1.5, 0, 7); ctx.fill()
    ctx.restore()

    // 5-pointed star
    ctx.fillStyle = '#FFD700'
    ctx.strokeStyle = '#FFA500'; ctx.lineWidth = r * 0.15
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2
      const b = ((i * 4 + 2) * Math.PI) / 5 - Math.PI / 2
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + bob + Math.sin(a) * r)
      else         ctx.lineTo(cx + Math.cos(a) * r, cy + bob + Math.sin(a) * r)
      ctx.lineTo(cx + Math.cos(b) * (r * 0.42), cy + bob + Math.sin(b) * (r * 0.42))
    }
    ctx.closePath(); ctx.fill(); ctx.stroke()

    // height indicator
    if (s.h > 0.8) {
      const arrowCount = s.h > 1.5 ? 2 : 1
      ctx.fillStyle = '#FFD700'; ctx.globalAlpha = 0.8
      for (let i = 0; i < arrowCount; i++) {
        const ay = cy + bob - r * 1.4 - i * r * 0.7
        ctx.beginPath()
        ctx.moveTo(cx, ay - r * 0.4); ctx.lineTo(cx - r * 0.3, ay); ctx.lineTo(cx + r * 0.3, ay)
        ctx.closePath(); ctx.fill()
      }
      ctx.globalAlpha = 1
    }
  }

  function drawChar(l: Lane, cx: number) {
    const baseY = nearY - l.jumpOffset, s = l.charSize, t = performance.now()

    // trail
    for (const td of l.trail) {
      const a = td.life / td.maxLife
      ctx.save(); ctx.globalAlpha = a * 0.3
      ctx.fillStyle = CHAR_COLORS[l.idx]
      roundRect(cx - td.r * 0.9 * l.sqX / 2, td.y - td.r * 1.8 * l.sqY, td.r * 0.9 * l.sqX, td.r * 1.8 * l.sqY, td.r * 0.4)
      ctx.fill(); ctx.restore()
    }

    // double-jump sparkle ring
    if (!l.onGround && l.jumpCount === 2 && l.vy > 0) {
      const ring = (performance.now() % 400) / 400
      ctx.save()
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = s * 0.06
      ctx.globalAlpha = 1 - ring
      ctx.beginPath(); ctx.arc(cx, baseY - s * 0.8, s * (0.6 + ring * 0.8), 0, 7); ctx.stroke()
      ctx.restore()
    }

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.beginPath()
    ctx.ellipse(cx, nearY + s * 0.06, s * 0.4 * (l.onGround ? 1 : 0.5), s * 0.10, 0, 0, 7); ctx.fill()

    const flashing = l.invuln > 0 && Math.floor(l.invuln * 12) % 2 === 0
    const bw = s * 0.9 * l.sqX, bh = s * l.sqY, top = baseY - bh

    // legs
    if (l.alive) {
      const lp = l.onGround ? Math.sin(t / 80 + l.phase) * s * 0.14 : 0
      ctx.fillStyle = CHAR_SHADOW[l.idx]
      roundRect(cx - bw * 0.24, baseY - s * 0.18 + lp, s * 0.2, s * 0.22, s * 0.08); ctx.fill()
      roundRect(cx + bw * 0.04, baseY - s * 0.18 - lp, s * 0.2, s * 0.22, s * 0.08); ctx.fill()
    }

    // body
    if (!flashing) {
      const bodyG = ctx.createLinearGradient(cx - bw / 2, top, cx + bw / 2, top + bh)
      bodyG.addColorStop(0, '#ffffff')
      bodyG.addColorStop(0.25, CHAR_COLORS[l.idx])
      bodyG.addColorStop(1, CHAR_SHADOW[l.idx])
      ctx.fillStyle = bodyG
    } else {
      ctx.fillStyle = '#ffffff'
    }
    roundRect(cx - bw / 2, top, bw, bh, bw * 0.42); ctx.fill()

    // shine
    if (!flashing) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      roundRect(cx - bw * 0.35, top + bh * 0.1, bw * 0.28, bh * 0.25, bw * 0.12); ctx.fill()
    }

    // eyes
    const eyeY = top + bh * 0.38, er = s * 0.11
    if (l.alive && l.blink <= 0) {
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(cx - bw * 0.17, eyeY, er, 0, 7)
      ctx.arc(cx + bw * 0.17, eyeY, er, 0, 7); ctx.fill()
      ctx.fillStyle = '#1a1a2e'
      ctx.beginPath(); ctx.arc(cx - bw * 0.14, eyeY, er * 0.52, 0, 7)
      ctx.arc(cx + bw * 0.20, eyeY, er * 0.52, 0, 7); ctx.fill()
      // sparkle
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.arc(cx - bw * 0.11, eyeY - er * 0.35, er * 0.22, 0, 7)
      ctx.arc(cx + bw * 0.23, eyeY - er * 0.35, er * 0.22, 0, 7); ctx.fill()
    } else {
      ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = s * 0.045; ctx.lineCap = 'round'
      if (!l.alive) {
        const d = er * 0.7
        ctx.beginPath()
        ctx.moveTo(cx - bw * 0.17 - d, eyeY - d); ctx.lineTo(cx - bw * 0.17 + d, eyeY + d)
        ctx.moveTo(cx - bw * 0.17 + d, eyeY - d); ctx.lineTo(cx - bw * 0.17 - d, eyeY + d)
        ctx.moveTo(cx + bw * 0.17 - d, eyeY - d); ctx.lineTo(cx + bw * 0.17 + d, eyeY + d)
        ctx.moveTo(cx + bw * 0.17 + d, eyeY - d); ctx.lineTo(cx + bw * 0.17 - d, eyeY + d)
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.moveTo(cx - bw * 0.25, eyeY); ctx.lineTo(cx - bw * 0.09, eyeY)
        ctx.moveTo(cx + bw * 0.09, eyeY); ctx.lineTo(cx + bw * 0.25, eyeY); ctx.stroke()
      }
    }

    // mouth
    ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = s * 0.04; ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(cx, top + bh * 0.62, s * 0.13, l.alive ? 0.1 * Math.PI : 1.1 * Math.PI, l.alive ? 0.9 * Math.PI : 1.9 * Math.PI)
    ctx.stroke()

    // hat / antenna
    if (l.alive) {
      ctx.fillStyle = CHAR_SHADOW[l.idx]
      roundRect(cx - bw * 0.38, top - bh * 0.12, bw * 0.76, bh * 0.14, bh * 0.06); ctx.fill()
      ctx.fillStyle = CHAR_COLORS[l.idx]
      roundRect(cx - bw * 0.24, top - bh * 0.38, bw * 0.48, bh * 0.3, bh * 0.1); ctx.fill()
    }
  }

  function drawParticles(l: Lane) {
    for (const p of l.particles) {
      const a = p.life / p.maxLife
      ctx.save(); ctx.globalAlpha = a
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, 7); ctx.fill()
      ctx.restore()
    }
  }

  function drawFloatTexts(l: Lane) {
    for (const f of l.floatTexts) {
      const a = f.life / f.maxLife
      ctx.save(); ctx.globalAlpha = a
      ctx.font = `bold ${f.size}px Jua, sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = f.size * 0.12
      ctx.strokeText(f.text, f.x, f.y)
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y)
      ctx.restore()
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  function drawLaneUI(l: Lane) {
    const cx = l.center
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = Math.max(2, H * 0.006)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.floor(H * 0.065)}px Jua, sans-serif`
    const sc = String(Math.floor(l.score))
    ctx.strokeText(sc, cx, H * 0.075); ctx.fillText(sc, cx, H * 0.075)

    // combo
    if (l.combo >= 2) {
      const mul = Math.max(1, Math.floor(l.combo / 3))
      ctx.fillStyle = mul >= 2 ? '#FFD700' : '#FFB0C8'
      ctx.font = `bold ${Math.floor(H * 0.038)}px Jua, sans-serif`
      ctx.fillText(`🌟 x${mul} 배율!`, cx, H * 0.125)
    }

    ctx.font = `${Math.floor(H * 0.04)}px sans-serif`; ctx.textAlign = 'left'
    const hx = l.x + l.w * 0.06, hy = H * 0.04
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k < l.hearts ? '#FF5577' : 'rgba(0,0,0,0.18)'
      ctx.fillText('♥', hx + k * H * 0.046, hy)
    }
    if (playerCount > 1) {
      ctx.fillStyle = CHAR_SHADOW[l.idx]; ctx.textAlign = 'right'
      ctx.font = `bold ${Math.floor(H * 0.038)}px Jua, sans-serif`
      ctx.fillText((l.idx + 1) + 'P', l.x + l.w * 0.94, hy)
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  function drawLaneScene(l: Lane) {
    ctx.save()
    ctx.beginPath(); ctx.rect(l.x, 0, l.w, H); ctx.clip()
    ctx.translate(shakeX, shakeY)

    drawBackground(l)
    drawRoad(l)

    // items sorted by z (farthest first)
    const items: { z: number; kind: string; ref: Obstacle | Star }[] = []
    for (const o of l.obstacles) items.push({ z: o.z, kind: 'ob', ref: o })
    for (const s of l.stars)     items.push({ z: s.z, kind: 'star', ref: s })
    items.sort((a, b) => b.z - a.z)
    for (const it of items) {
      const pr = proj(it.z)
      if (it.kind === 'ob') drawObstacle(l, it.ref as Obstacle, l.center, pr)
      else                  drawStar(l, it.ref as Star, l.center, pr)
    }

    drawChar(l, l.center)
    drawParticles(l)
    drawFloatTexts(l)
    drawLaneUI(l)
    ctx.restore()
  }

  function drawDividers() {
    if (playerCount < 2) return
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = Math.max(3, W * 0.004)
    ctx.setLineDash([12, 10])
    for (let i = 1; i < playerCount; i++) {
      const x = i * (W / playerCount)
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    ctx.setLineDash([])
  }

  function button(x: number, y: number, w: number, h: number, label: string, color: string, action: string, data?: number) {
    ctx.save()
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    roundRect(x + 3, y + 5, w, h, h * 0.28); ctx.fill()
    // body
    roundRect(x, y, w, h, h * 0.28); ctx.fillStyle = color; ctx.fill()
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    roundRect(x + h * 0.08, y + h * 0.1, w - h * 0.16, h * 0.4, h * 0.2); ctx.fill()
    // label
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.floor(h * 0.42)}px Jua, sans-serif`
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 4
    ctx.fillText(label, x + w / 2, y + h / 2)
    ctx.restore()
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    uiButtons.push({ x, y, w, h, action, data })
  }

  function drawMenu() {
    // background
    for (let i = 0; i < lanes.length; i++) drawLaneScene(lanes[i])
    drawDividers()

    ctx.fillStyle = 'rgba(20,10,40,0.6)'; ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

    const t = performance.now()
    const bob = Math.sin(t / 320) * H * 0.012

    // title glow
    ctx.save()
    ctx.shadowColor = '#FF8FAB'; ctx.shadowBlur = 30
    ctx.fillStyle = '#FFE0EC'; ctx.strokeStyle = 'rgba(180,50,100,0.5)'; ctx.lineWidth = H * 0.008
    ctx.font = `bold ${Math.floor(H * 0.13)}px Jua, sans-serif`
    ctx.strokeText('달려라!', W / 2, H * 0.2 + bob); ctx.fillText('달려라!', W / 2, H * 0.2 + bob)
    ctx.restore()

    ctx.font = `${Math.floor(H * 0.042)}px Jua, sans-serif`
    ctx.fillStyle = '#FFE0EC'
    ctx.fillText('별을 먹으면 점수 UP! 두 번 점프 가능!', W / 2, H * 0.31)
    ctx.fillStyle = '#C8EEFF'
    ctx.fillText('몇 명이서 달릴까?', W / 2, H * 0.41)

    uiButtons = []
    const labels = ['혼자', '2명', '3명', '4명']
    const bw = Math.min(W * 0.2, H * 0.22), bh = bw * 0.65, gap = W * 0.025
    const totalW = bw * 4 + gap * 3; let bx = (W - totalW) / 2; const by = H * 0.51
    for (let i = 0; i < 4; i++) { button(bx, by, bw, bh, labels[i], CHAR_SHADOW[i], 'start', i + 1); bx += bw + gap }

    // best score
    ctx.fillStyle = '#FFD700'; ctx.font = `bold ${Math.floor(H * 0.042)}px Jua, sans-serif`
    ctx.fillText('🏆 최고 점수: ' + bestSolo, W / 2, H * 0.73)
    ctx.fillStyle = 'rgba(200,220,255,0.75)'; ctx.font = `${Math.floor(H * 0.028)}px Jua, sans-serif`
    ctx.fillText('(PC: Space / 숫자키로 점프 · 더블점프 가능!)', W / 2, H * 0.81)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  function drawOver() {
    for (const l of lanes) drawLaneScene(l)
    drawDividers()
    ctx.fillStyle = 'rgba(10,5,30,0.62)'; ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

    ctx.save()
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 24
    ctx.fillStyle = '#FFE0EC'; ctx.font = `bold ${Math.floor(H * 0.1)}px Jua, sans-serif`
    ctx.fillText('결과!', W / 2, H * 0.15)
    ctx.restore()

    const scores = lanes.map(l => ({ i: l.idx, s: Math.floor(l.score), c: CHAR_COLORS[l.idx] }))
    const best = Math.max(...scores.map(o => o.s))
    ctx.font = `bold ${Math.floor(H * 0.052)}px Jua, sans-serif`
    scores.forEach((o, k) => {
      const y = H * 0.3 + k * H * 0.085
      ctx.save(); ctx.shadowColor = o.c; ctx.shadowBlur = 8
      ctx.fillStyle = o.c
      ctx.fillText((playerCount > 1 ? (o.i + 1) + 'P : ' : '') + o.s + '점' + (o.s === best && playerCount > 1 ? '  🥇' : ''), W / 2, y)
      ctx.restore()
    })
    if (playerCount === 1) {
      ctx.fillStyle = '#FFD700'; ctx.font = `bold ${Math.floor(H * 0.042)}px Jua, sans-serif`
      ctx.fillText('🏆 최고 점수: ' + bestSolo, W / 2, H * 0.68)
    }
    uiButtons = []
    const bw = Math.min(W * 0.3, H * 0.32), bh = bw * 0.38, gap = W * 0.03
    const totalW = bw * 2 + gap; let bx = (W - totalW) / 2; const by = H * 0.77
    button(bx, by, bw, bh, '또 하기 ▶', '#E8507A', 'again'); bx += bw + gap
    button(bx, by, bw, bh, '처음으로', '#4BA6D4', 'menu')
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  // ── Game loop ─────────────────────────────────────────────────────────────
  let last = performance.now(), animId: number

  function loop(now: number) {
    let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05
    update(dt)
    ctx.clearRect(0, 0, W, H)
    if (state === 'playing') {
      for (const l of lanes) drawLaneScene(l)
      drawDividers()
    } else if (state === 'menu') {
      drawMenu()
    } else if (state === 'over') {
      drawOver()
    }
    animId = requestAnimationFrame(loop)
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  function laneAt(x: number) { return Math.max(0, Math.min(playerCount - 1, Math.floor(x / (W / playerCount)))) }

  function hitUI(x: number, y: number) {
    for (const b of uiButtons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        if (b.action === 'start') startGame(b.data!)
        else if (b.action === 'again') startGame(playerCount)
        else if (b.action === 'menu') { state = 'menu'; lanes = [] }
        return true
      }
    }
    return false
  }

  const handlePointerDown = (e: PointerEvent) => {
    e.preventDefault(); initAudio()
    const r = canvas.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    if (state === 'playing') doJump(laneAt(x))
    else hitUI(x, y)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (state === 'playing') {
      if (e.code === 'Space') { e.preventDefault(); doJump(0) }
      else if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5)) - 1
        if (n >= 0 && n < playerCount) doJump(n)
      }
    }
  }

  canvas.addEventListener('pointerdown', handlePointerDown, { passive: false })
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', resize)

  resize()
  animId = requestAnimationFrame(loop)

  return () => {
    cancelAnimationFrame(animId)
    canvas.removeEventListener('pointerdown', handlePointerDown)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('resize', resize)
  }
}
