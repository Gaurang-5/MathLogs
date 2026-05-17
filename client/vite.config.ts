import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Plugin to defer registerSW.js (it's render-blocking but only runs on window.load anyway)
function perfOptimizer(): Plugin {
  return {
    name: 'perf-optimizer',
    enforce: 'post',
    transformIndexHtml(html) {
      // Defer registerSW.js — it only registers SW on window load, no reason to block render
      html = html.replace(
        '<script id="vite-plugin-pwa:register-sw" src="/registerSW.js"></script>',
        '<script id="vite-plugin-pwa:register-sw" src="/registerSW.js" defer></script>'
      );
      return html;
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
  },
  plugins: [
    react(),
    perfOptimizer(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192x192.png', 'icon-512x512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'MathLogs',
        short_name: 'MathLogs',
        description: 'Coaching Management Dashboard',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/dashboard',
        scope: '/',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Exclude student portal routes from SW navigation fallback
        // This prevents SW startup errors on /mbcs/student pages
        navigateFallbackDenylist: [/^\/[^/]+\/student/, /^\/api\//],
        // Exclude source maps and very large files from precache (prevents SW startup errors)
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3MB
        // Cache-first for static assets
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          {
            // Network-first for API calls (never cache authenticated data)
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 0 // Don't cache API responses
              }
            }
          }
        ],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['framer-motion', 'lucide-react'],
          charts: ['recharts'],
          utils: ['html5-qrcode', 'react-qr-code']
        }
      }
    }
  },
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
