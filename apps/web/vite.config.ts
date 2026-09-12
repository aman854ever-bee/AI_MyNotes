import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// VITE_BASE_PATH lets a GitHub Actions deploy serve this from a repo
// subpath (https://<user>.github.io/<repo>/) without hardcoding the repo
// name here — the workflow sets it per-build. Locally (npm run dev/build
// without the env var) this stays '/', unchanged from before.
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'MyNotes',
        short_name: 'MyNotes',
        description: 'Capture anything. Forget nothing. Get things done.',
        theme_color: '#2F6FED',
        background_color: '#F5F8FF',
        display: 'standalone',
        // Relative to the manifest's own location, so it resolves
        // correctly whether the app is served from '/' or a subpath.
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      }
    })
  ]
})
