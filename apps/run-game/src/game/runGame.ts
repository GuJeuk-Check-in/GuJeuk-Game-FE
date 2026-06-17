export function initGame(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!

  // ── Palette ───────────────────────────────────────────────────────────────
  const CHAR_COLORS = ['#FF8FAB', '#74C7EC', '#F9E2AF', '#A6E3A1']
  const CHAR_SHADOW = ['#E8507A', '#4BA6D4', '#D4A520', '#4CAF50']
  const LS_KEY = 'gujuck_run_best'
  const NDASH = 7

  // ── State ─────────────────────────────────────────────────────────────────
  let W = 0, H = 0, dpr = 1, horizonY = 0, nearY = 0
  let state: 'menu' | 'playing' | 'over' = 'menu'
  let playerCount = 1
  let lanes: Lane[] = []
  let elapsed = 0
  let bestSolo = (() => { try { return parseInt(localStorage.getItem(LS_KEY) ?? '0', 10) || 0 } catch { return 0 } })()
  let uiButtons: { x: number; y: number; w: number; h: number; action: string; data?: number }[] = []
  let shakeX = 0, shakeY = 0, shakeDur = 0, shakeAmt = 0

  // ── Audio ─────────────────────────────────────────────────────────────────
  let actx: AudioContext | null = null
  function initAudio() {
    if (!actx) try { actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() } catch (_) {}
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
  const sJump  = () => blip(520, 0.12, 'square')
  const sDJump = () => { blip(780, 0.08, 'triangle', 0.09); blip(1040, 0.14, 'triangle', 0.06) }
  const sStar  = () => blip(880, 0.18, 'triangle', 0.09)
  const sHit   = () => blip(140, 0.28, 'sawtooth', 0.10)
  const sLand  = () => blip(260, 0.06, 'square', 0.04)
  const sDodge = () => blip(660, 0.09, 'triangle', 0.06)
  const sCombo = (n: number) => blip(440 + n * 80, 0.14, 'triangle', 0.08)

  // ── Types ─────────────────────────────────────────────────────────────────
  type Particle  = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; r: number; gravity: number }
  type FloatText = { x: number; y: number; vy: number; life: number; maxLife: number; text: string; color: string; size: number }
  type Star      = { z: number; resolved: boolean; got: boolean; h: number }
  type Cloud     = { x: number; y: number; w: number; s: number; puffs: number[] }
  type TrailDot  = { x: number; y: number; life: number; maxLife: number; r: number }

  // obstacle pattern determines movement/timing mechanic:
  // static  = normal, jump over
  // bounce  = height oscillates; safe to run under when high, jump over when low
  // rush    = accelerates suddenly at mid-range (reaction test)
  // stealth = invisible until close (reflex test)
  type ObstaclePattern = 'static' | 'bounce' | 'rush' | 'stealth'
  type ObstacleKind    = 'mushroom' | 'crystal' | 'spike' | 'doubleMush' | 'bat' | 'pumpkin'

  type Obstacle = {
    z: number; resolved: boolean
    kind: ObstacleKind; pattern: ObstaclePattern
    // lateral: -1 = left third, 0 = center, +1 = right third of lane
    xSlot: number
    // bounce state
    bouncePhase: number; bounceSpeed: number
    bounceH: number   // computed height above ground (in pixels ÷ charSize)
    // rush state
    speedMul: number; rushed: boolean
    // stealth state
    alpha: number
  }

  type Lane = {
    idx: number; x: number; w: number; center: number; charSize: number
    // vertical jump
    jumpOffset: number; vy: number; onGround: boolean
    canDoubleJump: boolean; jumpCount: number; wasGrounded: boolean
    // lateral dodge
    xSlot: number; targetXSlot: number; dodgeTimer: number; xSmooth: number
    // status
    hearts: number; score: number; alive: boolean; invuln: number
    sqX: number; sqY: number
    obstacles: Obstacle[]; stars: Star[]
    particles: Particle[]; floatTexts: FloatText[]; trail: TrailDot[]
    combo: number; comboTimer: number
    spawnT: number; starT: number; roadPhase: number; phase: number
    blink: number; blinkT: number
    clouds: Cloud[]; mtFarPhase: number; mtNearPhase: number
  }

  // ── Lane factory ──────────────────────────────────────────────────────────
  function makeLane(i: number, n: number): Lane {
    const lw = W / n
    const clouds: Cloud[] = []
    for (let k = 0; k < 3; k++)
      clouds.push({ x: Math.random() * lw, y: H * (0.05 + Math.random() * 0.10), w: lw * (0.18 + Math.random() * 0.16), s: H * (0.008 + Math.random() * 0.008), puffs: [0, Math.random() * 0.3 + 0.2, -(Math.random() * 0.3 + 0.2)] })
    return {
      idx: i, x: i * lw, w: lw, center: i * lw + lw / 2,
      charSize: Math.min(lw * 0.34, H * 0.12),
      jumpOffset: 0, vy: 0, onGround: true,
      canDoubleJump: false, jumpCount: 0, wasGrounded: true,
      xSlot: 0, targetXSlot: 0, dodgeTimer: 0, xSmooth: 0,
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
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr)
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
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
    const r1 = p(c1.slice(1, 3)), g1 = p(c1.slice(3, 5)), b1 = p(c1.slice(5, 7))
    const r2 = p(c2.slice(1, 3)), g2 = p(c2.slice(3, 5)), b2 = p(c2.slice(5, 7))
    return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  }

  function triggerShake(amount: number, dur: number) { shakeAmt = amount; shakeDur = dur }

  function spawnParticles(l: Lane, x: number, y: number, n: number, colors: string[], spread = 1, gravity = 800) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, spd = (60 + Math.random() * 180) * spread
      l.particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 120, life: 0.5 + Math.random() * 0.4, maxLife: 0.9, color: colors[Math.floor(Math.random() * colors.length)], r: 3 + Math.random() * 5, gravity })
    }
  }

  function spawnFloatText(l: Lane, x: number, y: number, text: string, color: string, size: number) {
    l.floatTexts.push({ x, y, vy: -90, life: 0.9, maxLife: 0.9, text, color, size })
  }

  // lateral pixel offset for a given xSlot and lane
  function xSlotPx(l: Lane, slot: number, scale = 1) { return slot * l.w * 0.22 * scale }

  // ── Obstacle factory ──────────────────────────────────────────────────────
  function makeObstacle(kind: ObstacleKind, z: number): Obstacle {
    // pattern assignment
    let pattern: ObstaclePattern = 'static'
    if (kind === 'bat' || kind === 'pumpkin') {
      pattern = 'bounce'
    } else if (elapsed > 22 && kind === 'crystal' && Math.random() < 0.40) {
      pattern = 'stealth'
    } else if (elapsed > 18 && (kind === 'spike' || kind === 'mushroom') && Math.random() < 0.30) {
      pattern = 'rush'
    }

    // lateral slot: mostly center early, sides open up later
    let xSlot = 0
    if (elapsed > 28 && playerCount === 1) {
      const r = Math.random()
      xSlot = r < 0.28 ? -1 : r < 0.56 ? 1 : 0
    }

    return {
      z, resolved: false, kind, pattern, xSlot,
      bouncePhase: Math.random() * Math.PI * 2,
      bounceSpeed: kind === 'bat' ? 2.4 + Math.random() * 1.0 : 3.2 + Math.random() * 1.6,
      bounceH: 0,
      speedMul: 1, rushed: false,
      alpha: pattern === 'stealth' ? 0 : 1,
    }
  }

  // ── Game control ──────────────────────────────────────────────────────────
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
      spawnParticles(l, l.center + xSlotPx(l, l.xSmooth), nearY, 6, ['#fff', '#ffe0f0'], 0.6, 600)
    } else if (l.canDoubleJump) {
      l.vy = 8.0 * l.charSize; l.canDoubleJump = false; l.jumpCount = 2
      l.sqX = 0.70; l.sqY = 1.35; sDJump()
      const cx = l.center + xSlotPx(l, l.xSmooth), by = nearY - l.jumpOffset
      spawnParticles(l, cx, by, 12, ['#FFD700', '#FFF', '#F0A0FF', '#A0DFFF'], 1.1, 400)
    }
  }

  function doDodge(li: number, dir: -1 | 1) {
    const l = lanes[li]; if (!l || !l.alive) return
    const next = l.targetXSlot === 0 ? dir : 0   // toggle back to center if already dodging
    l.targetXSlot = next; l.dodgeTimer = 0.65; sDodge()
    spawnParticles(l, l.center + xSlotPx(l, l.xSmooth), nearY - l.jumpOffset - l.charSize * 0.5, 5, dir < 0 ? ['#74C7EC', '#fff'] : ['#F9E2AF', '#fff'], 0.7, 400)
  }

  // ── Update ────────────────────────────────────────────────────────────────
  function update(dt: number) {
    if (state !== 'playing') return
    elapsed += dt
    const speed = 0.45 + Math.min(elapsed * 0.007, 0.55)
    let anyAlive = false

    if (shakeDur > 0) {
      shakeDur -= dt
      const a = shakeAmt * Math.min(1, shakeDur / 0.2)
      shakeX = (Math.random() * 2 - 1) * a; shakeY = (Math.random() * 2 - 1) * a
    } else { shakeX = 0; shakeY = 0 }

    for (const l of lanes) {
      l.mtFarPhase  = (l.mtFarPhase  + speed * 0.012 * dt) % 1
      l.mtNearPhase = (l.mtNearPhase + speed * 0.028 * dt) % 1
      for (const c of l.clouds) { c.x -= c.s * dt; if (c.x + c.w < 0) c.x = l.w + Math.random() * l.w * 0.4 }
      l.roadPhase = (l.roadPhase + speed * dt) % 1

      if (!l.alive) continue
      anyAlive = true

      // ── vertical physics
      const g = 26 * l.charSize
      l.vy -= g * dt; l.jumpOffset += l.vy * dt
      const hitGround = l.jumpOffset <= 0
      if (hitGround && !l.wasGrounded) {
        l.jumpOffset = 0; l.vy = 0; l.onGround = true
        l.canDoubleJump = false; l.jumpCount = 0
        l.sqX = 1.3; l.sqY = 0.72; sLand()
        spawnParticles(l, l.center + xSlotPx(l, l.xSmooth), nearY, 5, ['#ccc', '#fff'], 0.5, 500)
      } else if (hitGround) { l.jumpOffset = 0; l.vy = 0; l.onGround = true }
      l.wasGrounded = l.onGround

      // ── lateral smooth
      if (l.dodgeTimer > 0) {
        l.dodgeTimer -= dt
        if (l.dodgeTimer <= 0) { l.targetXSlot = 0 }
      }
      l.xSmooth += (l.targetXSlot - l.xSmooth) * Math.min(1, dt * 14)

      // ── squash/stretch spring
      l.sqX += (1 - l.sqX) * Math.min(1, dt * 14)
      l.sqY += (1 - l.sqY) * Math.min(1, dt * 14)

      l.invuln = Math.max(0, l.invuln - dt)
      l.blinkT -= dt; if (l.blinkT <= 0) { l.blink = 0.12; l.blinkT = 1.5 + Math.random() * 3 }
      l.blink = Math.max(0, l.blink - dt)
      if (l.comboTimer > 0) { l.comboTimer -= dt; if (l.comboTimer <= 0) l.combo = 0 }

      // ── obstacle spawn
      l.spawnT -= dt
      if (l.spawnT <= 0) {
        // kind pool weighted by elapsed
        const pool: ObstacleKind[] = elapsed < 12
          ? ['mushroom', 'mushroom', 'spike']
          : elapsed < 30
            ? ['mushroom', 'crystal', 'spike', 'bat', 'pumpkin']
            : ['mushroom', 'crystal', 'spike', 'doubleMush', 'bat', 'pumpkin', 'pumpkin']
        const kind = pool[Math.floor(Math.random() * pool.length)]
        l.obstacles.push(makeObstacle(kind, 1.0))

        // cluster: occasional 2nd obstacle close behind
        if (elapsed > 18 && Math.random() < 0.28) {
          const pool2: ObstacleKind[] = ['mushroom', 'crystal', 'spike']
          l.obstacles.push(makeObstacle(pool2[Math.floor(Math.random() * pool2.length)], 1.22))
        }

        l.spawnT = Math.max(0.55, 1.5 - elapsed * 0.017) + Math.random() * 0.6
      }

      // ── star spawn
      l.starT -= dt
      if (l.starT <= 0) {
        const r = Math.random()
        l.stars.push({ z: 1, resolved: false, got: false, h: r < 0.5 ? 0.5 : r < 0.8 ? 1.0 : 1.8 })
        l.starT = 2.4 + Math.random() * 2.4
      }

      // ── update obstacles (pattern logic)
      for (const o of l.obstacles) {
        if (o.pattern === 'bounce') {
          o.bouncePhase += o.bounceSpeed * dt
          // bat: swoops 0 ↔ 1.6·charSize (run-under when high, jump-over when low)
          // pumpkin: bounces 0 ↔ 1.3·charSize (same principle)
          if (o.kind === 'bat') {
            o.bounceH = 0.8 * (1 + Math.sin(o.bouncePhase))   // range 0–1.6 (× charSize)
          } else {
            o.bounceH = 1.3 * Math.abs(Math.sin(o.bouncePhase)) // range 0–1.3 (× charSize)
          }
        } else if (o.pattern === 'rush') {
          if (!o.rushed && o.z < 0.44) { o.speedMul = 2.6; o.rushed = true }
        } else if (o.pattern === 'stealth') {
          // invisible until z≈0.38, then flash in over 0.12 units
          o.alpha = o.z > 0.38 ? 0 : o.z < 0.26 ? 1 : (0.38 - o.z) / 0.12
        }
        o.z -= speed * o.speedMul * dt
      }

      for (const s of l.stars) s.z -= speed * dt

      // ── trail
      if (!l.onGround) {
        const cx = l.center + xSlotPx(l, l.xSmooth), by = nearY - l.jumpOffset
        l.trail.push({ x: cx, y: by, life: 0.18, maxLife: 0.18, r: l.charSize * 0.35 })
      }
      for (const t of l.trail) t.life -= dt
      l.trail = l.trail.filter(t => t.life > 0)

      // ── obstacle collision
      const charX = l.center + xSlotPx(l, l.xSmooth)
      for (const o of l.obstacles) {
        if (o.resolved || o.z > 0.07) continue
        o.resolved = true

        // 1) lateral dodge check (obstacle's near-plane x vs character x)
        const obstX = l.center + xSlotPx(l, o.xSlot, proj(0.06).scale)
        const xDodged = Math.abs(obstX - charX) > l.charSize * 0.52
        if (xDodged) {
          spawnParticles(l, charX, nearY - l.jumpOffset - l.charSize * 0.8, 5, ['#74C7EC', '#fff'], 0.8, 300)
          spawnFloatText(l, charX, nearY - l.jumpOffset - l.charSize * 1.6, 'DODGE!', '#74C7EC', Math.floor(H * 0.05))
          continue
        }

        // 2) vertical check (depends on pattern/kind)
        let safe = false
        if (o.kind === 'bat') {
          // bat occupies [bounceH - 0.4, bounceH + 0.4] × charSize above ground
          const batBot = Math.max(0, (o.bounceH - 0.4) * l.charSize)
          const batTop = (o.bounceH + 0.4) * l.charSize
          const cBot = l.jumpOffset, cTop = l.jumpOffset + l.charSize * 0.88
          safe = !(cBot < batTop && cTop > batBot)
        } else if (o.pattern === 'bounce') {
          // pumpkin: occupies [bounceH, bounceH + 1.1] × charSize
          const pBot = o.bounceH * l.charSize
          const pTop = pBot + l.charSize * 1.1
          const cBot = l.jumpOffset, cTop = l.jumpOffset + l.charSize * 0.88
          safe = !(cBot < pTop && cTop > pBot)
        } else {
          // normal: must be airborne
          safe = !l.onGround
        }

        if (!safe && l.invuln <= 0) {
          l.hearts--; l.invuln = 1.2; l.combo = 0
          sHit(); triggerShake(12, 0.28)
          spawnParticles(l, charX, nearY - l.jumpOffset, 10, ['#FF4444', '#FF8800', '#FFD700'], 1.2, 700)
          spawnFloatText(l, charX, nearY - l.jumpOffset - l.charSize * 1.5, '💔', '#FF4444', Math.floor(H * 0.07))
          if (l.hearts <= 0) {
            l.alive = false
            spawnParticles(l, charX, nearY - l.jumpOffset, 20, [CHAR_COLORS[l.idx], '#fff', '#FFD700'], 1.5, 500)
          }
        }
      }

      // ── star collision
      for (const s of l.stars) {
        if (!s.resolved && s.z <= 0.07) {
          s.resolved = true
          const jumpH = l.jumpOffset / (l.charSize * 2.5)
          const canGet = (s.h <= 0.6) || (s.h <= 1.2 && jumpH > 0.3) || (s.h > 1.2 && jumpH > 0.9)
          if (canGet) {
            s.got = true; l.combo++; l.comboTimer = 3.5
            const mul = Math.max(1, Math.floor(l.combo / 3))
            const pts = 50 * mul; l.score += pts; sStar()
            const sy = nearY - l.jumpOffset - s.h * l.charSize * 1.6
            spawnParticles(l, charX, sy, 10, ['#FFD700', '#FFF', '#FFB800'], 1.2, 300)
            const label = l.combo >= 3 ? `x${mul} 콤보!` : `+${pts}`
            spawnFloatText(l, charX, sy - l.charSize * 0.5, label, l.combo >= 6 ? '#FF8FAB' : l.combo >= 3 ? '#FFD700' : '#fff', Math.floor(H * 0.055))
            if (l.combo > 0 && l.combo % 3 === 0) sCombo(Math.floor(l.combo / 3))
          }
        }
      }

      l.obstacles = l.obstacles.filter(o => o.z > -0.2)
      l.stars = l.stars.filter(s => !s.got && s.z > -0.2)
      for (const p of l.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.life -= dt }
      l.particles = l.particles.filter(p => p.life > 0)
      for (const f of l.floatTexts) { f.y += f.vy * dt; f.life -= dt }
      l.floatTexts = l.floatTexts.filter(f => f.life > 0)
      l.score += dt * 10
    }
    if (!anyAlive) gameOver()
  }

  function gameOver() {
    state = 'over'
    if (playerCount === 1) {
      const s = Math.floor(lanes[0].score)
      if (s > bestSolo) {
        bestSolo = s
        try { localStorage.setItem(LS_KEY, String(s)) } catch (_) {}
      }
    }
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────
  function skyColor(t: number) {
    const p = Math.min(1, t / 120)
    if (p < 0.5) {
      return { top: lerpColor('#5EC8FF', '#FF9E6A', p * 2), bot: lerpColor('#C8EEFF', '#FFD4A0', p * 2) }
    }
    const u = (p - 0.5) * 2
    return { top: lerpColor('#FF9E6A', '#1A1042', u), bot: lerpColor('#FFD4A0', '#2D2060', u) }
  }

  function drawBackground(l: Lane) {
    const sky = skyColor(elapsed)
    const sg = ctx.createLinearGradient(0, 0, 0, horizonY)
    sg.addColorStop(0, sky.top); sg.addColorStop(1, sky.bot)
    ctx.fillStyle = sg; ctx.fillRect(l.x, 0, l.w, horizonY)

    const nightP = Math.max(0, (elapsed - 70) / 50)
    if (nightP > 0) {
      const seed = l.idx * 137
      for (let i = 0; i < 28; i++) {
        const sx = l.x + ((seed * 7 + i * 83) % l.w)
        const sy = ((seed * 13 + i * 47) % (horizonY * 0.85))
        const tw = 0.5 + 0.5 * Math.sin(performance.now() / 500 + i * 1.7)
        ctx.save(); ctx.globalAlpha = nightP * tw * 0.85; ctx.fillStyle = '#fff'
        ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, 7); ctx.fill(); ctx.restore()
      }
    }
    const sunP = Math.max(0, 1 - elapsed / 80), moonP = Math.max(0, (elapsed - 60) / 60)
    if (sunP > 0) {
      ctx.save(); ctx.globalAlpha = sunP; ctx.fillStyle = '#FFE066'
      ctx.beginPath(); ctx.arc(l.x + l.w * 0.82, H * 0.09, l.charSize * 0.52, 0, 7); ctx.fill(); ctx.restore()
    }
    if (moonP > 0) {
      ctx.save(); ctx.globalAlpha = moonP
      ctx.fillStyle = '#E0E8FF'; ctx.beginPath(); ctx.arc(l.x + l.w * 0.78, H * 0.09, l.charSize * 0.42, 0, 7); ctx.fill()
      ctx.fillStyle = sky.top; ctx.beginPath(); ctx.arc(l.x + l.w * 0.81, H * 0.082, l.charSize * 0.38, 0, 7); ctx.fill()
      ctx.restore()
    }
    drawMountains(l, l.mtFarPhase, 0.28, '#B8D4F0', '#8FB8E0', 6)
    drawMountains(l, l.mtNearPhase, 0.42, '#8CB87A', '#6A9A58', 4)
    for (const c of l.clouds) drawCloud(l, c)
    const gp = Math.min(1, elapsed / 120)
    const gg = ctx.createLinearGradient(0, horizonY, 0, H)
    gg.addColorStop(0, lerpColor('#86cf57', '#3D5C30', gp)); gg.addColorStop(1, lerpColor('#6ab040', '#2E4520', gp))
    ctx.fillStyle = gg; ctx.fillRect(l.x, horizonY, l.w, H - horizonY)
  }

  function drawMountains(l: Lane, phase: number, hf: number, c1: string, c2: string, n: number) {
    const mh = horizonY * hf
    ctx.save(); ctx.beginPath(); ctx.rect(l.x, 0, l.w, horizonY); ctx.clip()
    const mg = ctx.createLinearGradient(0, horizonY - mh, 0, horizonY)
    mg.addColorStop(0, c1); mg.addColorStop(1, c2); ctx.fillStyle = mg
    ctx.beginPath(); ctx.moveTo(l.x, horizonY)
    const sw = l.w / n
    for (let i = -1; i <= n + 1; i++) {
      const px = l.x + ((i + phase) % (n + 1)) * sw
      ctx.lineTo(px, horizonY)
      ctx.quadraticCurveTo(px + sw / 2, horizonY - mh * (0.7 + 0.3 * Math.sin(i * 2.1)), px + sw, horizonY)
    }
    ctx.lineTo(l.x + l.w + 10, horizonY); ctx.closePath(); ctx.fill(); ctx.restore()
  }

  function drawCloud(l: Lane, c: Cloud) {
    ctx.save(); ctx.globalAlpha = 0.88; ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(l.x + c.x, c.y, c.w * 0.28, 0, 7)
    for (const off of c.puffs) ctx.arc(l.x + c.x + c.w * off, c.y - c.w * 0.06, c.w * 0.19, 0, 7)
    ctx.fill(); ctx.restore()
  }

  function drawRoad(l: Lane) {
    const rp = Math.min(1, elapsed / 120)
    const topHW = l.w * 0.05, botHW = l.w * 0.36, cx = l.center
    ctx.fillStyle = lerpColor('#e3cf95', '#706050', rp)
    ctx.beginPath()
    ctx.moveTo(cx - topHW, horizonY); ctx.lineTo(cx + topHW, horizonY)
    ctx.lineTo(cx + botHW, H); ctx.lineTo(cx - botHW, H); ctx.closePath(); ctx.fill()

    // sub-lane markers (show 3 lateral slots)
    ctx.strokeStyle = lerpColor('#cdb678', '#504030', rp); ctx.lineWidth = Math.max(1, l.w * 0.006)
    ctx.setLineDash([6, 8])
    for (const slot of [-1, 1]) {
      const topX = cx + slot * topHW * 0.6, botX = cx + slot * botHW * 0.55
      ctx.beginPath(); ctx.moveTo(topX, horizonY); ctx.lineTo(botX, H); ctx.stroke()
    }
    ctx.setLineDash([])

    // road edge lines
    ctx.lineWidth = Math.max(2, l.w * 0.010)
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

  // speed lines (visual tension when fast)
  function drawSpeedLines(l: Lane) {
    const speedFrac = Math.min(1, (elapsed - 30) / 60)
    if (speedFrac <= 0) return
    const t = performance.now()
    ctx.save(); ctx.globalAlpha = speedFrac * 0.18; ctx.strokeStyle = '#fff'
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + t / 1400
      const rx = l.center + Math.cos(ang) * l.w * 0.42
      const ry = nearY * 0.5 + Math.sin(ang) * H * 0.22
      const len = l.charSize * (0.8 + speedFrac * 1.2)
      ctx.lineWidth = 1 + speedFrac
      ctx.beginPath()
      ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(ang) * len, ry + Math.sin(ang) * len)
      ctx.stroke()
    }
    ctx.restore()
  }

  function drawObstacle(l: Lane, o: Obstacle, pr: { y: number; scale: number }) {
    const bounceOff = o.bounceH * l.charSize * pr.scale   // lift in pixels
    const s = l.charSize * 0.95 * pr.scale
    const baseX = l.center + xSlotPx(l, o.xSlot, pr.scale)
    const y = pr.y - bounceOff

    ctx.save()
    ctx.globalAlpha = o.alpha

    // rush: draw speed streaks behind obstacle
    if (o.pattern === 'rush' && o.rushed) {
      ctx.save(); ctx.globalAlpha = o.alpha * 0.55
      ctx.strokeStyle = '#FF6600'; ctx.lineCap = 'round'
      for (let i = 0; i < 4; i++) {
        const len = s * (0.6 + i * 0.3), oy = (i - 1.5) * s * 0.22
        ctx.lineWidth = s * 0.08 * (1 - i * 0.18)
        ctx.beginPath(); ctx.moveTo(baseX + len + s * 0.6, y - s * 0.4 + oy); ctx.lineTo(baseX + s * 0.5, y - s * 0.4 + oy); ctx.stroke()
      }
      ctx.restore()
    }

    // stealth: shimmer before reveal
    if (o.pattern === 'stealth' && o.alpha < 0.5) {
      ctx.save(); ctx.globalAlpha = Math.sin(performance.now() / 120) * 0.4 + 0.1
      ctx.fillStyle = '#C8A0FF'
      ctx.beginPath(); ctx.arc(baseX, y - s * 0.5, s * 0.7, 0, 7); ctx.fill()
      ctx.restore()
    }

    // bounce shadow on ground (timing cue)
    if (o.pattern === 'bounce' && bounceOff > 2) {
      const shadowA = Math.max(0, 0.35 * (1 - o.bounceH / 1.5))
      ctx.save(); ctx.globalAlpha = shadowA
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.beginPath(); ctx.ellipse(baseX, pr.y, s * (0.5 - o.bounceH * 0.1), s * 0.12, 0, 0, 7); ctx.fill()
      ctx.restore()
    }

    // ── shape drawing ──────────────────────────────────────────────────────
    if (o.kind === 'mushroom') {
      ctx.fillStyle = '#F5DEB3'; roundRect(baseX - s * 0.2, y - s * 0.55, s * 0.4, s * 0.55, s * 0.08); ctx.fill()
      ctx.fillStyle = '#E84040'
      ctx.beginPath(); ctx.ellipse(baseX, y - s * 0.52, s * 0.55, s * 0.40, 0, Math.PI, 0); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(baseX - s * 0.18, y - s * 0.72, s * 0.10, 0, 7); ctx.fill()
      ctx.beginPath(); ctx.arc(baseX + s * 0.15, y - s * 0.82, s * 0.08, 0, 7); ctx.fill()

    } else if (o.kind === 'crystal') {
      ctx.fillStyle = '#9B59FF'
      ctx.beginPath()
      ctx.moveTo(baseX, y - s); ctx.lineTo(baseX + s * 0.32, y - s * 0.45)
      ctx.lineTo(baseX + s * 0.22, y); ctx.lineTo(baseX - s * 0.22, y)
      ctx.lineTo(baseX - s * 0.32, y - s * 0.45); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(200,160,255,0.55)'
      ctx.beginPath()
      ctx.moveTo(baseX, y - s); ctx.lineTo(baseX + s * 0.12, y - s * 0.5)
      ctx.lineTo(baseX, y - s * 0.08); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#C88AFF'; ctx.lineWidth = s * 0.04
      ctx.beginPath()
      ctx.moveTo(baseX, y - s); ctx.lineTo(baseX + s * 0.32, y - s * 0.45)
      ctx.lineTo(baseX + s * 0.22, y); ctx.lineTo(baseX - s * 0.22, y)
      ctx.lineTo(baseX - s * 0.32, y - s * 0.45); ctx.closePath(); ctx.stroke()

    } else if (o.kind === 'spike') {
      const n = 3
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * s * 0.38
        ctx.fillStyle = '#708090'
        ctx.beginPath(); ctx.moveTo(baseX + ox, y); ctx.lineTo(baseX + ox - s * 0.15, y); ctx.lineTo(baseX + ox, y - s * 0.9); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#A0B0C0'
        ctx.beginPath(); ctx.moveTo(baseX + ox, y - s * 0.9); ctx.lineTo(baseX + ox - s * 0.06, y - s * 0.7); ctx.lineTo(baseX + ox - s * 0.01, y - s * 0.4); ctx.closePath(); ctx.fill()
      }

    } else if (o.kind === 'doubleMush') {
      for (const dx of [-s * 0.35, s * 0.32]) {
        ctx.fillStyle = '#F5DEB3'; roundRect(baseX + dx - s * 0.14, y - s * 0.4, s * 0.28, s * 0.4, s * 0.06); ctx.fill()
        ctx.fillStyle = dx < 0 ? '#FF6B35' : '#FF3D9A'
        ctx.beginPath(); ctx.ellipse(baseX + dx, y - s * 0.38, s * 0.38, s * 0.28, 0, Math.PI, 0); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(baseX + dx - s * 0.12, y - s * 0.52, s * 0.07, 0, 7); ctx.fill()
      }

    } else if (o.kind === 'bat') {
      // wings flap based on bouncePhase + time
      const flap = Math.sin(performance.now() / 110 + o.bouncePhase) * 0.45
      ctx.fillStyle = '#3A1060'
      // body
      ctx.beginPath(); ctx.ellipse(baseX, y - s * 0.38, s * 0.28, s * 0.22, 0, 0, 7); ctx.fill()
      // wings
      ctx.fillStyle = '#5A2080'
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(baseX, y - s * 0.38)
        ctx.quadraticCurveTo(baseX + side * s * 0.55, y - s * (0.55 + flap * 0.4), baseX + side * s * 0.85, y - s * (0.18 - flap * 0.3))
        ctx.quadraticCurveTo(baseX + side * s * 0.5, y - s * 0.12, baseX, y - s * 0.3)
        ctx.closePath(); ctx.fill()
      }
      // ears
      ctx.fillStyle = '#3A1060'
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(baseX + side * s * 0.1, y - s * 0.54)
        ctx.lineTo(baseX + side * s * 0.22, y - s * 0.75)
        ctx.lineTo(baseX + side * s * 0.04, y - s * 0.56)
        ctx.closePath(); ctx.fill()
      }
      // eyes
      ctx.fillStyle = '#FF4488'
      ctx.beginPath(); ctx.arc(baseX - s * 0.1, y - s * 0.4, s * 0.065, 0, 7); ctx.fill()
      ctx.beginPath(); ctx.arc(baseX + s * 0.1, y - s * 0.4, s * 0.065, 0, 7); ctx.fill()
      // warning indicator: red glow when swooping low
      if (o.bounceH < 0.25) {
        ctx.save(); ctx.globalAlpha = (0.25 - o.bounceH) / 0.25 * 0.6
        ctx.fillStyle = '#FF0000'
        ctx.beginPath(); ctx.arc(baseX, y - s * 0.38, s * 0.9, 0, 7); ctx.fill()
        ctx.restore()
      }

    } else if (o.kind === 'pumpkin') {
      // rolling rotation based on z
      const roll = (1 - o.z) * Math.PI * 6
      ctx.save(); ctx.translate(baseX, y - s * 0.52); ctx.rotate(roll)
      // body
      ctx.fillStyle = '#FF7A20'
      ctx.beginPath(); ctx.arc(0, 0, s * 0.52, 0, 7); ctx.fill()
      // ribs
      ctx.strokeStyle = '#E05C00'; ctx.lineWidth = s * 0.06
      for (let r = -2; r <= 2; r++) {
        ctx.save(); ctx.rotate(r * 0.28)
        ctx.beginPath(); ctx.moveTo(0, -s * 0.52); ctx.lineTo(0, s * 0.52); ctx.stroke()
        ctx.restore()
      }
      // face
      ctx.fillStyle = '#1A0800'
      const eye = (ex: number, ey: number) => {
        ctx.beginPath(); ctx.moveTo(ex - s * 0.1, ey); ctx.lineTo(ex, ey - s * 0.1); ctx.lineTo(ex + s * 0.1, ey); ctx.closePath(); ctx.fill()
      }
      eye(-s * 0.18, -s * 0.1); eye(s * 0.18, -s * 0.1)
      ctx.beginPath()
      for (let i = -2; i <= 2; i++) ctx.arc(i * s * 0.1, s * 0.12 + (Math.abs(i) % 2) * s * 0.06, s * 0.06, 0, 7)
      ctx.fill()
      // stem
      ctx.fillStyle = '#4A8020'; roundRect(-s * 0.08, -s * 0.64, s * 0.16, s * 0.22, s * 0.06); ctx.fill()
      ctx.restore()
      // warning when near ground
      if (o.bounceH < 0.15) {
        ctx.save(); ctx.globalAlpha = (0.15 - o.bounceH) / 0.15 * 0.5
        ctx.fillStyle = '#FF4400'
        ctx.beginPath(); ctx.arc(baseX, y - s * 0.52, s * 0.8, 0, 7); ctx.fill()
        ctx.restore()
      }
    }

    ctx.restore()
  }

  function drawStar(l: Lane, s: Star, cx: number, pr: { y: number; scale: number }) {
    const r = l.charSize * 0.42 * pr.scale
    const cy = pr.y - s.h * l.charSize * 1.6 * pr.scale
    const t = performance.now() / 400
    const bob = Math.sin(t + s.z * 4) * r * 0.18
    const glow = Math.abs(Math.sin(t * 1.3)) * 0.5 + 0.5
    ctx.save(); ctx.globalAlpha = glow * 0.4; ctx.fillStyle = '#FFE566'
    ctx.beginPath(); ctx.arc(cx, cy + bob, r * 1.5, 0, 7); ctx.fill(); ctx.restore()
    ctx.fillStyle = '#FFD700'; ctx.strokeStyle = '#FFA500'; ctx.lineWidth = r * 0.15
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2, b = ((i * 4 + 2) * Math.PI) / 5 - Math.PI / 2
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + bob + Math.sin(a) * r)
      else ctx.lineTo(cx + Math.cos(a) * r, cy + bob + Math.sin(a) * r)
      ctx.lineTo(cx + Math.cos(b) * (r * 0.42), cy + bob + Math.sin(b) * (r * 0.42))
    }
    ctx.closePath(); ctx.fill(); ctx.stroke()
    if (s.h > 0.8) {
      const ac = s.h > 1.5 ? 2 : 1; ctx.fillStyle = '#FFD700'
      for (let i = 0; i < ac; i++) {
        const ay = cy + bob - r * 1.4 - i * r * 0.7
        ctx.save(); ctx.globalAlpha = 0.8
        ctx.beginPath(); ctx.moveTo(cx, ay - r * 0.4); ctx.lineTo(cx - r * 0.3, ay); ctx.lineTo(cx + r * 0.3, ay); ctx.closePath(); ctx.fill()
        ctx.restore()
      }
    }
  }

  function drawChar(l: Lane, cx: number) {
    const baseY = nearY - l.jumpOffset, s = l.charSize, t = performance.now()
    for (const td of l.trail) {
      ctx.save(); ctx.globalAlpha = (td.life / td.maxLife) * 0.28
      ctx.fillStyle = CHAR_COLORS[l.idx]
      roundRect(cx - td.r * 0.9 / 2, td.y - td.r * 1.8, td.r * 0.9, td.r * 1.8, td.r * 0.4)
      ctx.fill(); ctx.restore()
    }
    if (!l.onGround && l.jumpCount === 2 && l.vy > 0) {
      const ring = (performance.now() % 400) / 400
      ctx.save(); ctx.strokeStyle = '#FFD700'; ctx.lineWidth = s * 0.06; ctx.globalAlpha = 1 - ring
      ctx.beginPath(); ctx.arc(cx, baseY - s * 0.8, s * (0.6 + ring * 0.8), 0, 7); ctx.stroke(); ctx.restore()
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.beginPath(); ctx.ellipse(cx, nearY + s * 0.06, s * 0.4 * (l.onGround ? 1 : 0.5), s * 0.10, 0, 0, 7); ctx.fill()

    const flashing = l.invuln > 0 && Math.floor(l.invuln * 12) % 2 === 0
    const bw = s * 0.9 * l.sqX, bh = s * l.sqY, top = baseY - bh

    if (l.alive) {
      const lp = l.onGround ? Math.sin(t / 80 + l.phase) * s * 0.14 : 0
      ctx.fillStyle = CHAR_SHADOW[l.idx]
      roundRect(cx - bw * 0.24, baseY - s * 0.18 + lp, s * 0.2, s * 0.22, s * 0.08); ctx.fill()
      roundRect(cx + bw * 0.04, baseY - s * 0.18 - lp, s * 0.2, s * 0.22, s * 0.08); ctx.fill()
    }
    if (!flashing) {
      const bg = ctx.createLinearGradient(cx - bw / 2, top, cx + bw / 2, top + bh)
      bg.addColorStop(0, '#fff'); bg.addColorStop(0.25, CHAR_COLORS[l.idx]); bg.addColorStop(1, CHAR_SHADOW[l.idx])
      ctx.fillStyle = bg
    } else { ctx.fillStyle = '#fff' }
    roundRect(cx - bw / 2, top, bw, bh, bw * 0.42); ctx.fill()
    if (!flashing) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; roundRect(cx - bw * 0.35, top + bh * 0.1, bw * 0.28, bh * 0.25, bw * 0.12); ctx.fill() }

    const eyeY = top + bh * 0.38, er = s * 0.11
    if (l.alive && l.blink <= 0) {
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(cx - bw * 0.17, eyeY, er, 0, 7); ctx.arc(cx + bw * 0.17, eyeY, er, 0, 7); ctx.fill()
      ctx.fillStyle = '#1a1a2e'
      ctx.beginPath(); ctx.arc(cx - bw * 0.14, eyeY, er * 0.52, 0, 7); ctx.arc(cx + bw * 0.20, eyeY, er * 0.52, 0, 7); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(cx - bw * 0.11, eyeY - er * 0.35, er * 0.22, 0, 7); ctx.arc(cx + bw * 0.23, eyeY - er * 0.35, er * 0.22, 0, 7); ctx.fill()
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
    ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = s * 0.04; ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(cx, top + bh * 0.62, s * 0.13, l.alive ? 0.1 * Math.PI : 1.1 * Math.PI, l.alive ? 0.9 * Math.PI : 1.9 * Math.PI)
    ctx.stroke()
    if (l.alive) {
      ctx.fillStyle = CHAR_SHADOW[l.idx]; roundRect(cx - bw * 0.38, top - bh * 0.12, bw * 0.76, bh * 0.14, bh * 0.06); ctx.fill()
      ctx.fillStyle = CHAR_COLORS[l.idx]; roundRect(cx - bw * 0.24, top - bh * 0.38, bw * 0.48, bh * 0.30, bh * 0.10); ctx.fill()
    }
    // dodge direction arrow
    if (Math.abs(l.xSmooth) > 0.15) {
      ctx.save(); ctx.globalAlpha = Math.min(1, Math.abs(l.xSmooth)) * 0.7
      ctx.fillStyle = '#74C7EC'
      const dir = l.xSmooth > 0 ? 1 : -1, ax = cx + dir * bw * 0.9, ay = top + bh * 0.5
      ctx.beginPath()
      ctx.moveTo(ax + dir * s * 0.3, ay)
      ctx.lineTo(ax, ay - s * 0.18); ctx.lineTo(ax, ay + s * 0.18); ctx.closePath(); ctx.fill()
      ctx.restore()
    }
  }

  function drawParticles(l: Lane) {
    for (const p of l.particles) {
      ctx.save(); ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.life / p.maxLife), 0, 7); ctx.fill(); ctx.restore()
    }
  }

  function drawFloatTexts(l: Lane) {
    for (const f of l.floatTexts) {
      ctx.save(); ctx.globalAlpha = f.life / f.maxLife
      ctx.font = `bold ${f.size}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = f.size * 0.12
      ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y)
      ctx.restore()
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  function drawLaneUI(l: Lane) {
    const cx = l.center
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = Math.max(2, H * 0.006)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.floor(H * 0.065)}px Jua, sans-serif`
    const sc = String(Math.floor(l.score))
    ctx.strokeText(sc, cx, H * 0.075); ctx.fillText(sc, cx, H * 0.075)
    if (l.combo >= 2) {
      const mul = Math.max(1, Math.floor(l.combo / 3))
      ctx.fillStyle = mul >= 2 ? '#FFD700' : '#FFB0C8'
      ctx.font = `bold ${Math.floor(H * 0.036)}px Jua, sans-serif`
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

    drawBackground(l); drawRoad(l); drawSpeedLines(l)

    const items: { z: number; kind: 'ob' | 'star'; ref: Obstacle | Star }[] = []
    for (const o of l.obstacles) items.push({ z: o.z, kind: 'ob', ref: o })
    for (const s of l.stars)     items.push({ z: s.z, kind: 'star', ref: s })
    items.sort((a, b) => b.z - a.z)
    for (const it of items) {
      const pr = proj(it.z)
      if (it.kind === 'ob') drawObstacle(l, it.ref as Obstacle, pr)
      else drawStar(l, it.ref as Star, l.center, pr)
    }

    const charX = l.center + xSlotPx(l, l.xSmooth)
    drawChar(l, charX)
    drawParticles(l); drawFloatTexts(l); drawLaneUI(l)
    ctx.restore()
  }

  function drawDividers() {
    if (playerCount < 2) return
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = Math.max(3, W * 0.004)
    ctx.setLineDash([12, 10])
    for (let i = 1; i < playerCount; i++) {
      ctx.beginPath(); ctx.moveTo(i * (W / playerCount), 0); ctx.lineTo(i * (W / playerCount), H); ctx.stroke()
    }
    ctx.setLineDash([])
  }

  function button(x: number, y: number, w: number, h: number, label: string, color: string, action: string, data?: number) {
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(x + 3, y + 5, w, h, h * 0.28); ctx.fill()
    roundRect(x, y, w, h, h * 0.28); ctx.fillStyle = color; ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; roundRect(x + h * 0.08, y + h * 0.1, w - h * 0.16, h * 0.4, h * 0.2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.floor(h * 0.42)}px Jua, sans-serif`
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 4
    ctx.fillText(label, x + w / 2, y + h / 2); ctx.restore()
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    uiButtons.push({ x, y, w, h, action, data })
  }

  function drawMenu() {
    if (lanes.length) { for (const l of lanes) drawLaneScene(l); drawDividers() }
    else { ctx.fillStyle = '#5EC8FF'; ctx.fillRect(0, 0, W, H) }
    ctx.fillStyle = 'rgba(20,10,40,0.60)'; ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const bob = Math.sin(performance.now() / 320) * H * 0.012
    ctx.save(); ctx.shadowColor = '#FF8FAB'; ctx.shadowBlur = 30
    ctx.fillStyle = '#FFE0EC'; ctx.strokeStyle = 'rgba(180,50,100,0.5)'; ctx.lineWidth = H * 0.008
    ctx.font = `bold ${Math.floor(H * 0.13)}px Jua, sans-serif`
    ctx.strokeText('달려라!', W / 2, H * 0.2 + bob); ctx.fillText('달려라!', W / 2, H * 0.2 + bob); ctx.restore()
    ctx.font = `${Math.floor(H * 0.038)}px Jua, sans-serif`; ctx.fillStyle = '#FFE0EC'
    ctx.fillText('별★ 먹으면 UP! 더블점프 가능!', W / 2, H * 0.30)
    ctx.fillStyle = '#C8EEFF'
    ctx.fillText('좌우 스와이프로 피하기!', W / 2, H * 0.37)
    ctx.fillStyle = 'rgba(200,200,200,0.8)'; ctx.font = `${Math.floor(H * 0.030)}px Jua, sans-serif`
    ctx.fillText('박쥐는 낮게 날 때 점프! / 호박은 바닥에 닿을 때 점프! / 보라 크리스탈 주의!', W / 2, H * 0.44)
    ctx.fillStyle = '#C8EEFF'; ctx.font = `${Math.floor(H * 0.038)}px Jua, sans-serif`
    ctx.fillText('몇 명이서 달릴까?', W / 2, H * 0.52)
    uiButtons = []
    const bw = Math.min(W * 0.2, H * 0.22), bh = bw * 0.65, gap = W * 0.025
    const totalW = bw * 4 + gap * 3; let bx = (W - totalW) / 2
    for (let i = 0; i < 4; i++) { button(bx, H * 0.60, bw, bh, ['혼자', '2명', '3명', '4명'][i], CHAR_SHADOW[i], 'start', i + 1); bx += bw + gap }
    ctx.fillStyle = '#FFD700'; ctx.font = `bold ${Math.floor(H * 0.042)}px Jua, sans-serif`
    ctx.fillText('🏆 최고 점수: ' + bestSolo, W / 2, H * 0.80)
    ctx.fillStyle = 'rgba(200,220,255,0.7)'; ctx.font = `${Math.floor(H * 0.026)}px Jua, sans-serif`
    ctx.fillText('PC: Space/숫자 점프 · A/D 또는 ←/→ 회피', W / 2, H * 0.88)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  function drawOver() {
    for (const l of lanes) drawLaneScene(l); drawDividers()
    ctx.fillStyle = 'rgba(10,5,30,0.62)'; ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.save(); ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 24
    ctx.fillStyle = '#FFE0EC'; ctx.font = `bold ${Math.floor(H * 0.1)}px Jua, sans-serif`
    ctx.fillText('결과!', W / 2, H * 0.15); ctx.restore()
    const scores = lanes.map(l => ({ i: l.idx, s: Math.floor(l.score), c: CHAR_COLORS[l.idx] }))
    const best = Math.max(...scores.map(o => o.s))
    ctx.font = `bold ${Math.floor(H * 0.052)}px Jua, sans-serif`
    scores.forEach((o, k) => {
      ctx.save(); ctx.shadowColor = o.c; ctx.shadowBlur = 8; ctx.fillStyle = o.c
      ctx.fillText((playerCount > 1 ? (o.i + 1) + 'P : ' : '') + o.s + '점' + (o.s === best && playerCount > 1 ? '  🥇' : ''), W / 2, H * 0.30 + k * H * 0.085)
      ctx.restore()
    })
    if (playerCount === 1) {
      const isNew = Math.floor(lanes[0].score) >= bestSolo
      ctx.fillStyle = '#FFD700'; ctx.font = `bold ${Math.floor(H * 0.042)}px Jua, sans-serif`
      ctx.fillText((isNew ? '🎉 신기록! ' : '🏆 최고 점수: ') + bestSolo, W / 2, H * 0.68)
    }
    uiButtons = []
    const bw = Math.min(W * 0.3, H * 0.32), bh = bw * 0.38, gap = W * 0.03
    const totalW = bw * 2 + gap; let bx = (W - totalW) / 2
    button(bx, H * 0.77, bw, bh, '또 하기 ▶', '#E8507A', 'again'); bx += bw + gap
    button(bx, H * 0.77, bw, bh, '처음으로', '#4BA6D4', 'menu')
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  let last = performance.now(), animId: number

  function loop(now: number) {
    let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05
    update(dt)
    ctx.clearRect(0, 0, W, H)
    if (state === 'playing') { for (const l of lanes) drawLaneScene(l); drawDividers() }
    else if (state === 'menu') drawMenu()
    else drawOver()
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

  type Touch = { startX: number; startY: number; t: number; lane: number }
  const touches = new Map<number, Touch>()

  const handlePointerDown = (e: PointerEvent) => {
    e.preventDefault(); initAudio()
    const r = canvas.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    if (state !== 'playing') { hitUI(x, y); return }
    touches.set(e.pointerId, { startX: x, startY: y, t: e.timeStamp, lane: laneAt(x) })
  }

  const handlePointerUp = (e: PointerEvent) => {
    const touch = touches.get(e.pointerId); touches.delete(e.pointerId)
    if (!touch || state !== 'playing') return
    const r = canvas.getBoundingClientRect()
    const ex = e.clientX - r.left
    const dx = ex - touch.startX, dt_ms = e.timeStamp - touch.t
    if (Math.abs(dx) > 32 && dt_ms < 380) {
      doDodge(touch.lane, dx > 0 ? 1 : -1)
    } else if (Math.abs(dx) < 22 && dt_ms < 280) {
      doJump(touch.lane)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (state !== 'playing') return
    if (e.code === 'Space') { e.preventDefault(); doJump(0) }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') doDodge(0, -1)
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') doDodge(0, 1)
    else if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5)) - 1
      if (n >= 0 && n < playerCount) doJump(n)
    }
  }

  canvas.addEventListener('pointerdown', handlePointerDown, { passive: false })
  canvas.addEventListener('pointerup', handlePointerUp)
  canvas.addEventListener('pointercancel', e => touches.delete(e.pointerId))
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', resize)

  resize()
  animId = requestAnimationFrame(loop)

  return () => {
    cancelAnimationFrame(animId)
    canvas.removeEventListener('pointerdown', handlePointerDown)
    canvas.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('resize', resize)
  }
}
