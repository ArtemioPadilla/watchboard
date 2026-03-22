import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
  output: 'static',
  site: 'https://artemiop.com',
  base: '/watchboard',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'pt'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  vite: {
    define: {
      CESIUM_BASE_URL: JSON.stringify('/watchboard/cesium/'),
    },
  },
});
