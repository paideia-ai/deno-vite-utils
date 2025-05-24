import { defineConfig } from 'vite'
import react from 'npm:@vitejs/plugin-react@4.4.1'
import fasterDeno from '../../../index.ts'

export default defineConfig({
  plugins: [
    // For SSR dev builds, we pass dev: true and ssrDevExternalDeps
    // to load certain dependencies natively through Deno during SSR
    fasterDeno({
      dev: true,
      ssrDevExternalDeps: [
        '@my-org/*', // Wildcard - matches all imports starting with @my-org/
        'local-module', // Exact match and prefix
        '@external/specific', // Specific module
      ],
    }),
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
