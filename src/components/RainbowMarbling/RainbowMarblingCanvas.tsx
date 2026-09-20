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

    // Try WebGL first for smooth GPU acceleration
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
      // ---------------- WEBGL IMPLEMENTATION ----------------
      // Directional linear liquid marbling bands matching the reference photo
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

        // ONLY THE EXACT COLORS FROM REFERENCE PICTURE:
        // Swatches: #E93E8F, #FF6A1C, #FFD940, #44D46E, #227BFF
        // Plus the deep purple swirl base and subtle white marble veining from the photo
        const vec3 c_pink   = vec3(0.914, 0.243, 0.561); // #E93E8F Pink / Magenta
        const vec3 c_orange = vec3(1.000, 0.416, 0.110); // #FF6A1C Warm Orange
        const vec3 c_yellow = vec3(1.000, 0.851, 0.251); // #FFD940 Yellow
        const vec3 c_green  = vec3(0.267, 0.831, 0.431); // #44D46E Green
        const vec3 c_blue   = vec3(0.133, 0.482, 1.000); // #227BFF Blue
        const vec3 c_purple = vec3(0.345, 0.110, 0.529); // #581C87 Deep Purple (from image background)
        const vec3 c_white  = vec3(1.000, 1.000, 1.000); // White acrylic veining

        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          
          // Align approximately in a diagonal line (matching the reference photo)
          float lineAxis = uv.x * 0.72 + uv.y * 0.68;

          // Organic fluid wave displacements along the line direction
          float t = u_time * 0.45;
          float wave1 = sin(uv.y * 4.2 - uv.x * 2.8 + t * 0.8) * 0.09;
          float wave2 = cos(uv.x * 6.5 + uv.y * 3.5 - t * 0.6) * 0.06;
          float wave3 = sin((lineAxis + wave1) * 5.0 + t * 0.5) * 0.04;

          // Seamless cyclic parameter flowing approximately in a line
          float param = fract(lineAxis * 1.35 + wave1 + wave2 + wave3 + t * 0.12);

          // Blend bands in exact sequence from the photo
          vec3 col;
          float step = 1.0 / 6.0;

          if (param < step) {
            float f = smoothstep(0.0, step, param);
            col = mix(c_purple, c_pink, f);
          } else if (param < step * 2.0) {
            float f = smoothstep(step, step * 2.0, param);
            col = mix(c_pink, c_orange, f);
          } else if (param < step * 3.0) {
            float f = smoothstep(step * 2.0, step * 3.0, param);
            col = mix(c_orange, c_yellow, f);
          } else if (param < step * 4.0) {
            float f = smoothstep(step * 3.0, step * 4.0, param);
            col = mix(c_yellow, c_green, f);
          } else if (param < step * 5.0) {
            float f = smoothstep(step * 4.0, step * 5.0, param);
            col = mix(c_green, c_blue, f);
          } else {
            float f = smoothstep(step * 5.0, 1.0, param);
            col = mix(c_blue, c_purple, f);
          }

          // Subtle natural white marble veining along the fluid boundary (as seen in the photo)
          float vein = smoothstep(0.015, 0.0, abs(sin((lineAxis + wave1 + wave2) * 24.0 + t * 0.3)) - 0.985);
          col = mix(col, c_white, vein * 0.35);

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

      // Full screen quad
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
      // Directional linear bands with subtle wave offsets
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const colors = [
        '#581C87', // Deep Purple
        '#E93E8F', // Pink
        '#FF6A1C', // Orange
        '#FFD940', // Yellow
        '#44D46E', // Green
        '#227BFF', // Blue
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
        offset += 0.8
        const w = canvas.width
        const h = canvas.height

        ctx.clearRect(0, 0, w, h)

        // Draw flowing diagonal linear bands approximately in a line
        const grad = ctx.createLinearGradient(0, 0, w, h)
        for (let i = 0; i <= colors.length * 2; i++) {
          const c = colors[i % colors.length]
          const stop = (i / (colors.length * 2) + (offset * 0.0005)) % 1
          grad.addColorStop(stop, c)
        }

        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)

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
        className="w-full h-full object-cover transition-opacity duration-500 ease-in-out"
        style={{ width: '100vw', height: '100vh', display: 'block' }}
      />
    </div>
  )
}
