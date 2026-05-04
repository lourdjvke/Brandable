import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webp}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          maximumFileSizeToCacheInBytes: 5242880,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // <--- 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/cdn\.dribbble\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'external-assets-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // <--- 30 days
                },
              },
            },
            {
              urlPattern: /^https:\/\/cdn-icons-png\.flaticon\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'icons-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            }
          ]
        },
        manifest: {
          name: 'Brandable OS',
          short_name: 'Brandable',
          description: 'The Ultimate AI-Powered Content & Brand OS',
          theme_color: '#FF6719',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'https://cdn.dribbble.com/userupload/46470256/file/af6fd035c99fbb7985614c15d3a47d96.jpg?format=webp&resize=640x480&vertical=center',
              sizes: '192x192',
              type: 'image/webp'
            },
            {
              src: 'https://cdn.dribbble.com/userupload/46470256/file/af6fd035c99fbb7985614c15d3a47d96.jpg?format=webp&resize=640x480&vertical=center',
              sizes: '512x512',
              type: 'image/webp',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
