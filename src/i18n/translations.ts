export type Locale = 'en' | 'es';

export const DEFAULT_LOCALE: Locale = 'en';
export const SUPPORTED_LOCALES: Locale[] = ['en', 'es'];

type TranslationKeys = typeof en;

const en = {
  // Header
  'header.unclassified': 'UNCLASSIFIED',
  'header.osint': 'OPEN SOURCE INTELLIGENCE',
  'header.fouo': 'FOUO',
  'header.home': 'Watchboard Home',

  // Status labels
  'status.active': 'ACTIVE',
  'status.historical': 'HISTORICAL',
  'status.fresh': 'LIVE',
  'status.recent': 'RECENT',
  'status.stale': 'STALE',
  'status.archived': 'ARCHIVED',
  'status.following': 'FOLLOWING',
  'status.follow': 'FOLLOW',

  // Domains
  'domain.conflict': 'CONFLICT',
  'domain.security': 'SECURITY',
  'domain.governance': 'GOVERNANCE',
  'domain.disaster': 'DISASTER',
  'domain.human-rights': 'HUMAN RIGHTS',
  'domain.science': 'SCIENCE',
  'domain.space': 'SPACE',
  'domain.economy': 'ECONOMY',
  'domain.culture': 'CULTURE',
  'domain.history': 'HISTORY',
  'domain.tracker': 'TRACKER',

  // Command Center
  'cc.search': 'Search trackers... (press /)',
  'cc.liveOps': 'LIVE OPERATIONS',
  'cc.historical': 'HISTORICAL ANALYSIS',
  'cc.latestIntel': 'LATEST INTEL',
  'cc.openDashboard': 'OPEN DASHBOARD',
  'cc.deselect': 'DESELECT',
  'cc.compare': 'COMPARE',
  'cc.initGlobe': 'INITIALIZING GLOBE',
  'cc.globeHint': 'Drag to rotate · Scroll to zoom · Click marker to select',
  'cc.noResults': 'No trackers match your search.',
  'cc.live': 'LIVE',
  'cc.hist': 'HIST',

  // Sections
  'section.timeline': 'Timeline',
  'section.map': 'Theater Map',
  'section.military': 'Military',
  'section.casualties': 'Casualties',
  'section.economic': 'Economic',
  'section.claims': 'Claims',
  'section.political': 'Political',

  // Footer
  'footer.about': 'About & Credits',
  'footer.disclaimer': 'Does not endorse any particular narrative.',

  // Keyboard shortcuts
  'shortcuts.title': 'KEYBOARD SHORTCUTS',
  'shortcuts.search': 'Focus search',
  'shortcuts.navigate': 'Navigate trackers',
  'shortcuts.open': 'Open dashboard',
  'shortcuts.follow': 'Follow / unfollow',
  'shortcuts.rotate': 'Toggle globe rotation',
  'shortcuts.openSelected': 'Open selected tracker',
  'shortcuts.deselect': 'Deselect / close',
  'shortcuts.help': 'Show this help',
  'shortcuts.close': 'to close',

  // Time
  'time.justNow': 'Just now',
  'time.minAgo': 'min ago',
  'time.hAgo': 'h ago',
  'time.dAgo': 'd ago',
  'time.day': 'DAY',
  'time.days': 'DAYS',
  'time.updated': 'Updated',
} as const;

const es: TranslationKeys = {
  'header.unclassified': 'NO CLASIFICADO',
  'header.osint': 'INTELIGENCIA DE FUENTES ABIERTAS',
  'header.fouo': 'USO OFICIAL',
  'header.home': 'Inicio Watchboard',

  'status.active': 'ACTIVO',
  'status.historical': 'HISTORICO',
  'status.fresh': 'EN VIVO',
  'status.recent': 'RECIENTE',
  'status.stale': 'DESACTUALIZADO',
  'status.archived': 'ARCHIVADO',
  'status.following': 'SIGUIENDO',
  'status.follow': 'SEGUIR',

  'domain.conflict': 'CONFLICTO',
  'domain.security': 'SEGURIDAD',
  'domain.governance': 'GOBIERNO',
  'domain.disaster': 'DESASTRE',
  'domain.human-rights': 'DERECHOS HUMANOS',
  'domain.science': 'CIENCIA',
  'domain.space': 'ESPACIO',
  'domain.economy': 'ECONOMIA',
  'domain.culture': 'CULTURA',
  'domain.history': 'HISTORIA',
  'domain.tracker': 'RASTREADOR',

  'cc.search': 'Buscar rastreadores... (presiona /)',
  'cc.liveOps': 'OPERACIONES EN VIVO',
  'cc.historical': 'ANALISIS HISTORICO',
  'cc.latestIntel': 'ULTIMA INTELIGENCIA',
  'cc.openDashboard': 'ABRIR PANEL',
  'cc.deselect': 'DESELECCIONAR',
  'cc.compare': 'COMPARAR',
  'cc.initGlobe': 'INICIALIZANDO GLOBO',
  'cc.globeHint': 'Arrastra para rotar · Scroll para zoom · Clic en marcador para seleccionar',
  'cc.noResults': 'Ningun rastreador coincide con tu busqueda.',
  'cc.live': 'EN VIVO',
  'cc.hist': 'HIST',

  'section.timeline': 'Linea de Tiempo',
  'section.map': 'Mapa de Teatro',
  'section.military': 'Militar',
  'section.casualties': 'Victimas',
  'section.economic': 'Economico',
  'section.claims': 'Declaraciones',
  'section.political': 'Politico',

  'footer.about': 'Acerca de y Creditos',
  'footer.disclaimer': 'No respalda ninguna narrativa en particular.',

  'shortcuts.title': 'ATAJOS DE TECLADO',
  'shortcuts.search': 'Enfocar busqueda',
  'shortcuts.navigate': 'Navegar rastreadores',
  'shortcuts.open': 'Abrir panel',
  'shortcuts.follow': 'Seguir / dejar de seguir',
  'shortcuts.rotate': 'Alternar rotacion del globo',
  'shortcuts.openSelected': 'Abrir rastreador seleccionado',
  'shortcuts.deselect': 'Deseleccionar / cerrar',
  'shortcuts.help': 'Mostrar esta ayuda',
  'shortcuts.close': 'para cerrar',

  'time.justNow': 'Ahora mismo',
  'time.minAgo': 'min',
  'time.hAgo': 'h',
  'time.dAgo': 'd',
  'time.day': 'DIA',
  'time.days': 'DIAS',
  'time.updated': 'Actualizado',
};

const translations: Record<Locale, TranslationKeys> = { en, es };

export function t(key: keyof TranslationKeys, locale: Locale = DEFAULT_LOCALE): string {
  return translations[locale]?.[key] || translations.en[key] || key;
}

export function getLocaleFromUrl(url: URL): Locale {
  const parts = url.pathname.split('/');
  const lang = parts[1]; // e.g., /es/... or /watchboard/es/...
  if (SUPPORTED_LOCALES.includes(lang as Locale)) return lang as Locale;
  // Check after base path
  const base = parts[2];
  if (SUPPORTED_LOCALES.includes(base as Locale)) return base as Locale;
  return DEFAULT_LOCALE;
}

export function getPreferredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const saved = localStorage.getItem('watchboard-locale');
    if (saved && SUPPORTED_LOCALES.includes(saved as Locale)) return saved as Locale;
  } catch {}
  const browserLang = navigator.language.slice(0, 2);
  if (SUPPORTED_LOCALES.includes(browserLang as Locale)) return browserLang as Locale;
  return DEFAULT_LOCALE;
}

export function setPreferredLocale(locale: Locale): void {
  try { localStorage.setItem('watchboard-locale', locale); } catch {}
}
