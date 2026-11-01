import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'push-sw.js'],
      devOptions: { enabled: true, navigateFallbackAllowlist: [/^\/$/] },
      manifest: {
        name: 'Flowcheck',
        short_name: 'Flowcheck',
        description: 'Tu imagen financiera del mes: gastos fijos, ahorro y lo que vas gastando.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0aa5ff',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        importScripts: ['push-sw.js'],
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\/](react|react-dom|react-router|react-router-dom|scheduler)[\/]/.test(id)) return 'react'
          if (/[\/](recharts|d3-[^\/]+|victory-vendor)[\/]/.test(id)) return 'charts'
          if (id.includes('@supabase')) return 'supabase'
        }
      }
    }
  },
  server: {
    proxy: { '/api': 'http://localhost:3001' }
  }
})
