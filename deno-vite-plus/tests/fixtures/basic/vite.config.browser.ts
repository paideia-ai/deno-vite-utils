import { defineConfig } from 'vite'
import react from 'npm:@vitejs/plugin-react@4.4.1'
import fasterDeno from '../../../index.ts'

export default defineConfig({
  plugins: [
    // For browser builds, we pass dev: true to fasterDeno (or use default)
    fasterDeno({ dev: true }),
    react(),
  ],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
