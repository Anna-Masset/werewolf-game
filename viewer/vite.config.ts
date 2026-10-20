import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // The schema lives one level up (../schema) so the simulator and viewer share it.
  server: { fs: { allow: ['..'] } },
})
