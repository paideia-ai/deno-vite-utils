import { defineConfig } from 'vite'
import react from 'npm:@vitejs/plugin-react@4.4.1'
import fasterDeno from '../deno-vite-plus/index.ts'

export default defineConfig({
  plugins: [
    ...fasterDeno(),
    react(),
  ],
  build: {
    outDir: 'dist/server',
    ssr: 'src/entry-server.tsx',
    rollupOptions: {
      input: 'src/entry-server.tsx',
    },
  },
  ssr: {
    noExternal: false, // Allow external dependencies in dev mode
  },
})
