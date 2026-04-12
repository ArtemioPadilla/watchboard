export type Locale = 'en' | 'es' | 'fr' | 'pt';

export const DEFAULT_LOCALE: Locale = 'en';
export const SUPPORTED_LOCALES: Locale[] = ['en', 'es', 'fr', 'pt'];

type TranslationKeys = Record<keyof typeof en, string>;

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
  'shortcuts.cityLights': 'Toggle city lights',
  'shortcuts.openSelected': 'Open selected tracker',
  'shortcuts.deselect': 'Deselect / close',
  'shortcuts.help': 'Show this help',
  'shortcuts.close': 'to close',

  // Time
  // Broadcast mode
  'broadcast.live': 'LIVE',
  'broadcast.paused': 'PAUSED',
  'broadcast.resumingIn': 'Resuming in',
  'broadcast.openDashboard': 'Open Dashboard →',
  'broadcast.tracking': 'Tracking...',
  'broadcast.day': 'DAY',
  'shortcuts.broadcast': 'Toggle broadcast mode',

  // Stories (MobileStoryCarousel)
  'story.briefing': 'BRIEFING',
  'story.readMore': 'Read more →',
  'story.tapToResume': 'TAP TO RESUME',
  'story.swipeHint': '← SWIPE → · TAP TO PAUSE',
  'story.paused': 'PAUSED',
  'story.resumingIn': 'Resuming in',
  'story.sectionsUpdated': 'sections updated',
  'story.live': 'LIVE',
  'story.day': 'DAY',

  // Welcome overlay
  'welcome.title': 'Welcome to Watchboard',
  'welcome.description': 'Real-time intelligence dashboards tracking world events. The globe rotates through active stories — click any tracker in the sidebar to explore.',
  'welcome.pauseBroadcast': 'Pause broadcast',
  'welcome.search': 'Search',
  'welcome.allShortcuts': 'All shortcuts',
  'welcome.dontShowAgain': "Don't show again",
  'welcome.gotIt': 'Got it',

  // Header
  'header.activeTracker': 'ACTIVE TRACKER',
  'header.updated': 'Updated',
  'header.updateUnknown': 'Last update time unknown',
  'header.3dGlobe': '3D Globe',
  'header.about': 'About',

  // Footer
  'footer.rssFeed': 'RSS Feed',
  'footer.status': 'Status',
  'footer.social': 'Social',
  'footer.lastUpdated': 'Last updated:',

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
  'status.historical': 'HISTÓRICO',
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
  'domain.economy': 'ECONOMÍA',
  'domain.culture': 'CULTURA',
  'domain.history': 'HISTORIA',
  'domain.tracker': 'RASTREADOR',

  'cc.search': 'Buscar rastreadores... (presiona /)',
  'cc.liveOps': 'OPERACIONES EN VIVO',
  'cc.historical': 'ANÁLISIS HISTÓRICO',
  'cc.latestIntel': 'ÚLTIMA INTELIGENCIA',
  'cc.openDashboard': 'ABRIR PANEL',
  'cc.deselect': 'DESELECCIONAR',
  'cc.compare': 'COMPARAR',
  'cc.initGlobe': 'INICIALIZANDO GLOBO',
  'cc.globeHint': 'Arrastra para rotar · Scroll para zoom · Clic en marcador para seleccionar',
  'cc.noResults': 'Ningún rastreador coincide con tu búsqueda.',
  'cc.live': 'EN VIVO',
  'cc.hist': 'HIST',

  'section.timeline': 'Línea de Tiempo',
  'section.map': 'Mapa de Teatro',
  'section.military': 'Militar',
  'section.casualties': 'Víctimas',
  'section.economic': 'Económico',
  'section.claims': 'Declaraciones',
  'section.political': 'Político',

  'footer.about': 'Acerca de y Créditos',
  'footer.disclaimer': 'No respalda ninguna narrativa en particular.',

  'shortcuts.title': 'ATAJOS DE TECLADO',
  'shortcuts.search': 'Enfocar búsqueda',
  'shortcuts.navigate': 'Navegar rastreadores',
  'shortcuts.open': 'Abrir panel',
  'shortcuts.follow': 'Seguir / dejar de seguir',
  'shortcuts.rotate': 'Alternar rotación del globo',
  'shortcuts.cityLights': 'Alternar luces urbanas',
  'shortcuts.openSelected': 'Abrir rastreador seleccionado',
  'shortcuts.deselect': 'Deseleccionar / cerrar',
  'shortcuts.help': 'Mostrar esta ayuda',
  'shortcuts.close': 'para cerrar',

  'broadcast.live': 'EN VIVO',
  'broadcast.paused': 'PAUSADO',
  'broadcast.resumingIn': 'Reanudando en',
  'broadcast.openDashboard': 'Abrir Panel →',
  'broadcast.tracking': 'Rastreando...',
  'broadcast.day': 'DÍA',
  'shortcuts.broadcast': 'Alternar modo transmisión',

  'story.briefing': 'RESUMEN',
  'story.readMore': 'Leer más →',
  'story.tapToResume': 'TOCA PARA REANUDAR',
  'story.swipeHint': '← DESLIZA → · TOCA PARA PAUSAR',
  'story.paused': 'PAUSADO',
  'story.resumingIn': 'Reanudando en',
  'story.sectionsUpdated': 'secciones actualizadas',
  'story.live': 'EN VIVO',
  'story.day': 'DÍA',

  'welcome.title': 'Bienvenido a Watchboard',
  'welcome.description': 'Paneles de inteligencia en tiempo real que rastrean eventos mundiales. El globo rota entre historias activas — haz clic en cualquier rastreador en la barra lateral para explorar.',
  'welcome.pauseBroadcast': 'Pausar transmisión',
  'welcome.search': 'Buscar',
  'welcome.allShortcuts': 'Todos los atajos',
  'welcome.dontShowAgain': 'No mostrar de nuevo',
  'welcome.gotIt': 'Entendido',

  'header.activeTracker': 'RASTREADOR ACTIVO',
  'header.updated': 'Actualizado',
  'header.updateUnknown': 'Hora de actualización desconocida',
  'header.3dGlobe': 'Globo 3D',
  'header.about': 'Acerca de',

  'footer.rssFeed': 'Fuente RSS',
  'footer.status': 'Estado',
  'footer.social': 'Social',
  'footer.lastUpdated': 'Última actualización:',

  'time.justNow': 'Ahora mismo',
  'time.minAgo': 'min',
  'time.hAgo': 'h',
  'time.dAgo': 'd',
  'time.day': 'DÍA',
  'time.days': 'DÍAS',
  'time.updated': 'Actualizado',
};

const fr: TranslationKeys = {
  'header.unclassified': 'NON CLASSIFIÉ',
  'header.osint': 'RENSEIGNEMENT DE SOURCES OUVERTES',
  'header.fouo': 'USAGE OFFICIEL',
  'header.home': 'Accueil Watchboard',

  'status.active': 'ACTIF',
  'status.historical': 'HISTORIQUE',
  'status.fresh': 'EN DIRECT',
  'status.recent': 'RÉCENT',
  'status.stale': 'OBSOLÈTE',
  'status.archived': 'ARCHIVÉ',
  'status.following': 'SUIVI',
  'status.follow': 'SUIVRE',

  'domain.conflict': 'CONFLIT',
  'domain.security': 'SÉCURITÉ',
  'domain.governance': 'GOUVERNANCE',
  'domain.disaster': 'CATASTROPHE',
  'domain.human-rights': 'DROITS HUMAINS',
  'domain.science': 'SCIENCE',
  'domain.space': 'ESPACE',
  'domain.economy': 'ÉCONOMIE',
  'domain.culture': 'CULTURE',
  'domain.history': 'HISTOIRE',
  'domain.tracker': 'DOSSIER',

  'cc.search': 'Rechercher des trackers... (appuyez /)',
  'cc.liveOps': 'OPÉRATIONS EN DIRECT',
  'cc.historical': 'ANALYSE HISTORIQUE',
  'cc.latestIntel': 'DERNIER RENSEIGNEMENT',
  'cc.openDashboard': 'OUVRIR LE TABLEAU',
  'cc.deselect': 'DÉSÉLECTIONNER',
  'cc.compare': 'COMPARER',
  'cc.initGlobe': 'INITIALISATION DU GLOBE',
  'cc.globeHint': 'Glisser pour pivoter · Défiler pour zoomer · Cliquer pour sélectionner',
  'cc.noResults': 'Aucun tracker ne correspond à votre recherche.',
  'cc.live': 'DIRECT',
  'cc.hist': 'HIST',

  'section.timeline': 'Chronologie',
  'section.map': 'Carte du Théâtre',
  'section.military': 'Militaire',
  'section.casualties': 'Victimes',
  'section.economic': 'Économique',
  'section.claims': 'Revendications',
  'section.political': 'Politique',

  'footer.about': 'À propos et Crédits',
  'footer.disclaimer': 'Ne soutient aucun récit en particulier.',

  'shortcuts.title': 'RACCOURCIS CLAVIER',
  'shortcuts.search': 'Recherche',
  'shortcuts.navigate': 'Naviguer les trackers',
  'shortcuts.open': 'Ouvrir le tableau',
  'shortcuts.follow': 'Suivre / ne plus suivre',
  'shortcuts.rotate': 'Alterner la rotation du globe',
  'shortcuts.cityLights': 'Alterner les lumières urbaines',
  'shortcuts.openSelected': 'Ouvrir le tracker sélectionné',
  'shortcuts.deselect': 'Désélectionner / fermer',
  'shortcuts.help': 'Afficher cette aide',
  'shortcuts.close': 'pour fermer',

  'broadcast.live': 'EN DIRECT',
  'broadcast.paused': 'EN PAUSE',
  'broadcast.resumingIn': 'Reprise dans',
  'broadcast.openDashboard': 'Ouvrir le Tableau →',
  'broadcast.tracking': 'Suivi en cours...',
  'broadcast.day': 'JOUR',
  'shortcuts.broadcast': 'Alterner le mode diffusion',

  'story.briefing': 'BRIEFING',
  'story.readMore': 'Lire la suite →',
  'story.tapToResume': 'APPUYEZ POUR REPRENDRE',
  'story.swipeHint': '← GLISSER → · APPUYEZ POUR PAUSE',
  'story.paused': 'EN PAUSE',
  'story.resumingIn': 'Reprise dans',
  'story.sectionsUpdated': 'sections mises à jour',
  'story.live': 'EN DIRECT',
  'story.day': 'JOUR',

  'welcome.title': 'Bienvenue sur Watchboard',
  'welcome.description': 'Tableaux de renseignement en temps réel suivant les événements mondiaux. Le globe parcourt les histoires actives — cliquez sur un tracker dans la barre latérale pour explorer.',
  'welcome.pauseBroadcast': 'Mettre en pause',
  'welcome.search': 'Rechercher',
  'welcome.allShortcuts': 'Tous les raccourcis',
  'welcome.dontShowAgain': 'Ne plus afficher',
  'welcome.gotIt': 'Compris',

  'header.activeTracker': 'DOSSIER ACTIF',
  'header.updated': 'Mis à jour',
  'header.updateUnknown': 'Heure de mise à jour inconnue',
  'header.3dGlobe': 'Globe 3D',
  'header.about': 'À propos',

  'footer.rssFeed': 'Flux RSS',
  'footer.status': 'Statut',
  'footer.social': 'Social',
  'footer.lastUpdated': 'Dernière mise à jour :',

  'time.justNow': 'À l\'instant',
  'time.minAgo': 'min',
  'time.hAgo': 'h',
  'time.dAgo': 'j',
  'time.day': 'JOUR',
  'time.days': 'JOURS',
  'time.updated': 'Mis à jour',
};

const pt: TranslationKeys = {
  'header.unclassified': 'NÃO CLASSIFICADO',
  'header.osint': 'INTELIGÊNCIA DE FONTES ABERTAS',
  'header.fouo': 'USO OFICIAL',
  'header.home': 'Início Watchboard',

  'status.active': 'ATIVO',
  'status.historical': 'HISTÓRICO',
  'status.fresh': 'AO VIVO',
  'status.recent': 'RECENTE',
  'status.stale': 'DESATUALIZADO',
  'status.archived': 'ARQUIVADO',
  'status.following': 'SEGUINDO',
  'status.follow': 'SEGUIR',

  'domain.conflict': 'CONFLITO',
  'domain.security': 'SEGURANÇA',
  'domain.governance': 'GOVERNANÇA',
  'domain.disaster': 'DESASTRE',
  'domain.human-rights': 'DIREITOS HUMANOS',
  'domain.science': 'CIÊNCIA',
  'domain.space': 'ESPAÇO',
  'domain.economy': 'ECONOMIA',
  'domain.culture': 'CULTURA',
  'domain.history': 'HISTÓRIA',
  'domain.tracker': 'RASTREADOR',

  'cc.search': 'Buscar trackers... (pressione /)',
  'cc.liveOps': 'OPERAÇÕES AO VIVO',
  'cc.historical': 'ANÁLISE HISTÓRICA',
  'cc.latestIntel': 'ÚLTIMA INTELIGÊNCIA',
  'cc.openDashboard': 'ABRIR PAINEL',
  'cc.deselect': 'DESSELECIONAR',
  'cc.compare': 'COMPARAR',
  'cc.initGlobe': 'INICIALIZANDO GLOBO',
  'cc.globeHint': 'Arraste para girar · Role para zoom · Clique para selecionar',
  'cc.noResults': 'Nenhum tracker corresponde à sua busca.',
  'cc.live': 'AO VIVO',
  'cc.hist': 'HIST',

  'section.timeline': 'Linha do Tempo',
  'section.map': 'Mapa do Teatro',
  'section.military': 'Militar',
  'section.casualties': 'Vítimas',
  'section.economic': 'Econômico',
  'section.claims': 'Declarações',
  'section.political': 'Político',

  'footer.about': 'Sobre e Créditos',
  'footer.disclaimer': 'Não endossa nenhuma narrativa em particular.',

  'shortcuts.title': 'ATALHOS DE TECLADO',
  'shortcuts.search': 'Focar busca',
  'shortcuts.navigate': 'Navegar trackers',
  'shortcuts.open': 'Abrir painel',
  'shortcuts.follow': 'Seguir / deixar de seguir',
  'shortcuts.rotate': 'Alternar rotação do globo',
  'shortcuts.cityLights': 'Alternar luzes urbanas',
  'shortcuts.openSelected': 'Abrir tracker selecionado',
  'shortcuts.deselect': 'Desselecionar / fechar',
  'shortcuts.help': 'Mostrar esta ajuda',
  'shortcuts.close': 'para fechar',

  'broadcast.live': 'AO VIVO',
  'broadcast.paused': 'PAUSADO',
  'broadcast.resumingIn': 'Retomando em',
  'broadcast.openDashboard': 'Abrir Painel →',
  'broadcast.tracking': 'Rastreando...',
  'broadcast.day': 'DIA',
  'shortcuts.broadcast': 'Alternar modo transmissão',

  'story.briefing': 'RESUMO',
  'story.readMore': 'Leia mais →',
  'story.tapToResume': 'TOQUE PARA RETOMAR',
  'story.swipeHint': '← DESLIZE → · TOQUE PARA PAUSAR',
  'story.paused': 'PAUSADO',
  'story.resumingIn': 'Retomando em',
  'story.sectionsUpdated': 'seções atualizadas',
  'story.live': 'AO VIVO',
  'story.day': 'DIA',

  'welcome.title': 'Bem-vindo ao Watchboard',
  'welcome.description': 'Painéis de inteligência em tempo real rastreando eventos mundiais. O globo percorre as histórias ativas — clique em qualquer tracker na barra lateral para explorar.',
  'welcome.pauseBroadcast': 'Pausar transmissão',
  'welcome.search': 'Buscar',
  'welcome.allShortcuts': 'Todos os atalhos',
  'welcome.dontShowAgain': 'Não mostrar novamente',
  'welcome.gotIt': 'Entendi',

  'header.activeTracker': 'RASTREADOR ATIVO',
  'header.updated': 'Atualizado',
  'header.updateUnknown': 'Hora de atualização desconhecida',
  'header.3dGlobe': 'Globo 3D',
  'header.about': 'Sobre',

  'footer.rssFeed': 'Feed RSS',
  'footer.status': 'Status',
  'footer.social': 'Social',
  'footer.lastUpdated': 'Última atualização:',

  'time.justNow': 'Agora mesmo',
  'time.minAgo': 'min',
  'time.hAgo': 'h',
  'time.dAgo': 'd',
  'time.day': 'DIA',
  'time.days': 'DIAS',
  'time.updated': 'Atualizado',
};

const translations: Record<Locale, TranslationKeys> = { en, es, fr, pt };

export function t(key: keyof TranslationKeys, locale: Locale = DEFAULT_LOCALE): string {
  return translations[locale]?.[key] || translations.en[key] || key;
}

export function getLocaleFromUrl(url: URL): Locale {
  const parts = url.pathname.split('/');
  const lang = parts[1]; // e.g., /es/... (first segment after root)
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
