import React, { useEffect, useRef } from 'react'

interface RainbowMarblingCanvasProps {
  active: boolean
}

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

    // Try WebGL first for ultra-smooth 60fps GPU acceleration
    let gl: WebGLRenderingContext | null = null
    try {
      gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
      })
    } catch {
      gl = null
    }

    let isDisposed = false

    if (gl) {
      // ---------------- WEBGL IMPLEMENTATION ----------------
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

        // Exact palette colors from reference screenshot
        const vec3 c_pink   = vec3(0.914, 0.243, 0.561); // #E93E8F Vibrant Pink / Magenta
        const vec3 c_orange = vec3(1.000, 0.416, 0.110); // #FF6A1C Vivid Orange
        const vec3 c_yellow = vec3(1.000, 0.851, 0.251); // #FFD940 Bright Golden Yellow
        const vec3 c_green  = vec3(0.267, 0.831, 0.431); // #44D46E Emerald Green
        const vec3 c_cyan   = vec3(0.024, 0.714, 0.831); // #06B6D4 Electric Cyan
        const vec3 c_blue   = vec3(0.133, 0.482, 1.000); // #227BFF Sky Blue
        const vec3 c_violet = vec3(0.482, 0.173, 0.749); // #7B2CBF Imperial Purple

        // Procedural multi-octave domain warping for liquid marbling swirls
        vec2 swirl(vec2 p, float t) {
          for (int i = 1; i <= 5; i++) {
            float fi = float(i);
            float speed = t * 0.14;
            vec2 offset = vec2(
              sin(p.y * 1.65 * fi + speed * (0.8 + fi * 0.18) + fi * 1.618),
              cos(p.x * 1.65 * fi + speed * (0.75 + fi * 0.18) + fi * 2.718)
            );
            p += offset * (0.42 / fi);
          }
          return p;
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          float aspect = u_resolution.x / u_resolution.y;
          vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.6;

          // Organic, continuous liquid motion with phase shift
          float t = u_time;
          vec2 w1 = swirl(p, t);
          vec2 w2 = swirl(w1 * 1.15 + vec2(sin(t * 0.07) * 0.4, cos(t * 0.08) * 0.4), t * 1.1);

          // Liquid ribbon folding and subtle waves
          float ribbon = sin(w2.x * 2.4 + w2.y * 2.1 + t * 0.22) * 0.5 + 0.5;
          float fold = cos(w1.x * 2.8 - w1.y * 2.6 - t * 0.16) * 0.5 + 0.5;
          
          // Phase-shifted seamless cyclic scalar in [0, 1]
          float val = fract(ribbon * 0.55 + fold * 0.45 + t * 0.035);

          // Smooth 7-color continuous spectral blending
          vec3 col;
          float step = 1.0 / 7.0;

          if (val < step) {
            float f = smoothstep(0.0, step, val);
            col = mix(c_pink, c_orange, f);
          } else if (val < step * 2.0) {
            float f = smoothstep(step, step * 2.0, val);
            col = mix(c_orange, c_yellow, f);
          } else if (val < step * 3.0) {
            float f = smoothstep(step * 2.0, step * 3.0, val);
            col = mix(c_yellow, c_green, f);
          } else if (val < step * 4.0) {
            float f = smoothstep(step * 3.0, step * 4.0, val);
            col = mix(c_green, c_cyan, f);
          } else if (val < step * 5.0) {
            float f = smoothstep(step * 4.0, step * 5.0, val);
            col = mix(c_cyan, c_blue, f);
          } else if (val < step * 6.0) {
            float f = smoothstep(step * 5.0, step * 6.0, val);
            col = mix(c_blue, c_violet, f);
          } else {
            float f = smoothstep(step * 6.0, 1.0, val);
            col = mix(c_violet, c_pink, f); // Invisibly connects back to Pink
          }

          // Soft acrylic highlight sheen along the swirling fluid contours
          float sheen = smoothstep(0.35, 0.65, abs(fract(ribbon * 2.5) - 0.5) * 2.0);
          col += vec3(0.08, 0.08, 0.10) * sheen;

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

      // Screen-filling quad
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
        const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
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

      const colors = [
        '#E93E8F', // Pink
        '#FF6A1C', // Orange
        '#FFD940', // Yellow
        '#44D46E', // Green
        '#06B6D4', // Cyan
        '#227BFF', // Blue
        '#7B2CBF', // Violet
      ]

      const handleResize2D = () => {
        if (!canvas) return
        canvas.width = canvas.clientWidth || window.innerWidth
        canvas.height = canvas.clientHeight || window.innerHeight
      }

      handleResize2D()
      window.addEventListener('resize', handleResize2D)

      let phase = 0

      const render2D = () => {
        if (isDisposed || !ctx || !canvas) return
        phase += 0.008
        const w = canvas.width
        const h = canvas.height

        ctx.clearRect(0, 0, w, h)

        // Draw overlapping organic fluid waves
        for (let i = 0; i < colors.length; i++) {
          const color = colors[i]
          const offsetPhase = phase + (i * Math.PI * 2) / colors.length
          const cx = w * 0.5 + Math.sin(offsetPhase * 0.6) * (w * 0.35)
          const cy = h * 0.5 + Math.cos(offsetPhase * 0.7) * (h * 0.35)
          const radius = Math.max(w, h) * (0.45 + 0.15 * Math.sin(offsetPhase * 0.9))

          const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius)
          grad.addColorStop(0, color)
          grad.addColorStop(1, 'transparent')

          ctx.fillStyle = grad
          ctx.globalAlpha = 0.5
          ctx.fillRect(0, 0, w, h)
        }

        ctx.globalAlpha = 1.0
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
