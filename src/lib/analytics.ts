declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
      register: (properties: Record<string, unknown>) => void;
    };
  }
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (typeof window !== 'undefined' && window.posthog) {
    window.posthog.capture(name, props);
  }
}
