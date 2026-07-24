import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@pptist/presentation-core': fileURLToPath(new URL('../presentation-core/src/index.ts', import.meta.url)),
    },
  },
  build: {
    target: 'es2020',
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      output: {
        exports: 'named',
      },
    },
  },
})
