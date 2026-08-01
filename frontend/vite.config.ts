import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Let vite-plugin-pwa manage sw registration — no manual script needed
      injectRegister: 'auto',
      // Generate a real service worker (not just a manifest)
      strategies: 'generateSW',
      // The service worker file name that will be generated
      filename: 'sw.js',
      manifest: {
        name: 'Fermata Music',
        short_name: 'Fermata',
        description: 'A production-ready music streaming application powered by FastAPI.',
        start_url: './',
        display: 'standalone',
        background_color: '#121212',
        theme_color: '#7c3aed',
        orientation: 'portrait',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // --- App Shell: Pre-cache ALL compiled JS/CSS/HTML bundles ---
        // Workbox reads the Vite build output and injects the exact hashed filenames
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['**/node_modules/**'],

        // Allow large bundles (our main JS is ~1MB)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

        // --- Runtime Caching Strategies ---
        runtimeCaching: [
          // ── Strategy 1: Backend API responses (homepage data, track lists, albums) ──
          // Network-first: try network, fall back to cache if offline
          {
            urlPattern: ({ url }: { url: URL }) =>
              url.pathname.startsWith('/api/') ||
              url.hostname.includes('fermata') ||
              url.hostname.includes('render.com') ||
              url.hostname.includes('railway.app'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'fermata-api-v1',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },

          // ── Strategy 2: Cover art images (Backblaze B2 / CDN) ──
          // Cache-first: serve from cache, refresh in background
          {
            urlPattern: ({ url }: { url: URL }) =>
              url.hostname.includes('backblaze') ||
              url.hostname.includes('b2cdn') ||
              url.hostname.includes('cloudflare') ||
              /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fermata-images-v1',
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },

          // ── Strategy 3: HLS audio (.m3u8 playlists + .ts segments) ──
          // Cache-first with a 10-track (~50MB) LRU eviction limit
          {
            urlPattern: ({ url }: { url: URL }) =>
              /\.(m3u8|ts)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fermata-audio-v1',
              expiration: {
                // Each track ~200 segments + 1 playlist. 10 tracks ≈ 2010 entries
                maxEntries: 2100,
                maxAgeSeconds: 60 * 60 * 24 * 14, // 14 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              // Range requests (partial audio) must be handled by a plugin
              plugins: [],
            },
          },

          // ── Strategy 4: Google Fonts ──
          {
            urlPattern: ({ url }: { url: URL }) =>
              url.hostname === 'fonts.googleapis.com' ||
              url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fermata-fonts-v1',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
