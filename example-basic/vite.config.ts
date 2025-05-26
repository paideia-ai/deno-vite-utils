import { defineConfig } from 'vite'
import react from 'npm:@vitejs/plugin-react@4.4.1'
import tailwindcss from '@tailwindcss/vite'
import fasterDeno from '@isofucius/deno-vite-plus'
import { viteDenoTailwindSource } from '@isofucius/deno-vite-plus'

// Default config for development
export default defineConfig({
  plugins: [
    fasterDeno(),
    react(),
    viteDenoTailwindSource(),
    tailwindcss(),
  ],
})
