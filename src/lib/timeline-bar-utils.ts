import type { FlatEvent } from './timeline-utils';
import type { MapLine } from './schemas';

// ── Zoom types & helpers ──

export type TimelineZoomLevel = 'all' | 'year' | 'quarter' | 'month' | 'week' | 'day';

export const ZOOM_DAYS: Record<TimelineZoomLevel, number> = {
  all: Infinity, year: 365, quarter: 90, month: 30, week: 7, day: 1,
};

export const ZOOM_LABELS: Record<TimelineZoomLevel, string> = {
  all: 'ALL', year: 'YR', quarter: 'QTR', month: 'MO', week: 'WK', day: 'DAY',
};

export function computeZoomWindow(
  currentDate: string, minDate: string, maxDate: string, zoomLevel: TimelineZoomLevel,
): { viewMin: string; viewMax: string } {
  if (zoomLevel === 'all') return { viewMin: minDate, viewMax: maxDate };
  const windowDays = ZOOM_DAYS[zoomLevel];
  const halfWindow = Math.floor(windowDays / 2);
  const currentMs = new Date(currentDate + 'T00:00:00Z').getTime();
  const minMs = new Date(minDate + 'T00:00:00Z').getTime();
  const maxMs = new Date(maxDate + 'T00:00:00Z').getTime();
  const dayMs = 86400000;
  let viewMinMs = currentMs - halfWindow * dayMs;
  let viewMaxMs = viewMinMs + windowDays * dayMs;
  if (viewMinMs < minMs) { viewMinMs = minMs; viewMaxMs = Math.min(minMs + windowDays * dayMs, maxMs); }
  if (viewMaxMs > maxMs) { viewMaxMs = maxMs; viewMinMs = Math.max(maxMs - windowDays * dayMs, minMs); }
  return {
    viewMin: new Date(viewMinMs).toISOString().split('T')[0],
    viewMax: new Date(viewMaxMs).toISOString().split('T')[0],
  };
}

export function availableZoomLevels(totalDays: number): TimelineZoomLevel[] {
  if (totalDays <= 1) return [];
  const levels: TimelineZoomLevel[] = ['all'];
  if (totalDays > 365) levels.push('year');
  if (totalDays > 90) levels.push('quarter');
  if (totalDays > 30) levels.push('month');
  if (totalDays > 7) levels.push('week');
  if (totalDays > 1) levels.push('day');
  return levels;
}

export function shiftPeriod(
  currentDate: string, minDate: string, maxDate: string,
  zoomLevel: TimelineZoomLevel, direction: 1 | -1,
): string {
  if (zoomLevel === 'all') return currentDate;
  const shiftDays = ZOOM_DAYS[zoomLevel];
  const currentMs = new Date(currentDate + 'T00:00:00Z').getTime();
  const minMs = new Date(minDate + 'T00:00:00Z').getTime();
  const maxMs = new Date(maxDate + 'T00:00:00Z').getTime();
  const newMs = Math.max(minMs, Math.min(maxMs, currentMs + direction * shiftDays * 86400000));
  return new Date(newMs).toISOString().split('T')[0];
}

// ── Date/time helpers ──

export function dateToDay(date: string, minDate: string): number {
  return Math.round(
    (new Date(date + 'T00:00:00Z').getTime() - new Date(minDate + 'T00:00:00Z').getTime()) / 86400000,
  );
}

export function dayToDate(day: number, minDate: string): string {
  const d = new Date(minDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().split('T')[0];
}

export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTZ(ms: number, offsetHours: number): string {
  const d = new Date(ms + offsetHours * 3600000);
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
}

export function formatHHMM(minutes: number): string {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}

export function prevEventDate(current: string, dates: string[]): string {
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] < current) return dates[i];
  }
  return current;
}

export function nextEventDate(current: string, dates: string[]): string {
  for (const d of dates) {
    if (d > current) return d;
  }
  return current;
}

// ── Color constants ──

export const EVENT_TYPE_COLORS: Record<string, string> = {
  military: '#e74c3c', diplomatic: '#3498db', humanitarian: '#f39c12', economic: '#2ecc71',
};

export const LINE_CAT_COLORS: Record<string, string> = {
  strike: '#e74c3c', retaliation: '#f39c12', asset: '#3498db', front: '#ff44ff',
};

// ── Stats interface ──

export interface StatsData {
  locations: number; vectors: number;
  sats?: number; fov?: number; flights?: number; flightStatus?: string;
  quakes?: number; wx?: number; nfz?: number;
  ships?: number; shipNoKey?: boolean;
  gpsJam?: number; internetBlackout?: number; groundTruth?: number;
  historical?: boolean;
}

// ── Speed presets ──

export const SPEEDS_2D = [
  { label: '1x', value: 200 },
  { label: '2x', value: 100 },
  { label: '5x', value: 50 },
  { label: '10x', value: 25 },
  { label: 'Auto', value: 10 },
];

export const SPEEDS_3D = [
  { label: '1x', value: 1 }, { label: '2x', value: 2 },
  { label: '5x', value: 5 }, { label: '10x', value: 10 },
  { label: '30x', value: 30 }, { label: '1m', value: 60 },
  { label: '5m', value: 300 }, { label: '10m', value: 600 },
  { label: '30m', value: 1800 }, { label: '1hr', value: 3600 },
  { label: '2hr', value: 7200 }, { label: '3hr', value: 10800 },
  { label: '5hr', value: 18000 }, { label: '10hr', value: 36000 },
  { label: '24hr', value: 86400 },
];
