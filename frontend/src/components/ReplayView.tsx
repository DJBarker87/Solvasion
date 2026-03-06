import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { cellToBoundary } from 'h3-js';
import { walletFillColor, COLORS } from '../utils/hexColors';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ReplayEvent {
  t: number;
  h?: string | null;
  type: string;
  to?: string | null;
  from?: string | null;
  msg?: string;
  attacker?: string;
  defender?: string;
}

interface ReplayViewProps {
  seasonId: number;
  mapboxToken: string;
  hexH3Map: Map<string, string>; // u64 -> h3
  onExit: () => void;
}

const SPEEDS = [1, 10, 100, 1000];

export default function ReplayView({ seasonId, mapboxToken, hexH3Map, onExit }: ReplayViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('LandRush');
  const playingRef = useRef(false);
  const speedRef = useRef(speed);
  const idxRef = useRef(0);

  // Track current hex owners
  const hexOwnersRef = useRef(new Map<string, string | null>());

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Fetch replay data
  useEffect(() => {
    fetch(`${API}/api/seasons/${seasonId}/replay`)
      .then(r => r.json())
      .then(data => {
        setEvents(data.events ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [seasonId]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [10, 48],
      zoom: 4,
      minZoom: 3,
      maxZoom: 8,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      // Add all hexes as unclaimed
      const features = Array.from(hexH3Map.entries()).map(([u64, h3]) => {
        const boundary = cellToBoundary(h3);
        const coords = boundary.map(([lat, lng]) => [lng, lat]);
        coords.push(coords[0]);
        return {
          type: 'Feature' as const,
          properties: { hexId: u64, fillColor: COLORS.unownedFill },
          geometry: { type: 'Polygon' as const, coordinates: [coords] },
        };
      });

      map.addSource('hexes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });

      map.addLayer({
        id: 'hex-fill',
        type: 'fill',
        source: 'hexes',
        paint: {
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': 0.8,
        },
      });

      map.addLayer({
        id: 'hex-line',
        type: 'line',
        source: 'hexes',
        paint: {
          'line-color': '#374151',
          'line-width': 0.5,
        },
      });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [mapboxToken, hexH3Map]);

  const applyEvent = useCallback((event: ReplayEvent) => {
    if (event.type === 'phase') {
      const phase = event.msg?.match(/Phase changed to (\w+)/)?.[1] ?? currentPhase;
      setCurrentPhase(phase);
      return;
    }

    if (!event.h) return;

    if (event.type === 'claim' || event.type === 'capture') {
      hexOwnersRef.current.set(event.h, event.to ?? null);
    }

    // Update map source
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('hexes') as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const features = Array.from(hexH3Map.entries()).map(([u64, h3]) => {
      const boundary = cellToBoundary(h3);
      const coords = boundary.map(([lat, lng]) => [lng, lat]);
      coords.push(coords[0]);
      const owner = hexOwnersRef.current.get(u64);
      return {
        type: 'Feature' as const,
        properties: {
          hexId: u64,
          fillColor: owner ? walletFillColor(owner) : COLORS.unownedFill,
        },
        geometry: { type: 'Polygon' as const, coordinates: [coords] },
      };
    });

    source.setData({ type: 'FeatureCollection', features });
  }, [hexH3Map, currentPhase]);

  // Playback loop
  useEffect(() => {
    if (!playing || events.length === 0) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function step() {
      if (cancelled || !playingRef.current) return;
      const idx = idxRef.current;
      if (idx >= events.length) {
        setPlaying(false);
        return;
      }

      applyEvent(events[idx]);
      idxRef.current = idx + 1;
      setCurrentIdx(idx + 1);

      // Calculate delay based on time gap to next event
      let delay = 50;
      if (idx + 1 < events.length) {
        const gap = events[idx + 1].t - events[idx].t;
        delay = Math.max(16, (gap * 1000) / speedRef.current);
        delay = Math.min(delay, 2000); // cap at 2 seconds
      }

      timeoutId = setTimeout(step, delay);
    }

    step();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [playing, events, applyEvent]);

  // Scrub to position
  const scrubTo = useCallback((targetIdx: number) => {
    setPlaying(false);
    hexOwnersRef.current.clear();
    setCurrentPhase('LandRush');

    for (let i = 0; i < targetIdx && i < events.length; i++) {
      const e = events[i];
      if (e.type === 'phase') {
        const phase = e.msg?.match(/Phase changed to (\w+)/)?.[1];
        if (phase) setCurrentPhase(phase);
      }
      if (e.h && (e.type === 'claim' || e.type === 'capture')) {
        hexOwnersRef.current.set(e.h, e.to ?? null);
      }
    }

    // Update map
    const map = mapRef.current;
    if (map) {
      const source = map.getSource('hexes') as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        const features = Array.from(hexH3Map.entries()).map(([u64, h3]) => {
          const boundary = cellToBoundary(h3);
          const coords = boundary.map(([lat, lng]) => [lng, lat]);
          coords.push(coords[0]);
          const owner = hexOwnersRef.current.get(u64);
          return {
            type: 'Feature' as const,
            properties: {
              hexId: u64,
              fillColor: owner ? walletFillColor(owner) : COLORS.unownedFill,
            },
            geometry: { type: 'Polygon' as const, coordinates: [coords] },
          };
        });
        source.setData({ type: 'FeatureCollection', features });
      }
    }

    idxRef.current = targetIdx;
    setCurrentIdx(targetIdx);
  }, [events, hexH3Map]);

  const togglePlay = () => {
    if (currentIdx >= events.length) {
      idxRef.current = 0;
      setCurrentIdx(0);
      hexOwnersRef.current.clear();
    }
    setPlaying(p => !p);
  };

  // Format timestamp for display
  const formatTime = (ts: number) => new Date(ts * 1000).toLocaleString();

  const currentTime = events[Math.min(currentIdx, events.length - 1)]?.t;

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />

      {/* Top bar */}
      <div className="absolute top-4 left-4 z-10 bg-gray-900/90 border border-gray-700 rounded-lg p-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="text-gray-400 hover:text-white text-sm px-2 py-1 border border-gray-600 rounded"
          >
            Exit
          </button>
          <span className="text-white font-bold text-sm">Season {seasonId} Replay</span>
          <span className="text-gray-400 text-xs bg-gray-800 px-2 py-0.5 rounded">{currentPhase}</span>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 z-20">
          <span className="text-gray-300">Loading replay data...</span>
        </div>
      )}

      {/* Controls bar */}
      {!loading && events.length > 0 && (
        <div className="absolute bottom-4 left-4 right-4 z-10 bg-gray-900/90 border border-gray-700 rounded-lg p-3">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="text-white bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-sm font-medium min-w-[60px]"
            >
              {playing ? 'Pause' : currentIdx >= events.length ? 'Restart' : 'Play'}
            </button>

            <div className="flex items-center gap-1">
              {SPEEDS.map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-2 py-0.5 rounded text-xs ${speed === s ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                >
                  {s}x
                </button>
              ))}
            </div>

            <input
              type="range"
              min={0}
              max={events.length}
              value={currentIdx}
              onChange={e => scrubTo(Number(e.target.value))}
              className="flex-1 h-1.5 accent-blue-500"
            />

            <span className="text-gray-400 text-xs whitespace-nowrap">
              {currentTime ? formatTime(currentTime) : '--'}
            </span>

            <span className="text-gray-500 text-xs">
              {currentIdx}/{events.length}
            </span>
          </div>
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="bg-gray-900/90 border border-gray-700 rounded-lg p-6 text-center">
            <p className="text-gray-300 text-sm">No replay data available for this season.</p>
            <button onClick={onExit} className="mt-3 text-blue-400 hover:text-blue-300 text-sm">
              Go back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
