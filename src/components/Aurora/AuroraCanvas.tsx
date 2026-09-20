import React, { useEffect, useRef } from 'react'

interface AuroraCanvasProps {
  active: boolean
}

interface TwinkleStar {
  x: number
  y: number
  radius: number
  baseAlpha: number
  twinkleSpeed: number
  twinklePhase: number
  hasSpikes: boolean
}

interface Meteor {
  x: number
  y: number
  speed: number
  angle: number
  length: number
  thickness: number
  opacity: number
  headColor: string
  tailColorRgb: string
  stardust: Array<{ x: number; y: number; vx: number; vy: number; alpha: number; decay: number }>
}

export const AuroraCanvas: React.FC<AuroraCanvasProps> = ({ active }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameId = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      if (animFrameId.current) {
        cancelAnimationFrame(animFrameId.current)
        animFrameId.current = null
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let isDisposed = false
    let width = window.innerWidth
    let height = window.innerHeight

    const handleResize = () => {
      if (!canvas) return
      width = window.innerWidth
      height = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    // ---------------- 1. BACKGROUND TWINKLING STARS ----------------
    const stars: TwinkleStar[] = []
    const STAR_COUNT = 180
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() < 0.8 ? Math.random() * 1.2 + 0.5 : Math.random() * 2.0 + 1.2,
        baseAlpha: Math.random() * 0.5 + 0.35,
        twinkleSpeed: Math.random() * 0.04 + 0.015,
        twinklePhase: Math.random() * Math.PI * 2,
        hasSpikes: Math.random() < 0.08,
      })
    }

    // ---------------- 2. CONTINUOUS FALLING SHOOTING STARS / METEORS ----------------
    // Authentic celestial shooting stars: bright heads, long luminous fading back-trails, and trailing ember dust
    const METEOR_COUNT = 12
    const meteors: Meteor[] = []

    const METEOR_PALETTES = [
      { head: '#ffffff', rgb: '255, 255, 255' },    // Pure Starlight White
      { head: '#e0f2fe', rgb: '56, 189, 248' },     // Glacial Ice Blue
      { head: '#f0fdf4', rgb: '52, 211, 153' },     // Emerald Mint
      { head: '#ecfeff', rgb: '6, 182, 212' },      // Polar Cyan
      { head: '#faf5ff', rgb: '192, 132, 252' },    // Cosmic Violet
    ]

    const createMeteor = (isInitial = false): Meteor => {
      const palette = METEOR_PALETTES[Math.floor(Math.random() * METEOR_PALETTES.length)]
      // Falling diagonally across the sky: 55° - 65° from horizontal
      const angle = (Math.PI / 180) * (58 + Math.random() * 10)
      const speed = Math.random() * 9 + 8 // Graceful, visible falling pace
      const length = Math.random() * 120 + 90 // Long, visible trailing tail

      // Spawn across the top and slightly to the right so they streak across
      const startX = Math.random() * (width * 1.25) - width * 0.1
      const startY = isInitial ? Math.random() * (height * 0.75) - 80 : -Math.random() * 150 - 40

      return {
        x: startX,
        y: startY,
        speed,
        angle,
        length,
        thickness: Math.random() * 1.8 + 1.2,
        opacity: Math.random() * 0.35 + 0.65,
        headColor: palette.head,
        tailColorRgb: palette.rgb,
        stardust: [],
      }
    }

    for (let i = 0; i < METEOR_COUNT; i++) {
      meteors.push(createMeteor(true))
    }

    // ---------------- 3. REAL AURORA BOREALIS (PURE POLAR EMERALD, CYAN & VIOLET) ----------------
    // NO rainbow, NO orange, NO yellow! Pure authentic polar curtain ribbons!
    let time = 0

    const render = () => {
      if (isDisposed || !ctx || !canvas) return
      time += 0.016

      // 1. Clear with Deep Cosmic Night Sky Gradient (Dark Obsidian Space)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height)
      skyGrad.addColorStop(0, '#020108')     // Pure Space Obsidian
      skyGrad.addColorStop(0.35, '#040312')  // Deepest Navy Void
      skyGrad.addColorStop(0.7, '#070520')   // Polar Midnight Indigo
      skyGrad.addColorStop(1, '#020107')     // Deep Ground Horizon
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, width, height)

      // 2. Render Twinkling Cosmic Starfield
      ctx.save()
      for (const s of stars) {
        const twinkle = Math.sin(time * 3.5 * s.twinkleSpeed * 20 + s.twinklePhase)
        const alpha = Math.max(0.15, Math.min(1.0, s.baseAlpha + twinkle * 0.4))

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
        ctx.fill()

        // Occasional diffraction spike for bright stars
        if (s.hasSpikes && alpha > 0.6) {
          ctx.strokeStyle = `rgba(224, 242, 254, ${alpha * 0.45})`
          ctx.lineWidth = 0.75
          ctx.beginPath()
          ctx.moveTo(s.x - s.radius * 3.5, s.y)
          ctx.lineTo(s.x + s.radius * 3.5, s.y)
          ctx.moveTo(s.x, s.y - s.radius * 3.5)
          ctx.lineTo(s.x, s.y + s.radius * 3.5)
          ctx.stroke()
        }
      }
      ctx.restore()

      // 3. Render Real Aurora Borealis Waving Curtains (Emerald, Cyan & Violet Rays)
      ctx.save()
      ctx.globalCompositeOperation = 'screen'

      // Layer 1: High-Altitude Atmospheric Violet/Indigo Shimmer
      drawAuroraCurtain(
        ctx,
        width,
        height * 0.15,
        height * 0.35,
        time * 0.35,
        0.002,
        60,
        [
          { stop: 0.0, color: 'rgba(124, 58, 237, 0.0)' },
          { stop: 0.4, color: 'rgba(139, 92, 246, 0.22)' }, // Violet
          { stop: 0.8, color: 'rgba(56, 189, 248, 0.18)' },  // Glacial Blue
          { stop: 1.0, color: 'rgba(16, 185, 129, 0.0)' },
        ]
      )

      // Layer 2: Iconic Polar Emerald Oxygen Curtain (The signature Green Aurora)
      drawAuroraCurtain(
        ctx,
        width,
        height * 0.22,
        height * 0.42,
        time * 0.45 + 1.2,
        0.0025,
        85,
        [
          { stop: 0.0, color: 'rgba(0, 255, 127, 0.0)' },
          { stop: 0.3, color: 'rgba(0, 255, 135, 0.38)' },   // #00FF87 Neon Green
          { stop: 0.65, color: 'rgba(16, 185, 129, 0.32)' }, // Emerald
          { stop: 1.0, color: 'rgba(6, 182, 212, 0.0)' },
        ]
      )

      // Layer 3: Ionized Cyan & Turquoise Dancing Ribbons
      drawAuroraCurtain(
        ctx,
        width,
        height * 0.32,
        height * 0.38,
        time * 0.52 + 2.5,
        0.003,
        70,
        [
          { stop: 0.0, color: 'rgba(0, 242, 254, 0.0)' },
          { stop: 0.4, color: 'rgba(6, 182, 212, 0.32)' },   // Electric Cyan
          { stop: 0.7, color: 'rgba(52, 211, 153, 0.28)' },  // Mint Aurora
          { stop: 1.0, color: 'rgba(37, 99, 235, 0.0)' },
        ]
      )

      ctx.restore()

      // 4. Update & Render Continuous Falling Stars with Luminous Back Trails
      ctx.save()
      ctx.globalCompositeOperation = 'screen'

      for (let i = 0; i < meteors.length; i++) {
        const m = meteors[i]

        // Move head forward
        const vx = Math.cos(m.angle) * m.speed
        const vy = Math.sin(m.angle) * m.speed
        m.x += vx
        m.y += vy

        // Spawn falling stardust sparks along the back-trail
        if (Math.random() < 0.5) {
          m.stardust.push({
            x: m.x - vx * (Math.random() * 2),
            y: m.y - vy * (Math.random() * 2),
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.6,
            alpha: m.opacity * 0.85,
            decay: Math.random() * 0.035 + 0.02,
          })
        }

        // Render lingering stardust embers
        for (let sIdx = m.stardust.length - 1; sIdx >= 0; sIdx--) {
          const spark = m.stardust[sIdx]
          spark.x += spark.vx
          spark.y += spark.vy
          spark.alpha -= spark.decay
          if (spark.alpha <= 0) {
            m.stardust.splice(sIdx, 1)
            continue
          }
          ctx.fillStyle = `rgba(${m.tailColorRgb}, ${spark.alpha})`
          ctx.beginPath()
          ctx.arc(spark.x, spark.y, Math.random() * 1.2 + 0.6, 0, Math.PI * 2)
          ctx.fill()
        }

        // Calculate tail endpoint trailing behind the head
        const tailX = m.x - Math.cos(m.angle) * m.length
        const tailY = m.y - Math.sin(m.angle) * m.length

        // Luminous fading back-trail gradient: Glowing White Head -> Tinted Aurora Ray -> Transparent
        const trailGrad = ctx.createLinearGradient(m.x, m.y, tailX, tailY)
        trailGrad.addColorStop(0, `rgba(255, 255, 255, ${m.opacity})`)
        trailGrad.addColorStop(0.12, `rgba(${m.tailColorRgb}, ${m.opacity * 0.95})`)
        trailGrad.addColorStop(0.45, `rgba(${m.tailColorRgb}, ${m.opacity * 0.55})`)
        trailGrad.addColorStop(0.85, `rgba(${m.tailColorRgb}, ${m.opacity * 0.18})`)
        trailGrad.addColorStop(1, `rgba(${m.tailColorRgb}, 0)`)

        ctx.strokeStyle = trailGrad
        ctx.lineWidth = m.thickness
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(tailX, tailY)
        ctx.stroke()

        // Brilliant glowing meteor head with radiant halo
        const halo = m.thickness * 4.0
        const headGrad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, halo)
        headGrad.addColorStop(0, '#ffffff')
        headGrad.addColorStop(0.35, `rgba(${m.tailColorRgb}, ${m.opacity * 0.9})`)
        headGrad.addColorStop(1, `rgba(${m.tailColorRgb}, 0)`)

        ctx.fillStyle = headGrad
        ctx.beginPath()
        ctx.arc(m.x, m.y, halo, 0, Math.PI * 2)
        ctx.fill()

        // Respawn immediately once out of view so star shower never breaks
        if (m.y > height + 100 || m.x > width + 150 || m.x < -150) {
          meteors[i] = createMeteor(false)
        }
      }

      ctx.restore()

      animFrameId.current = requestAnimationFrame(render)
    }

    animFrameId.current = requestAnimationFrame(render)

    return () => {
      isDisposed = true
      window.removeEventListener('resize', handleResize)
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current)
    }
  }, [active])

  if (!active) return null

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover transition-opacity duration-700 ease-in-out"
        style={{ width: '100vw', height: '100vh', display: 'block' }}
      />
    </div>
  )
}

/**
 * Draws an organic sinusoidal waving aurora curtain ribbon with vertical ray lines
 */
function drawAuroraCurtain(
  ctx: CanvasRenderingContext2D,
  w: number,
  baseY: number,
  bandHeight: number,
  timeVal: number,
  freq: number,
  amp: number,
  colorStops: Array<{ stop: number; color: string }>
) {
  const steps = 40
  const dx = w / steps

  ctx.beginPath()
  // Top wavy edge
  for (let i = 0; i <= steps; i++) {
    const x = i * dx
    const wave1 = Math.sin(x * freq + timeVal) * amp
    const wave2 = Math.cos(x * (freq * 1.6) - timeVal * 0.7) * (amp * 0.4)
    const y = baseY + wave1 + wave2
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }

  // Bottom wavy edge
  for (let i = steps; i >= 0; i--) {
    const x = i * dx
    const wave1 = Math.sin(x * freq + timeVal + 0.8) * amp
    const wave2 = Math.cos(x * (freq * 1.6) - timeVal * 0.7 + 0.8) * (amp * 0.4)
    const y = baseY + bandHeight + wave1 + wave2
    ctx.lineTo(x, y)
  }
  ctx.closePath()

  const grad = ctx.createLinearGradient(0, baseY - amp, 0, baseY + bandHeight + amp)
  for (const cs of colorStops) {
    grad.addColorStop(cs.stop, cs.color)
  }
  ctx.fillStyle = grad
  ctx.fill()
}
