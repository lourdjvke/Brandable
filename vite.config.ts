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
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: false,
          maximumFileSizeToCacheInBytes: 5242880,
        },
        manifest: {
          name: 'Brandable OS',
          short_name: 'Brandable',
          description: 'The Ultimate AI-Powered Content & Brand OS',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'https://cdn.dribbble.com/userupload/46470256/file/af6fd035c99fbb7985614c15d3a47d96.jpg?format=webp&resize=640x480&vertical=center',
              sizes: '192x192',
              type: 'image/webp'
            },
            {
              src: 'https://cdn.dribbble.com/userupload/46470256/file/af6fd035c99fbb7985614c15d3a47d96.jpg?format=webp&resize=640x480&vertical=center',
              sizes: '512x512',
              type: 'image/webp'
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
