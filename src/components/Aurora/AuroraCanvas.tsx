import React, { useEffect, useRef } from 'react'

interface AuroraCanvasProps {
  active: boolean
}

interface Star {
  x: number
  y: number
  size: number
  baseAlpha: number
  twinkleSpeed: number
  twinkleOffset: number
}

interface ShootingStar {
  x: number
  y: number
  speed: number
  angle: number
  length: number
  thickness: number
  opacity: number
  color: string
  tailColor: string
  active: boolean
  delay: number
}

interface StardustParticle {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  decay: number
  color: string
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

    // Resize handler
    const handleResize = () => {
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    // ---------------- BACKGROUND TWINKLING STARS ----------------
    const stars: Star[] = []
    const STAR_COUNT = 160
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() < 0.85 ? Math.random() * 1.2 + 0.5 : Math.random() * 2.2 + 1.2,
        baseAlpha: Math.random() * 0.5 + 0.25,
        twinkleSpeed: Math.random() * 0.03 + 0.01,
        twinkleOffset: Math.random() * Math.PI * 2,
      })
    }

    // ---------------- CONTINUOUS FALLING SHOOTING STARS ----------------
    // Meteors with glowing heads, long fading trails, and lingering stardust
    const SHOOTING_STAR_COUNT = 9
    const shootingStars: ShootingStar[] = []
    const stardust: StardustParticle[] = []

    const STAR_COLORS = [
      { head: '#ffffff', tail: 'rgba(56, 189, 248, ' },   // Ice Blue Trail
      { head: '#ffffff', tail: 'rgba(52, 211, 153, ' },   // Emerald Mint Trail
      { head: '#fffbe8', tail: 'rgba(251, 191, 36, ' },   // Starlight Gold Trail
      { head: '#ffffff', tail: 'rgba(192, 132, 252, ' },  // Violet Ray Trail
      { head: '#ffffff', tail: 'rgba(0, 242, 254, ' },    // Neon Cyan Trail
    ]

    const initShootingStar = (idx: number, isInitial = false): ShootingStar => {
      const palette = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]
      const angle = (Math.PI / 180) * (48 + Math.random() * 14) // 48 - 62 degrees downward angle
      const speed = Math.random() * 12 + 10 // Rapid, fluid shooting speed
      const length = Math.random() * 130 + 90 // Generous tail length for visible back-falling trail

      return {
        x: Math.random() * (window.innerWidth * 1.3) - window.innerWidth * 0.15,
        y: isInitial ? Math.random() * (window.innerHeight * 0.6) - 100 : -Math.random() * 250 - 50,
        speed,
        angle,
        length,
        thickness: Math.random() * 1.6 + 1.2,
        opacity: Math.random() * 0.4 + 0.6,
        color: palette.head,
        tailColor: palette.tail,
        active: true,
        delay: isInitial ? idx * 25 : Math.random() * 120 + 20,
      }
    }

    for (let i = 0; i < SHOOTING_STAR_COUNT; i++) {
      shootingStars.push(initShootingStar(i, true))
    }

    // ---------------- AURORA CURTAINS: 24+ CONTINUOUS MULTI-SPECTRAL COLORS ----------------
    // Rich gradient ribbons representing the full atmospheric ionization spectrum:
    // Nitrogen purples, ionized oxygen greens, celestial cyans, and deep cosmic dark bedrock
    const AURORA_RIBBONS = [
      {
        baseY: 0.18,
        amplitude: 65,
        frequency: 0.0018,
        speed: 0.008,
        height: 0.48,
        colors: [
          'rgba(0, 255, 135, 0.42)',   // #00FF87 (Neon Green)
          'rgba(16, 185, 129, 0.35)',  // #10B981 (Emerald Glow)
          'rgba(6, 182, 212, 0.32)',   // #06B6D4 (Turquoise)
          'rgba(0, 242, 254, 0.28)',   // #00F2FE (Cyan Ion)
          'rgba(124, 58, 237, 0.25)',  // #7C3AED (Cosmic Violet)
          'rgba(217, 70, 239, 0.20)',  // #D946EF (Neon Fuchsia)
        ],
      },
      {
        baseY: 0.28,
        amplitude: 85,
        frequency: 0.0014,
        speed: 0.0065,
        height: 0.52,
        colors: [
          'rgba(52, 211, 153, 0.38)',  // #34D399 (Mint Corona)
          'rgba(56, 189, 248, 0.34)',  // #38BDF8 (Glacial Sky Blue)
          'rgba(37, 99, 235, 0.28)',   // #2563EB (Sapphire Ray)
          'rgba(147, 51, 234, 0.32)',  // #9333EA (Electric Purple)
          'rgba(236, 72, 153, 0.22)',  // #EC4899 (High-Altitude Pink)
          'rgba(251, 191, 36, 0.16)',  // #FBBF24 (Solar Gold Flare)
        ],
      },
      {
        baseY: 0.38,
        amplitude: 70,
        frequency: 0.0022,
        speed: 0.009,
        height: 0.45,
        colors: [
          'rgba(139, 92, 246, 0.30)',  // #8B5CF6 (Royal Violet)
          'rgba(192, 132, 252, 0.26)', // #C084FC (Radiant Orchid)
          'rgba(74, 222, 128, 0.30)',  // #4ADE80 (Spring Green)
          'rgba(5, 150, 105, 0.25)',   // #059669 (Deep Jade)
          'rgba(30, 58, 138, 0.25)',   // #1E3A8A (Deep Twilight Abyss)
          'rgba(244, 63, 94, 0.18)',   // #F43F5E (Solar Rose)
        ],
      },
    ]

    let time = 0

    // ---------------- MAIN ANIMATION LOOP ----------------
    const render = () => {
      if (isDisposed || !ctx || !canvas) return
      time += 1

      const w = canvas.width
      const h = canvas.height

      // 1. Render Deep Cosmic Space Dark Bedrock (incorporating dark theme colors)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h)
      skyGrad.addColorStop(0, '#030208')     // Deepest Space Obsidian
      skyGrad.addColorStop(0.35, '#060416')  // Dark Void Navy
      skyGrad.addColorStop(0.7, '#080520')   // Cosmic Amethyst Midnight
      skyGrad.addColorStop(1, '#020106')     // Ground Horizon Shadow
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, w, h)

      // 2. Render Twinkling Background Stars
      ctx.save()
      for (const star of stars) {
        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset)
        const alpha = Math.max(0.1, Math.min(1.0, star.baseAlpha + twinkle * 0.35))
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
        ctx.beginPath()
        ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // 3. Render Floating Waving Aurora Curtains (Additive Light Blend)
      ctx.save()
      ctx.globalCompositeOperation = 'screen'

      AURORA_RIBBONS.forEach((ribbon, rIdx) => {
        const segments = 45
        const segWidth = w / segments
        const ribbonTime = time * ribbon.speed + rIdx * 1.5

        ctx.beginPath()
        ctx.moveTo(0, h)

        // Wave top curve
        for (let i = 0; i <= segments; i++) {
          const x = i * segWidth
          const wave1 = Math.sin(x * ribbon.frequency + ribbonTime) * ribbon.amplitude
          const wave2 = Math.cos(x * (ribbon.frequency * 1.8) - ribbonTime * 0.8) * (ribbon.amplitude * 0.45)
          const wave3 = Math.sin(x * (ribbon.frequency * 3.2) + ribbonTime * 1.2) * (ribbon.amplitude * 0.25)
          const y = h * ribbon.baseY + wave1 + wave2 + wave3

          if (i === 0) ctx.lineTo(x, y)
          else ctx.lineTo(x, y)
        }

        ctx.lineTo(w, h)
        ctx.closePath()

        // Multi-color vertical linear gradient for this curtain
        const ribbonGrad = ctx.createLinearGradient(0, h * (ribbon.baseY - 0.1), 0, h * (ribbon.baseY + ribbon.height))
        ribbon.colors.forEach((colorStop, cIdx) => {
          ribbonGrad.addColorStop(cIdx / (ribbon.colors.length - 1), colorStop)
        })

        ctx.fillStyle = ribbonGrad
        ctx.fill()
      })
      ctx.restore()

      // 4. Update & Render Stardust Embers from Falling Stars
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      for (let i = stardust.length - 1; i >= 0; i--) {
        const p = stardust[i]
        p.x += p.vx
        p.y += p.vy
        p.alpha -= p.decay

        if (p.alpha <= 0) {
          stardust.splice(i, 1)
          continue
        }

        ctx.fillStyle = p.color.replace('{A}', String(p.alpha))
        ctx.beginPath()
        ctx.arc(p.x, p.y, Math.random() * 1.2 + 0.8, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // 5. Update & Render Falling Shooting Stars with Luminous Back Trails
      ctx.save()
      ctx.globalCompositeOperation = 'screen'

      shootingStars.forEach((star, idx) => {
        if (star.delay > 0) {
          star.delay--
          return
        }

        // Move head along diagonal vector
        const dx = Math.cos(star.angle) * star.speed
        const dy = Math.sin(star.angle) * star.speed
        star.x += dx
        star.y += dy

        // Spawn occasional glowing stardust particles along the tail
        if (Math.random() < 0.4) {
          stardust.push({
            x: star.x - dx * (Math.random() * 1.5),
            y: star.y - dy * (Math.random() * 1.5),
            vx: (Math.random() - 0.5) * 0.8,
            vy: (Math.random() - 0.5) * 0.8,
            alpha: star.opacity * 0.7,
            decay: Math.random() * 0.03 + 0.02,
            color: star.tailColor + '{A})',
          })
        }

        // Tail coordinates (pointing backward along trajectory)
        const tailX = star.x - Math.cos(star.angle) * star.length
        const tailY = star.y - Math.sin(star.angle) * star.length

        // Multi-stop trail gradient: glowing white head -> vibrant tint -> fading tail
        const tailGrad = ctx.createLinearGradient(star.x, star.y, tailX, tailY)
        tailGrad.addColorStop(0, `rgba(255, 255, 255, ${star.opacity})`)
        tailGrad.addColorStop(0.18, `${star.tailColor}${star.opacity * 0.85})`)
        tailGrad.addColorStop(0.55, `${star.tailColor}${star.opacity * 0.45})`)
        tailGrad.addColorStop(1, `${star.tailColor}0)`)

        // Draw luminous tapered trailing tail
        ctx.strokeStyle = tailGrad
        ctx.lineWidth = star.thickness
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(star.x, star.y)
        ctx.lineTo(tailX, tailY)
        ctx.stroke()

        // Draw brilliant glowing head with halo
        const haloRadius = star.thickness * 4.5
        const headGrad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, haloRadius)
        headGrad.addColorStop(0, '#ffffff')
        headGrad.addColorStop(0.35, `${star.tailColor}${star.opacity * 0.9})`)
        headGrad.addColorStop(1, `${star.tailColor}0)`)

        ctx.fillStyle = headGrad
        ctx.beginPath()
        ctx.arc(star.x, star.y, haloRadius, 0, Math.PI * 2)
        ctx.fill()

        // Recycle star once it travels past screen bounds
        if (star.y > h + 150 || star.x > w + 200 || star.x < -200) {
          shootingStars[idx] = initShootingStar(idx, false)
        }
      })

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
