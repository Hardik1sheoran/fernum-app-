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
  stardust: Array<{ x: number; y: number; vx: number; vy: number; alpha: number; decay: number; size: number }>
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

    // ---------------- 1. MIDNIGHT TWINKLING STARFIELD ----------------
    const stars: TwinkleStar[] = []
    const STAR_COUNT = 240
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() < 0.84 ? Math.random() * 1.1 + 0.35 : Math.random() * 1.8 + 1.2,
        baseAlpha: Math.random() * 0.55 + 0.3,
        twinkleSpeed: Math.random() * 0.045 + 0.015,
        twinklePhase: Math.random() * Math.PI * 2,
        hasSpikes: Math.random() < 0.1,
      })
    }

    // ---------------- 2. CONTINUOUS FALLING SHOOTING STARS / METEORS ----------------
    const METEOR_COUNT = 15
    const meteors: Meteor[] = []

    const METEOR_PALETTES = [
      { head: '#ffffff', rgb: '255, 255, 255' },    // Pure White Starlight
      { head: '#f0f9ff', rgb: '186, 230, 253' },    // Soft Glacial Starlight
      { head: '#faf5ff', rgb: '216, 180, 254' },    // Midnight Lilac Glow
      { head: '#f0fdf4', rgb: '167, 243, 208' },    // Polar Starlight Mint
    ]

    const createMeteor = (isInitial = false): Meteor => {
      const palette = METEOR_PALETTES[Math.floor(Math.random() * METEOR_PALETTES.length)]
      // Falling diagonally across the midnight sky (50° - 62° from horizontal)
      const angle = (Math.PI / 180) * (52 + Math.random() * 10)
      const speed = Math.random() * 8.5 + 7.0 // Graceful falling velocity
      const length = Math.random() * 150 + 95 // Long luminous trailing back-fall tail

      // Spawn across the top and upper regions
      const startX = Math.random() * (width * 1.35) - width * 0.15
      const startY = isInitial ? Math.random() * (height * 0.85) - 60 : -Math.random() * 160 - 30

      return {
        x: startX,
        y: startY,
        speed,
        angle,
        length,
        thickness: Math.random() * 1.6 + 1.2,
        opacity: Math.random() * 0.35 + 0.65,
        headColor: palette.head,
        tailColorRgb: palette.rgb,
        stardust: [],
      }
    }

    for (let i = 0; i < METEOR_COUNT; i++) {
      meteors.push(createMeteor(true))
    }

    // ---------------- 3. SERENE MIDNIGHT POLAR GLOW ----------------
    let time = 0

    const render = () => {
      if (isDisposed || !ctx || !canvas) return
      time += 0.016

      // 1. Deep Midnight Cosmic Sky Background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height)
      skyGrad.addColorStop(0, '#010006')     // Pure Midnight Velvet Space
      skyGrad.addColorStop(0.35, '#030112')  // Deep Midnight Void
      skyGrad.addColorStop(0.7, '#06021c')   // Midnight Polar Horizon
      skyGrad.addColorStop(1, '#020008')     // Lower Ground Void
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, width, height)

      // 2. Midnight Starfield with Rich Twinkling
      ctx.save()
      for (const s of stars) {
        const twinkle = Math.sin(time * 3.6 * s.twinkleSpeed * 20 + s.twinklePhase)
        const alpha = Math.max(0.12, Math.min(1.0, s.baseAlpha + twinkle * 0.45))

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
        ctx.fill()

        // 4-point diffraction spike on prominent stars
        if (s.hasSpikes && alpha > 0.62) {
          ctx.strokeStyle = `rgba(224, 231, 255, ${alpha * 0.45})`
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

      // 3. Majestic Aurora Borealis Ribbons (Luminous Polar Emerald, Cyan & Violet Multi-color Spectacle)
      ctx.save()
      ctx.globalCompositeOperation = 'screen'

      // Curtain 1: Upper Celestial Violet & Hot Magenta Crown
      drawAuroraCurtain(
        ctx,
        width,
        height * 0.05,
        height * 0.35,
        time * 0.28,
        0.0016,
        60,
        [
          { stop: 0.0, color: 'rgba(147, 51, 234, 0.0)' },
          { stop: 0.35, color: 'rgba(168, 85, 247, 0.45)' },
          { stop: 0.7, color: 'rgba(236, 72, 153, 0.38)' },
          { stop: 1.0, color: 'rgba(147, 51, 234, 0.0)' },
        ]
      )

      // Curtain 2: Radiant Polar Emerald Wave (Main Aurora Belt - Pure Glowing Green)
      drawAuroraCurtain(
        ctx,
        width,
        height * 0.16,
        height * 0.45,
        time * 0.38 + 1.2,
        0.0020,
        80,
        [
          { stop: 0.0, color: 'rgba(0, 255, 135, 0.0)' },
          { stop: 0.3, color: 'rgba(0, 255, 140, 0.72)' },
          { stop: 0.65, color: 'rgba(5, 240, 175, 0.55)' },
          { stop: 1.0, color: 'rgba(0, 255, 135, 0.0)' },
        ],
        true,
        time
      )

      // Curtain 3: Luminous Arctic Electric Cyan-Turquoise Streamer
      drawAuroraCurtain(
        ctx,
        width,
        height * 0.30,
        height * 0.42,
        time * 0.46 + 2.8,
        0.0026,
        70,
        [
          { stop: 0.0, color: 'rgba(0, 240, 255, 0.0)' },
          { stop: 0.35, color: 'rgba(0, 240, 255, 0.62)' },
          { stop: 0.7, color: 'rgba(56, 189, 248, 0.45)' },
          { stop: 1.0, color: 'rgba(6, 182, 212, 0.0)' },
        ],
        true,
        time + 1.5
      )

      // Curtain 4: Mid Polar Emerald & Cyan Veil (Illuminates center of screen)
      drawAuroraCurtain(
        ctx,
        width,
        height * 0.45,
        height * 0.38,
        time * 0.34 + 4.1,
        0.0022,
        60,
        [
          { stop: 0.0, color: 'rgba(0, 255, 140, 0.0)' },
          { stop: 0.45, color: 'rgba(16, 240, 150, 0.48)' },
          { stop: 0.75, color: 'rgba(6, 182, 212, 0.35)' },
          { stop: 1.0, color: 'rgba(0, 255, 140, 0.0)' },
        ]
      )

      // Curtain 5: Lower Polar Emerald Shimmer (Illuminates lower screen)
      drawAuroraCurtain(
        ctx,
        width,
        height * 0.60,
        height * 0.35,
        time * 0.26 + 5.3,
        0.0018,
        50,
        [
          { stop: 0.0, color: 'rgba(0, 255, 135, 0.0)' },
          { stop: 0.5, color: 'rgba(0, 255, 135, 0.32)' },
          { stop: 1.0, color: 'rgba(0, 255, 135, 0.0)' },
        ]
      )

      ctx.restore()

      // 4. Continuously Falling Stars with Luminous Back Trails & Stardust
      ctx.save()
      ctx.globalCompositeOperation = 'screen'

      for (let i = 0; i < meteors.length; i++) {
        const m = meteors[i]

        // Move head forward along diagonal trajectory
        const vx = Math.cos(m.angle) * m.speed
        const vy = Math.sin(m.angle) * m.speed
        m.x += vx
        m.y += vy

        // Spawn glittering stardust particles along the back trail
        if (Math.random() < 0.55) {
          m.stardust.push({
            x: m.x - vx * (Math.random() * 2),
            y: m.y - vy * (Math.random() * 2),
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            alpha: m.opacity * 0.85,
            decay: Math.random() * 0.035 + 0.02,
            size: Math.random() * 1.2 + 0.6,
          })
        }

        // Render lingering stardust embers drifting behind
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
          ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2)
          ctx.fill()
        }

        // Compute tail endpoint trailing behind the head
        const tailX = m.x - Math.cos(m.angle) * m.length
        const tailY = m.y - Math.sin(m.angle) * m.length

        // Long luminous back-falling trail gradient
        const trailGrad = ctx.createLinearGradient(m.x, m.y, tailX, tailY)
        trailGrad.addColorStop(0, `rgba(255, 255, 255, ${m.opacity})`)
        trailGrad.addColorStop(0.15, `rgba(${m.tailColorRgb}, ${m.opacity * 0.9})`)
        trailGrad.addColorStop(0.5, `rgba(${m.tailColorRgb}, ${m.opacity * 0.45})`)
        trailGrad.addColorStop(0.85, `rgba(${m.tailColorRgb}, ${m.opacity * 0.12})`)
        trailGrad.addColorStop(1, `rgba(${m.tailColorRgb}, 0)`)

        ctx.strokeStyle = trailGrad
        ctx.lineWidth = m.thickness
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(tailX, tailY)
        ctx.stroke()

        // Brilliant glowing meteor head with radiant halo
        const halo = m.thickness * 4.2
        const headGrad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, halo)
        headGrad.addColorStop(0, '#ffffff')
        headGrad.addColorStop(0.35, `rgba(${m.tailColorRgb}, ${m.opacity * 0.85})`)
        headGrad.addColorStop(1, `rgba(${m.tailColorRgb}, 0)`)

        ctx.fillStyle = headGrad
        ctx.beginPath()
        ctx.arc(m.x, m.y, halo, 0, Math.PI * 2)
        ctx.fill()

        // Respawn immediately once out of view so shooting star shower is continuous
        if (m.y > height + 120 || m.x > width + 150 || m.x < -150) {
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
 * Draws an organic waving aurora curtain ribbon with optional vertical ray striations
 */
function drawAuroraCurtain(
  ctx: CanvasRenderingContext2D,
  w: number,
  baseY: number,
  bandHeight: number,
  timeVal: number,
  freq: number,
  amp: number,
  colorStops: Array<{ stop: number; color: string }>,
  renderRays: boolean = false,
  rayTime: number = 0
) {
  const steps = 44
  const dx = w / steps

  ctx.beginPath()
  // Top wavy edge
  for (let i = 0; i <= steps; i++) {
    const x = i * dx
    const wave1 = Math.sin(x * freq + timeVal) * amp
    const wave2 = Math.cos(x * (freq * 1.5) - timeVal * 0.6) * (amp * 0.35)
    const y = baseY + wave1 + wave2
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }

  // Bottom wavy edge
  for (let i = steps; i >= 0; i--) {
    const x = i * dx
    const wave1 = Math.sin(x * freq + timeVal + 0.7) * amp
    const wave2 = Math.cos(x * (freq * 1.5) - timeVal * 0.6 + 0.7) * (amp * 0.35)
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

  // Optional vertical shimmering rays/light pillars (signature Northern Lights feature)
  if (renderRays) {
    ctx.save()
    const rayCount = 18
    const rayWidth = w / rayCount
    for (let j = 0; j < rayCount; j++) {
      const rx = j * rayWidth + (Math.sin(j * 1.3 + rayTime * 1.2) * rayWidth * 0.3)
      const rayAlpha = Math.max(0, Math.sin(j * 0.9 + rayTime * 2.2) * 0.18 + 0.08)
      if (rayAlpha <= 0.02) continue

      const rayTop = baseY - amp * 0.8
      const rayBottom = baseY + bandHeight + amp * 1.2
      const rayGrad = ctx.createLinearGradient(rx, rayTop, rx, rayBottom)
      rayGrad.addColorStop(0, 'rgba(0, 255, 140, 0)')
      rayGrad.addColorStop(0.35, `rgba(0, 255, 140, ${rayAlpha})`)
      rayGrad.addColorStop(0.7, `rgba(56, 189, 248, ${rayAlpha * 0.8})`)
      rayGrad.addColorStop(1, 'rgba(6, 182, 212, 0)')

      ctx.fillStyle = rayGrad
      ctx.fillRect(rx - 8, rayTop, 16, rayBottom - rayTop)
    }
    ctx.restore()
  }
}
