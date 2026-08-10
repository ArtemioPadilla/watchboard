import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  integrations: [react(), sitemap()],
  output: 'static',
  site: 'https://watchboard.dev',
  base: '/',
  // /rss and /rss/ 404'd: src/pages/rss/ holds breaking.xml and light-scan.xml
  // but has no index, so the directory itself was never a route. Nothing on the
  // site linked there, but it is the URL people type by convention — a bad one
  // to lose on a site whose product is feeds. Sent to the global feed rather
  // than to /feeds/, since bare /rss conventionally means "the feed".
  redirects: {
    '/rss': '/rss.xml',
    '/rss/': '/rss.xml',
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'pt'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  image: {
    // Enable Astro built-in image optimization
    remotePatterns: [
      { protocol: 'https', hostname: '**.aljazeera.com' },
      { protocol: 'https', hostname: 'dims.apnews.com' },
      { protocol: 'https', hostname: 'd3i6fh83elv35t.cloudfront.net' },
      { protocol: 'https', hostname: 'i.iranintl.com' },
      { protocol: 'https', hostname: 'global.unitednations.entermediadb.net' },
      { protocol: 'https', hostname: 'npr.brightspotcdn.com' },
      { protocol: 'https', hostname: '**.hrw.org' },
      { protocol: 'https', hostname: 'media.cnn.com' },
      { protocol: 'https', hostname: 'images.jpost.com' },
      { protocol: 'https', hostname: 'assets.kyivindependent.com' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
    ],
  },
  vite: {
    define: {
      CESIUM_BASE_URL: JSON.stringify('/cesium/'),
    },
    server: {
      allowedHosts: ['.trycloudflare.com'],
    },
    build: {
      // Optimal chunking strategy for better caching & parallel loading
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Vendor chunk for React core
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            // Separate heavy globe/3D libs
            if (id.includes('node_modules/three/') || id.includes('node_modules/globe.gl') || id.includes('node_modules/react-globe.gl')) {
              return 'vendor-globe';
            }
            // i18n translations
            if (id.includes('/i18n/')) {
              return 'i18n';
            }
          },
        },
      },
    },
  },
});
