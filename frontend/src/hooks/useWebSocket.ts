import { useEffect, useRef, useState, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function deriveWsUrl(): string {
  return API.replace(/^http/, 'ws') + '/ws';
}

interface UseWebSocketOptions {
  seasonId: number | null;
  wallet: string | null;
  onEvent: (event: WsEvent) => void;
  onFullSyncRequired: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface WsEvent {
  event_id?: number;
  event: string;
  data: Record<string, unknown>;
  tx: string;
  timestamp: number;
  replay?: boolean;
}

export function useWebSocket({
  seasonId,
  wallet,
  onEvent,
  onFullSyncRequired,
  onConnectionChange,
}: UseWebSocketOptions): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const lastEventIdRef = useRef<number>(0);
  const retryRef = useRef<number>(1000);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Keep callbacks stable via refs
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onFullSyncRef = useRef(onFullSyncRequired);
  onFullSyncRef.current = onFullSyncRequired;
  const onConnRef = useRef(onConnectionChange);
  onConnRef.current = onConnectionChange;

  const updateConnected = useCallback((val: boolean) => {
    setConnected(val);
    onConnRef.current?.(val);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!seasonId) {
      // Clean up if no season
      wsRef.current?.close();
      wsRef.current = null;
      updateConnected(false);
      return;
    }

    let intentionallyClosed = false;

    function connect() {
      if (!mountedRef.current || intentionallyClosed) return;

      const ws = new WebSocket(deriveWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        retryRef.current = 1000; // reset backoff
        updateConnected(true);

        // Subscribe to season
        const sub: Record<string, unknown> = { season_id: seasonId };
        if (wallet) sub.wallet = wallet;
        if (lastEventIdRef.current > 0) sub.resume_from = lastEventIdRef.current;
        ws.send(JSON.stringify(sub));
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          // Control messages
          if (msg.subscribed != null) return;
          if (msg.replay_complete) return;
          if (msg.full_sync_required) {
            onFullSyncRef.current();
            return;
          }
          if (msg.error) {
            console.warn('[WS] Server error:', msg.error);
            return;
          }

          // Event message
          if (msg.event) {
            if (msg.event_id != null && msg.event_id > lastEventIdRef.current) {
              lastEventIdRef.current = msg.event_id;
            }
            onEventRef.current(msg as WsEvent);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        updateConnected(false);
        if (!intentionallyClosed) {
          // Reconnect with exponential backoff
          const delay = retryRef.current;
          retryRef.current = Math.min(delay * 2, 15000);
          retryTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // onclose will fire after this
      };
    }

    connect();

    return () => {
      intentionallyClosed = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      updateConnected(false);
      // Reset cursor on season change
      lastEventIdRef.current = 0;
    };
  }, [seasonId, wallet, updateConnected]);

  return { connected };
}
