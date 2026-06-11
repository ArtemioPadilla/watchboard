import { useEffect, useRef } from 'react';
import { t as translate, getPreferredLocale } from '../../../i18n/translations';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';

const NOTIF_KEY = 'watchboard-last-seen';

interface Props {
  trackers: TrackerCardData[];
  followedSlugs: string[];
}

/**
 * Checks for new updates on followed trackers by comparing lastUpdated
 * timestamps against the last time the user visited. Shows browser
 * notifications for trackers that have been updated since.
 */
export default function NotificationManager({ trackers, followedSlugs }: Props) {
  // Last-seen timestamp is read (and bumped) once per visit; the effect
  // itself re-runs when followedSlugs changes so trackers followed during
  // the session still get their notification without a reload.
  const lastSeenTimeRef = useRef<number | null>(null);
  const notifiedSlugs = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (followedSlugs.length === 0) return;

    // Only run if notifications are supported and permitted
    if (!('Notification' in window)) return;
    if (Notification.permission === 'denied') return;

    if (lastSeenTimeRef.current === null) {
      const lastSeen = localStorage.getItem(NOTIF_KEY);
      lastSeenTimeRef.current = lastSeen ? new Date(lastSeen).getTime() : 0;
      // Save current visit time
      localStorage.setItem(NOTIF_KEY, new Date().toISOString());
    }
    const lastSeenTime = lastSeenTimeRef.current;

    if (!lastSeenTime) return; // First visit, don't notify

    // Find followed trackers updated since last visit (skip already-notified)
    const updatedTrackers = trackers.filter(t =>
      followedSlugs.includes(t.slug) &&
      !notifiedSlugs.current.has(t.slug) &&
      new Date(t.lastUpdated).getTime() > lastSeenTime
    );

    if (updatedTrackers.length === 0) return;

    // Request permission if needed, then notify
    const locale = getPreferredLocale();
    const showNotifications = () => {
      for (const tr of updatedTrackers.slice(0, 3)) {
        notifiedSlugs.current.add(tr.slug);
        const title = `${tr.icon || ''} ${tr.shortName} ${translate('notify.updated', locale)}`;
        const body = tr.headline
          ? tr.headline.slice(0, 100)
          : `${translate('notify.newData', locale)} ${tr.shortName}`;

        try {
          new Notification(title, {
            body,
            icon: '/textures/earth-dark-blend-4k.webp',
            tag: `wb-${tr.slug}`,
            silent: true,
          });
        } catch {}
      }
    };

    if (Notification.permission === 'granted') {
      showNotifications();
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') showNotifications();
      });
    }
  }, [trackers, followedSlugs]);

  return null;
}
