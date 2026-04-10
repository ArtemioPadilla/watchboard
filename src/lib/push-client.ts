/**
 * Client-side push notification utilities.
 * Handles subscription lifecycle with the service worker and backend API.
 */

const API_BASE = '/api/push';
const PUSH_PREFS_KEY = 'watchboard-push-prefs';

export interface PushPrefs {
  endpoint: string;
  trackers: string[];
  categories: string[];
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Check if push notifications are supported in this browser */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Get the VAPID public key from the server */
export async function getVapidPublicKey(): Promise<string> {
  const res = await fetch(`${API_BASE}/subscribe`);
  if (!res.ok) throw new Error('Failed to fetch VAPID key');
  const data = await res.json();
  return data.publicKey;
}

/** Get the current push subscription from the service worker */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Subscribe to push notifications for the given trackers */
export async function subscribeToPush(
  trackers: string[],
  categories: string[] = ['breaking', 'daily']
): Promise<PushSubscription> {
  const vapidPublicKey = await getVapidPublicKey();
  const reg = await navigator.serviceWorker.ready;

  // Request notification permission if needed
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  // Subscribe with the push manager
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });

  // Register with our backend
  const res = await fetch(`${API_BASE}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      trackers,
      categories,
    }),
  });

  if (!res.ok) {
    // Undo browser subscription if backend fails
    await subscription.unsubscribe();
    throw new Error('Failed to register subscription with server');
  }

  // Save prefs locally for offline viewing
  const prefs: PushPrefs = { endpoint: subscription.endpoint, trackers, categories };
  localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(prefs));

  return subscription;
}

/** Unsubscribe from all push notifications */
export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getCurrentSubscription();
  if (!subscription) return;

  await fetch(`${API_BASE}/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });

  await subscription.unsubscribe();
  localStorage.removeItem(PUSH_PREFS_KEY);
}

/** Update tracker preferences for an existing subscription */
export async function updatePreferences(
  trackers: string[],
  categories?: string[]
): Promise<void> {
  const subscription = await getCurrentSubscription();
  if (!subscription) {
    throw new Error('No active subscription');
  }

  const body: Record<string, unknown> = { endpoint: subscription.endpoint, trackers };
  if (categories) body.categories = categories;

  const res = await fetch(`${API_BASE}/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error('Failed to update preferences');

  // Update local prefs
  const prefs = getLocalPrefs();
  if (prefs) {
    prefs.trackers = trackers;
    if (categories) prefs.categories = categories;
    localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(prefs));
  }
}

/** Get locally cached preferences (works offline) */
export function getLocalPrefs(): PushPrefs | null {
  try {
    const raw = localStorage.getItem(PUSH_PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
