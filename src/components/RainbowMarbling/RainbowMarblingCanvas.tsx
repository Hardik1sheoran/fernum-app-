import React, { useEffect, useRef } from 'react'

interface RainbowMarblingCanvasProps {
  active: boolean
}

/**
 * Living Acrylic Pour & Liquid Paint Marbling Canvas
 * Faithfully reproduces the authentic fluid acrylic marbled painting:
 * - #E93E8F (Paint Magenta / Rose)
 * - #FF6A1C (Vibrant Fluid Orange)
 * - #FFD940 (Warm Golden Yellow)
 * - #44D46E (Lush Paint Green)
 * - #227BFF (Cobalt Blue)
 * with deep violet swirl transitions (#701A75).
 * Continuous, unbroken, organic fluid flow without neon glare.
 */
export const RainbowMarblingCanvas: React.FC<RainbowMarblingCanvasProps> = ({ active }) => {
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

    let gl: WebGLRenderingContext | null = null
    try {
      gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: true,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
      })
    } catch {
      gl = null
    }

    let isDisposed = false

    if (gl) {
      // ---------------- WEBGL FLUID ACRYLIC MARBLING ----------------
      const vsSource = `
        attribute vec2 a_position;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `

      const fsSource = `
        precision highp float;
        uniform vec2 u_resolution;
        uniform float u_time;

        // ULTRA-COLORFUL, HIGHLY SATURATED LIQUID PAINT PALETTE:
        const vec3 c_magenta = vec3(1.000, 0.000, 0.560); // Radiant Neon Magenta / Hot Rose
        const vec3 c_orange  = vec3(1.000, 0.380, 0.000); // Pure Vivid Solar Orange
        const vec3 c_yellow  = vec3(1.000, 0.940, 0.000); // Electric Golden Sun Yellow
        const vec3 c_green   = vec3(0.000, 0.960, 0.360); // Vivid Spring Emerald Green
        const vec3 c_cyan    = vec3(0.000, 0.900, 1.000); // Radiant Electric Turquoise Cyan
        const vec3 c_blue    = vec3(0.080, 0.420, 1.000); // Intense Deep Sapphire/Cobalt Blue
        const vec3 c_violet  = vec3(0.640, 0.040, 0.950); // Luminous Royal Violet

        // Hash function for procedural fluid noise
        vec2 hash2(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
        }

        // 2D Simplex/Perlin-style gradient noise
        float gnoise(in vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);

          return mix(
            mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
            mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        // Fractional Brownian Motion (4 octaves for fluid marbling curls)
        float fbm(vec2 p) {
          mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
          float f = 0.5000 * gnoise(p); p = m * p;
          f += 0.2500 * gnoise(p); p = m * p;
          f += 0.1250 * gnoise(p); p = m * p;
          f += 0.0625 * gnoise(p);
          return f * 0.5 + 0.5;
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          float aspect = u_resolution.x / u_resolution.y;
          vec2 p = uv * vec2(aspect, 1.0) * 1.8;

          // Continuous fluid time flow
          float t = u_time * 0.095;

          // Multi-layer domain warping to simulate acrylic marbling fluid dynamics
          vec2 q = vec2(
            fbm(p + vec2(0.0, 0.0) + vec2(t * 0.45, t * 0.35)),
            fbm(p + vec2(5.2, 1.3) + vec2(-t * 0.35, t * 0.40))
          );

          vec2 r = vec2(
            fbm(p + 2.4 * q + vec2(1.7, 9.2) + vec2(t * 0.25, -t * 0.30)),
            fbm(p + 2.4 * q + vec2(8.3, 2.8) + vec2(-t * 0.30, -t * 0.25))
          );

          // Deep fluid pattern
          float f = fbm(p + 3.2 * r + vec2(q.y * 1.2, r.x * 1.2));

          // Physical paint swirl ridges (fine acrylic veins and striations)
          float veins = sin((f + r.x * 0.6 + q.y * 0.4) * 14.0);
          veins = smoothstep(-0.3, 0.9, veins);

          // Map warped fluid coordinate across the 7 full rainbow hues
          float colorParam = fract(f * 1.35 + q.x * 0.55 + r.y * 0.45 + t * 0.09);

          vec3 col;
          float step = 1.0 / 6.0;

          if (colorParam < step) {
            float s = smoothstep(0.0, step, colorParam);
            col = mix(c_magenta, c_orange, s);
          } else if (colorParam < step * 2.0) {
            float s = smoothstep(step, step * 2.0, colorParam);
            col = mix(c_orange, c_yellow, s);
          } else if (colorParam < step * 3.0) {
            float s = smoothstep(step * 2.0, step * 3.0, colorParam);
            col = mix(c_yellow, c_green, s);
          } else if (colorParam < step * 4.0) {
            float s = smoothstep(step * 3.0, step * 4.0, colorParam);
            col = mix(c_green, c_cyan, s);
          } else if (colorParam < step * 5.0) {
            float s = smoothstep(step * 4.0, step * 5.0, colorParam);
            col = mix(c_cyan, c_blue, s);
          } else {
            float s = smoothstep(step * 5.0, 1.0, colorParam);
            col = mix(c_blue, c_violet, s);
          }

          // Smooth loop back to magenta at the cycle seam
          if (colorParam > 0.90) {
            float s = smoothstep(0.90, 1.0, colorParam);
            col = mix(col, c_magenta, s * 0.9);
          }

          // Subtle physical acrylic marbling veins
          col = mix(col, col * (0.88 + 0.24 * veins), 0.4);

          // Boost color saturation and vibrancy so rainbow is deeply rich and colorful
          vec3 lum = vec3(0.299, 0.587, 0.114);
          float l = dot(col, lum);
          col = mix(vec3(l), col, 1.38); // +38% saturation boost
          col = pow(col, vec3(0.88));    // Luminous vibrance

          col = clamp(col, 0.0, 1.0);

          gl_FragColor = vec4(col, 1.0);
        }
      `

      function createShader(glCtx: WebGLRenderingContext, type: number, source: string) {
        const shader = glCtx.createShader(type)
        if (!shader) return null
        glCtx.shaderSource(shader, source)
        glCtx.compileShader(shader)
        if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
          console.warn('[RainbowMarbling] Shader error:', glCtx.getShaderInfoLog(shader))
          glCtx.deleteShader(shader)
          return null
        }
        return shader
      }

      const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource)
      const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource)
      if (!vertexShader || !fragmentShader) return

      const program = gl.createProgram()
      if (!program) return
      gl.attachShader(program, vertexShader)
      gl.attachShader(program, fragmentShader)
      gl.linkProgram(program)

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('[RainbowMarbling] Program link error:', gl.getProgramInfoLog(program))
        return
      }

      gl.useProgram(program)

      const positionBuffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          -1.0, -1.0,
           1.0, -1.0,
          -1.0,  1.0,
          -1.0,  1.0,
           1.0, -1.0,
           1.0,  1.0,
        ]),
        gl.STATIC_DRAW
      )

      const positionLocation = gl.getAttribLocation(program, 'a_position')
      gl.enableVertexAttribArray(positionLocation)
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

      const resolutionLoc = gl.getUniformLocation(program, 'u_resolution')
      const timeLoc = gl.getUniformLocation(program, 'u_time')

      const handleResize = () => {
        if (!canvas || !gl) return
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
        const displayWidth = Math.floor(canvas.clientWidth * dpr)
        const displayHeight = Math.floor(canvas.clientHeight * dpr)
        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
          canvas.width = displayWidth
          canvas.height = displayHeight
          gl.viewport(0, 0, displayWidth, displayHeight)
        }
      }

      handleResize()
      window.addEventListener('resize', handleResize)

      const startTime = performance.now()

      const render = (time: number) => {
        if (isDisposed || !gl) return
        handleResize()
        const elapsedSec = (time - startTime) * 0.001
        gl.uniform2f(resolutionLoc, canvas.width, canvas.height)
        gl.uniform1f(timeLoc, elapsedSec)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        animFrameId.current = requestAnimationFrame(render)
      }

      animFrameId.current = requestAnimationFrame(render)

      return () => {
        isDisposed = true
        window.removeEventListener('resize', handleResize)
        if (animFrameId.current) cancelAnimationFrame(animFrameId.current)
      }
    } else {
      // ---------------- 2D CANVAS FALLBACK ----------------
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const paintColors = [
        '#FF1499', // Hot Magenta Rose
        '#FF6600', // Pure Vivid Solar Orange
        '#FFE600', // Brilliant Golden Sun Yellow
        '#00EB6B', // Lush Emerald Green
        '#00D9FF', // Electric Turquoise Cyan
        '#1473FF', // Deep Vibrant Cobalt Blue
        '#9414E0', // Royal Violet
      ]

      const handleResize2D = () => {
        if (!canvas) return
        canvas.width = canvas.clientWidth || window.innerWidth
        canvas.height = canvas.clientHeight || window.innerHeight
      }

      handleResize2D()
      window.addEventListener('resize', handleResize2D)

      let offset = 0

      const render2D = () => {
        if (isDisposed || !ctx || !canvas) return
        offset += 0.015
        const w = canvas.width
        const h = canvas.height

        ctx.clearRect(0, 0, w, h)

        // Multiple overlapping wavy fluid ribbons of the exact paint colors
        for (let i = 0; i < paintColors.length; i++) {
          const color = paintColors[i]
          const phase = i * 1.05 + offset
          ctx.save()
          ctx.beginPath()

          const cy = h * (0.15 + (i * 0.14))
          ctx.moveTo(0, cy + Math.sin(phase) * 60)

          for (let x = 0; x <= w; x += 30) {
            const y = cy + Math.sin(x * 0.003 + phase) * 80 + Math.cos(x * 0.006 - phase * 0.8) * 40
            ctx.lineTo(x, y)
          }

          ctx.lineTo(w, h)
          ctx.lineTo(0, h)
          ctx.closePath()

          ctx.fillStyle = color
          ctx.globalAlpha = 0.85
          ctx.fill()
          ctx.restore()
        }

        animFrameId.current = requestAnimationFrame(render2D)
      }

      animFrameId.current = requestAnimationFrame(render2D)

      return () => {
        isDisposed = true
        window.removeEventListener('resize', handleResize2D)
        if (animFrameId.current) cancelAnimationFrame(animFrameId.current)
      }
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
