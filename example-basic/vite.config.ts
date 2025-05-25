import { defineConfig } from 'vite'
import react from 'npm:@vitejs/plugin-react@4.4.1'
import tailwindcss from '@tailwindcss/vite'
import fasterDeno from '@pea2/faster-deno-vite'

// Default config for development
export default defineConfig({
  plugins: [
    fasterDeno(),
    react(),
    tailwindcss(),
  ],
})
