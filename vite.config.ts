import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The repo name on GitHub. Pages serves the site at /<repo>/, so all
  // built asset URLs need this prefix. Local dev is unaffected.
  base: '/DungeonThing/',
})
