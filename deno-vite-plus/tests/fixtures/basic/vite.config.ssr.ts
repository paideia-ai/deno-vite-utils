import { defineConfig } from 'vite'
import react from 'npm:@vitejs/plugin-react@4.4.1'
import fasterDeno from '../../../index.ts'

export default defineConfig({
  plugins: [
    // For SSR builds, we pass dev: false to fasterDeno
    // which will automatically include nodeExternals
    fasterDeno({ dev: false }),
    react(),
  ],
  build: {
    outDir: 'dist/server',
    emptyOutDir: true,
    ssr: 'src/entry-server.tsx',
    rollupOptions: {
      input: 'src/entry-server.tsx',
      output: {
        format: 'es',
      },
    },
  },
  ssr: {
    noExternal: true,
  },
})
