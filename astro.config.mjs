import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  integrations: [react(), sitemap()],
  output: 'static',
  site: 'https://watchboard.dev',
  base: '/',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'pt'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  vite: {
    define: {
      CESIUM_BASE_URL: JSON.stringify('/cesium/'),
    },
  },
});
