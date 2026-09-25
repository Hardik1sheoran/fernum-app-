import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'
import { devApiServerPlugin } from './server/devApiServer'

const isWebOnly = process.env.WEB_ONLY === 'true'

export default defineConfig({
  plugins: [
    devApiServerPlugin(),
    react(),
    ...(!isWebOnly
      ? [
          electron([
            {
              entry: 'electron/main.ts',
              onstart(options) {
                options.startup()
              },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'shared'),
            },
          },
        },
      },
      {
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              input: path.resolve(__dirname, 'electron/preload.ts'),
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
                inlineDynamicImports: true,
              },
            },
          },
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'shared'),
            },
          },
        },
      },
      {
        entry: 'electron/workers/scanner.worker.ts',
        vite: {
          build: {
            outDir: 'dist-electron/workers',
          },
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'shared'),
            },
          },
        },
      },
    ]),
      renderer(),
    ]
  : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    port: 5173,
    watch: {
      ignored: ['**/release/**', '**/dist/**', '**/dist-electron/**'],
    },
  },
})
