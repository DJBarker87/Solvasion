import { useEffect, useRef } from 'react';
import type { FeedItem } from '../../types';

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const EVENT_COLORS: Record<string, string> = {
  attack_launched: 'text-red-400',
  attack_won: 'text-red-300',
  defence_won: 'text-green-400',
  hex_claimed: 'text-blue-400',
  hex_captured: 'text-orange-400',
  timeout_resolved: 'text-yellow-400',
  victory_claimed: 'text-yellow-300',
};

interface WarFeedProps {
  items: FeedItem[];
}

export default function WarFeed({ items }: WarFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items.length]);

  return (
    <div className="p-4 flex-1 min-h-0 flex flex-col">
      <h3 className="text-gray-400 text-xs font-semibold uppercase mb-2">War Feed</h3>
      {items.length === 0 ? (
        <p className="text-gray-600 text-xs">No events yet</p>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1 text-xs">
          {items.map((item) => (
            <div key={item.feed_id} className="flex gap-2">
              <span className="text-gray-600 shrink-0">{formatTime(item.created_at)}</span>
              <span className={EVENT_COLORS[item.event_type] ?? 'text-gray-300'}>
                {item.message}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
