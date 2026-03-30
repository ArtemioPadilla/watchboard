import { useState, useEffect, useRef } from 'react';
import {
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  VerticalOrigin,
  HorizontalOrigin,
  HeightReference,
  LabelStyle,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';

/** AIS position report from AISStream.io WebSocket */
interface AisPositionReport {
  MessageType: string;
  Message: {
    UserID: number;
    Latitude: number;
    Longitude: number;
    Cog: number;
    Sog: number;
    Heading: number;
    NavigationStatus: number;
  };
  MetaData: {
    MMSI: string;
    ShipName: string;
    Latitude: number;
    Longitude: number;
    time_utc: string;
  };
}

/** Tracked ship state */
interface ShipState {
  entity: Entity;
  lastSeen: number;
}

/** NavigationStatus: 0=underway engine, 1=at anchor, 5=moored, 7=fishing, 8=sailing */
function classifyShip(navStatus: number, speed: number): { color: string; size: number; isAnchored: boolean } {
  if (navStatus === 1 || navStatus === 5 || speed < 0.5) {
    return { color: '#888888', size: 3, isAnchored: true };
  }
  if (navStatus === 0 && speed > 0.5) {
    return { color: '#00ddaa', size: 5, isAnchored: false };
  }
  return { color: '#00aa88', size: 3, isAnchored: false };
}

const LS_KEY = 'aisstream-api-key';

/** Read AIS API key from localStorage */
export function getStoredAisKey(): string {
  try { return localStorage.getItem(LS_KEY) || ''; } catch { return ''; }
}

/** Save AIS API key to localStorage */
export function setStoredAisKey(key: string): void {
  try {
    if (key) localStorage.setItem(LS_KEY, key);
    else localStorage.removeItem(LS_KEY);
  } catch { /* localStorage unavailable */ }
}

// Theater bounding box: lat 12-42N, lon 24-65E
const BOUNDING_BOX: [[number, number], [number, number]] = [[12, 24], [42, 65]];

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60 seconds
const MAX_BACKOFF_MS = 60_000;
const INITIAL_BACKOFF_MS = 5_000;

/** Live AIS ship tracking via AISStream.io WebSocket */
export function useShips(viewer: CesiumViewer | null, enabled: boolean, apiKey: string) {
  const [count, setCount] = useState(0);
  const shipsRef = useRef<Map<string, ShipState>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cleanupTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!enabled || !viewer || !apiKey) return;

    let disposed = false;

    function connect() {
      if (disposed || !viewer || viewer.isDestroyed()) return;

      const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = INITIAL_BACKOFF_MS;
        const subscription = {
          APIKey: apiKey,
          BoundingBoxes: [BOUNDING_BOX],
          FilterMessageTypes: ['PositionReport'],
        };
        ws.send(JSON.stringify(subscription));
      };

      ws.onmessage = (event) => {
        if (disposed || !viewer || viewer.isDestroyed()) return;

        try {
          const data: AisPositionReport = JSON.parse(event.data);
          if (data.MessageType !== 'PositionReport') return;

          const mmsi = data.MetaData.MMSI;
          const msg = data.Message;
          const meta = data.MetaData;
          const lat = meta.Latitude || msg.Latitude;
          const lon = meta.Longitude || msg.Longitude;

          if (lat == null || lon == null || lat === 0 || lon === 0) return;

          const { color, size, isAnchored } = classifyShip(msg.NavigationStatus, msg.Sog);
          const pos = Cartesian3.fromDegrees(lon, lat, 0);
          const now = Date.now();

          const existing = shipsRef.current.get(mmsi);
          if (existing) {
            existing.entity.position = pos as any;
            existing.lastSeen = now;

            // Update point color/size in case status changed
            if (existing.entity.point) {
              (existing.entity.point.color as any) = Color.fromCssColorString(color);
              (existing.entity.point.pixelSize as any) = size;
            }

            // Show/hide label based on anchored status
            if (existing.entity.label) {
              (existing.entity.label.show as any) = !isAnchored;
            }
          } else {
            const shipName = (meta.ShipName || '').trim();
            const navLabel = msg.NavigationStatus === 0 ? 'Underway'
              : msg.NavigationStatus === 1 ? 'At Anchor'
              : msg.NavigationStatus === 5 ? 'Moored'
              : msg.NavigationStatus === 7 ? 'Fishing'
              : msg.NavigationStatus === 8 ? 'Sailing'
              : `Status ${msg.NavigationStatus}`;
            const entity = viewer.entities.add({
              name: `${shipName || mmsi} (MMSI: ${mmsi})`,
              description: `MMSI: ${mmsi}\nName: ${shipName || 'N/A'}\nHeading: ${msg.Heading != null ? msg.Heading + '\u00b0' : 'N/A'}\nSpeed: ${msg.Sog != null ? msg.Sog.toFixed(1) + ' kn' : 'N/A'}\nCourse: ${msg.Cog != null ? msg.Cog.toFixed(1) + '\u00b0' : 'N/A'}\nStatus: ${navLabel}`,
              position: pos,
              point: {
                pixelSize: size,
                color: Color.fromCssColorString(color),
                outlineColor: Color.fromCssColorString(color).withAlpha(0.4),
                outlineWidth: 1,
                scaleByDistance: new NearFarScalar(1e4, 1.5, 5e6, 0.4),
                heightReference: HeightReference.CLAMP_TO_GROUND,
              },
              label: !isAnchored && shipName
                ? {
                    text: shipName,
                    font: "9px 'JetBrains Mono', monospace",
                    fillColor: Color.fromCssColorString(color).withAlpha(0.9),
                    outlineColor: Color.BLACK.withAlpha(0.6),
                    outlineWidth: 2,
                    style: LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new Cartesian3(0, -10, 0) as any,
                    scaleByDistance: new NearFarScalar(1e4, 1.0, 2e6, 0.3),
                    distanceDisplayCondition: new DistanceDisplayCondition(0, 2e6),
                    verticalOrigin: VerticalOrigin.BOTTOM,
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    heightReference: HeightReference.CLAMP_TO_GROUND,
                  }
                : undefined,
            });
            shipsRef.current.set(mmsi, { entity, lastSeen: now });
          }

          setCount(shipsRef.current.size);
        } catch {
          // Malformed message — skip silently
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!disposed) {
          reconnectTimerRef.current = setTimeout(() => {
            backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
            connect();
          }, backoffRef.current);
        }
      };

      ws.onerror = () => {
        // Will trigger onclose which handles reconnection
        ws.close();
      };
    }

    // Start connection
    connect();

    // Stale cleanup interval
    cleanupTimerRef.current = setInterval(() => {
      if (!viewer || viewer.isDestroyed()) return;
      const now = Date.now();
      for (const [mmsi, ship] of shipsRef.current) {
        if (now - ship.lastSeen > STALE_THRESHOLD_MS) {
          try { viewer.entities.remove(ship.entity); } catch { /* already removed */ }
          shipsRef.current.delete(mmsi);
        }
      }
      setCount(shipsRef.current.size);
    }, CLEANUP_INTERVAL_MS);

    return () => {
      disposed = true;

      // Close WebSocket
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnection
        wsRef.current.close();
        wsRef.current = null;
      }

      // Clear timers
      clearTimeout(reconnectTimerRef.current);
      clearInterval(cleanupTimerRef.current);

      // Remove all entities
      if (!viewer.isDestroyed()) {
        shipsRef.current.forEach((ship) => {
          try { viewer.entities.remove(ship.entity); } catch { /* already removed */ }
        });
      }
      shipsRef.current.clear();
      setCount(0);
    };
  }, [enabled, viewer, apiKey]);

  return { count };
}
