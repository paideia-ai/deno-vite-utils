import { defineConfig } from 'vite'
import react from 'npm:@vitejs/plugin-react@4.4.1'
import fasterDeno from '@pea2/faster-deno-vite'

// Default config for development
export default defineConfig({
  plugins: [
    // For development, we use the default dev: true option
    fasterDeno(),
    react(),
  ],
})
