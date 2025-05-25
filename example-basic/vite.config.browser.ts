import { defineConfig } from 'vite'
import react from 'npm:@vitejs/plugin-react@4.4.1'
import fasterDeno from '../deno-vite-plus/index.ts'

export default defineConfig({
  plugins: [
    ...fasterDeno(),
    react(),
  ],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
