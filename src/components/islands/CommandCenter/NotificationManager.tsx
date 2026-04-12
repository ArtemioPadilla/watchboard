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
    const locale = getPreferredLocale();
    const showNotifications = () => {
      for (const tr of updatedTrackers.slice(0, 3)) {
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
