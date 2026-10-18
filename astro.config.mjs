import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  integrations: [react(), sitemap()],
  output: 'static',
  site: 'https://watchboard.dev',
  base: '/',
  // Note: /rss is a real page (src/pages/rss/index.astro), not a redirect.
  // Astro's generated redirect stub is bare HTML with no <head> from
  // BaseLayout, so an RSS reader pointed at /rss would get a page containing
  // no feed autodiscovery and no way to find the actual feed.
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'pt'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  // No `image:` block on purpose. Nothing here uses Astro's image service:
  // no `astro:assets` import, no <Image>/<Picture>/getImage call, no content
  // collection with an `image()` schema and no markdown. The eleven-host
  // `remotePatterns` allowlist that used to sit here therefore optimised
  // nothing. Event media is rendered as plain <img> from the URLs in each
  // event's `media` array.
  //
  // Correction to what #340 said when it removed the block: sharp is NOT
  // uninvoked. src/pages/og/[tracker].png.ts imports it directly to compose
  // the OG images. What it never receives is a fetched image — its only input
  // is public/textures/earth-dark-blend-4k.webp, checked into this repo — so
  // the libvips and libheif advisories, which are about decoding untrusted
  // input, stay unreachable for that reason rather than for the one given.
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
