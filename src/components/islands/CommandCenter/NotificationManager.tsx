import { useEffect, useRef } from 'react';
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
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current || followedSlugs.length === 0) return;
    hasRun.current = true;

    // Only run if notifications are supported and permitted
    if (!('Notification' in window)) return;
    if (Notification.permission === 'denied') return;

    const lastSeen = localStorage.getItem(NOTIF_KEY);
    const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0;

    // Save current visit time
    localStorage.setItem(NOTIF_KEY, new Date().toISOString());

    if (!lastSeenTime) return; // First visit, don't notify

    // Find followed trackers updated since last visit
    const updatedTrackers = trackers.filter(t =>
      followedSlugs.includes(t.slug) &&
      new Date(t.lastUpdated).getTime() > lastSeenTime
    );

    if (updatedTrackers.length === 0) return;

    // Request permission if needed, then notify
    const showNotifications = () => {
      for (const t of updatedTrackers.slice(0, 3)) {
        const title = `${t.icon || ''} ${t.shortName} updated`;
        const body = t.headline
          ? t.headline.slice(0, 100)
          : `New data available for ${t.shortName}`;

        try {
          new Notification(title, {
            body,
            icon: '/textures/earth-night.jpg',
            tag: `wb-${t.slug}`,
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
