/**
 * pwa-refresh.ts
 *
 * PWA refresh and update system for Watchboard.
 *
 * Provides:
 * 1. Data refresh — purge stale JSON caches, refetch current page data
 * 2. App update check — detect new service worker, prompt reload
 * 3. Pull-to-refresh gesture — custom implementation for standalone PWA
 * 4. Refresh button — always-available UI control in the header
 *
 * Usage: import and call initPwaRefresh() from BaseLayout.astro
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface RefreshOptions {
  /** Enable pull-to-refresh gesture (default: true on mobile) */
  pullToRefresh?: boolean;
  /** Minimum pull distance in px to trigger refresh (default: 80) */
  pullThreshold?: number;
  /** Show update banner when new SW detected (default: true) */
  showUpdateBanner?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DATA_CACHE_PREFIX = 'wb-';
const REFRESH_COOLDOWN_MS = 5_000; // Prevent spam
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

// ─── State ───────────────────────────────────────────────────────────────────

let lastRefreshTime = 0;
let isRefreshing = false;
let pullStartY = 0;
let pullCurrentY = 0;
let isPulling = false;

// ─── Data Refresh ────────────────────────────────────────────────────────────

/**
 * Purge all cached JSON data and reload the current page.
 * This forces fresh data from the server on next navigation.
 */
async function refreshData(): Promise<void> {
  if (isRefreshing) return;
  if (Date.now() - lastRefreshTime < REFRESH_COOLDOWN_MS) return;

  isRefreshing = true;
  lastRefreshTime = Date.now();

  try {
    // Show visual feedback
    showRefreshIndicator();

    // 1. Purge all data caches (JSON files)
    const cacheNames = await caches.keys();
    const dataCaches = cacheNames.filter(
      (name) => name.startsWith(DATA_CACHE_PREFIX) && name.includes('data')
    );
    await Promise.all(dataCaches.map((name) => caches.delete(name)));

    // 2. Also purge HTML cache so the page itself refreshes
    const htmlCaches = cacheNames.filter(
      (name) => name.startsWith(DATA_CACHE_PREFIX) && name.includes('html')
    );
    await Promise.all(htmlCaches.map((name) => caches.delete(name)));

    // 3. Reload the page (bypasses SW for this request)
    window.location.reload();
  } catch (err) {
    console.error('[pwa-refresh] Data refresh failed:', err);
    hideRefreshIndicator();
    isRefreshing = false;
  }
}

// ─── App Update Detection ────────────────────────────────────────────────────

/**
 * Set up service worker update detection.
 * When a new SW is found, show an update banner.
 */
function setupUpdateDetection(opts: RefreshOptions): void {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready.then((registration) => {
    // Check for updates immediately
    registration.update().catch(() => {});

    // Periodic update checks
    setInterval(() => {
      registration.update().catch(() => {});
    }, UPDATE_CHECK_INTERVAL_MS);

    // Listen for new service worker
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available — show banner
          if (opts.showUpdateBanner !== false) {
            showUpdateBanner();
          }
        }
      });
    });

    // Handle controller change (new SW took over)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // The new SW is active — if we're not already refreshing, reload
      if (!isRefreshing) {
        window.location.reload();
      }
    });
  });
}

// ─── Pull-to-Refresh Gesture ─────────────────────────────────────────────────

function setupPullToRefresh(opts: RefreshOptions): void {
  const threshold = opts.pullThreshold || 80;

  // Only enable on touch devices in standalone mode
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;

  if (!isStandalone && opts.pullToRefresh !== true) return;

  // Create the pull indicator element
  const indicator = document.createElement('div');
  indicator.className = 'wb-pull-indicator';
  indicator.innerHTML = `
    <div class="wb-pull-indicator-inner">
      <svg class="wb-pull-arrow" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 19V5M5 12l7-7 7 7"/>
      </svg>
      <span class="wb-pull-text">Pull to refresh</span>
    </div>
  `;
  document.body.prepend(indicator);

  document.addEventListener('touchstart', (e) => {
    // Only trigger when at the top of the page
    if (window.scrollY > 5) return;

    pullStartY = e.touches[0].clientY;
    isPulling = true;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    pullCurrentY = e.touches[0].clientY;
    const pullDistance = pullCurrentY - pullStartY;

    if (pullDistance > 0 && window.scrollY <= 0) {
      const progress = Math.min(pullDistance / threshold, 1);
      indicator.style.transform = `translateY(${Math.min(pullDistance * 0.5, threshold)}px)`;
      indicator.style.opacity = `${progress}`;
      indicator.classList.toggle('wb-pull-ready', progress >= 1);

      if (progress >= 1) {
        const text = indicator.querySelector('.wb-pull-text');
        if (text) text.textContent = 'Release to refresh';
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!isPulling) return;
    isPulling = false;

    const pullDistance = pullCurrentY - pullStartY;
    indicator.style.transform = 'translateY(0)';
    indicator.style.opacity = '0';

    if (pullDistance > threshold && window.scrollY <= 0) {
      refreshData();
    }

    // Reset text
    const text = indicator.querySelector('.wb-pull-text');
    if (text) text.textContent = 'Pull to refresh';
    indicator.classList.remove('wb-pull-ready');
  }, { passive: true });
}

// ─── Refresh Button ──────────────────────────────────────────────────────────

/**
 * Inject a subtle refresh button into the page header.
 * Tapping it clears caches and reloads.
 */
function injectRefreshButton(): void {
  // Find the header or create a floating button
  const existingNav = document.querySelector('.cc-nav-actions, .header-actions, header nav');

  const btn = document.createElement('button');
  btn.className = 'wb-refresh-btn';
  btn.setAttribute('aria-label', 'Refresh data');
  btn.setAttribute('title', 'Refresh data');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M23 4v6h-6"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  `;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    btn.classList.add('wb-refresh-spinning');
    refreshData();
  });

  if (existingNav) {
    existingNav.prepend(btn);
  } else {
    // Floating button (bottom-right)
    btn.classList.add('wb-refresh-floating');
    document.body.appendChild(btn);
  }
}

// ─── UI Elements ─────────────────────────────────────────────────────────────

function showRefreshIndicator(): void {
  let indicator = document.getElementById('wb-refresh-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'wb-refresh-indicator';
    indicator.innerHTML = `
      <div class="wb-refresh-bar">
        <div class="wb-refresh-bar-progress"></div>
      </div>
    `;
    document.body.prepend(indicator);
  }
  indicator.classList.add('wb-refreshing');
}

function hideRefreshIndicator(): void {
  const indicator = document.getElementById('wb-refresh-indicator');
  if (indicator) {
    indicator.classList.remove('wb-refreshing');
  }
}

function showUpdateBanner(): void {
  // Don't show if already visible
  if (document.getElementById('wb-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'wb-update-banner';
  banner.innerHTML = `
    <span>New version available</span>
    <button id="wb-update-btn">Update</button>
    <button id="wb-update-dismiss" aria-label="Dismiss">✕</button>
  `;
  document.body.appendChild(banner);

  document.getElementById('wb-update-btn')?.addEventListener('click', () => {
    refreshData();
  });

  document.getElementById('wb-update-dismiss')?.addEventListener('click', () => {
    banner.remove();
  });
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    /* Refresh button */
    .wb-refresh-btn {
      background: transparent;
      border: 1px solid var(--border, #2a2d3a);
      border-radius: 8px;
      color: var(--text-secondary, #9498a8);
      cursor: pointer;
      padding: 6px 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .wb-refresh-btn:hover {
      color: var(--text-primary, #e8e9ed);
      border-color: var(--border-light, #363a4a);
      background: var(--bg-card, #181b23);
    }
    .wb-refresh-btn:active {
      transform: scale(0.92);
    }
    .wb-refresh-spinning svg {
      animation: wb-spin 0.8s linear infinite;
    }
    @keyframes wb-spin {
      to { transform: rotate(360deg); }
    }
    .wb-refresh-floating {
      position: fixed;
      bottom: 80px;
      right: 16px;
      z-index: 9998;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--bg-card, #181b23);
      border: 1px solid var(--border, #2a2d3a);
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
    }

    /* Progress bar */
    #wb-refresh-indicator {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 99999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s;
    }
    #wb-refresh-indicator.wb-refreshing {
      opacity: 1;
    }
    .wb-refresh-bar {
      height: 3px;
      background: var(--bg-secondary, #12141a);
      overflow: hidden;
    }
    .wb-refresh-bar-progress {
      height: 100%;
      width: 30%;
      background: var(--accent-blue, #3498db);
      animation: wb-progress 1s ease-in-out infinite;
    }
    @keyframes wb-progress {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(400%); }
    }

    /* Pull-to-refresh indicator */
    .wb-pull-indicator {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 99998;
      display: flex;
      justify-content: center;
      pointer-events: none;
      opacity: 0;
      transform: translateY(0);
      transition: opacity 0.15s, transform 0.15s;
    }
    .wb-pull-indicator-inner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: var(--bg-card, #181b23);
      border: 1px solid var(--border, #2a2d3a);
      border-radius: 20px;
      color: var(--text-secondary, #9498a8);
      font-size: 13px;
      margin-top: 8px;
    }
    .wb-pull-ready .wb-pull-indicator-inner {
      color: var(--accent-blue, #3498db);
      border-color: var(--accent-blue, #3498db);
    }
    .wb-pull-arrow {
      transition: transform 0.2s;
    }
    .wb-pull-ready .wb-pull-arrow {
      transform: rotate(180deg);
    }

    /* Update banner */
    #wb-update-banner {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--accent-blue-dim, rgba(52,152,219,0.12));
      border-top: 1px solid var(--accent-blue, #3498db);
      color: var(--text-primary, #e8e9ed);
      font-size: 14px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      animation: wb-slide-up 0.3s ease-out;
    }
    @keyframes wb-slide-up {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    #wb-update-btn {
      background: var(--accent-blue, #3498db);
      color: white;
      border: none;
      border-radius: 6px;
      padding: 6px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    #wb-update-btn:hover {
      filter: brightness(1.1);
    }
    #wb-update-dismiss {
      background: transparent;
      border: none;
      color: var(--text-muted, #8b8fa2);
      cursor: pointer;
      font-size: 16px;
      padding: 4px 8px;
    }

    /* Safe area inset for notched phones */
    @supports (padding-bottom: env(safe-area-inset-bottom)) {
      #wb-update-banner {
        padding-bottom: calc(12px + env(safe-area-inset-bottom));
      }
      .wb-refresh-floating {
        bottom: calc(80px + env(safe-area-inset-bottom));
      }
    }
  `;
  document.head.appendChild(style);
}

// ─── Init ────────────────────────────────────────────────────────────────────

/**
 * Initialize the PWA refresh system.
 * Call this once from BaseLayout.astro after DOMContentLoaded.
 */
export function initPwaRefresh(opts: RefreshOptions = {}): void {
  // Only run in browser
  if (typeof window === 'undefined') return;

  injectStyles();
  injectRefreshButton();
  setupUpdateDetection(opts);

  // Pull-to-refresh: enable by default on mobile standalone
  if (opts.pullToRefresh !== false) {
    setupPullToRefresh(opts);
  }
}

// Auto-init when loaded as a script
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initPwaRefresh());
  } else {
    initPwaRefresh();
  }
}

// Also expose refreshData globally for debugging
if (typeof window !== 'undefined') {
  (window as any).__wbRefresh = refreshData;
}
