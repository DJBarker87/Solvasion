import { useState } from 'react';

const ITEMS = [
  { color: 'bg-gray-600', border: '', label: 'Unclaimed' },
  { color: 'bg-indigo-500', border: '', label: 'Your territory' },
  { color: 'bg-emerald-600', border: '', label: 'Enemy territory' },
  { color: '', border: 'border-2 border-yellow-400', label: 'Landmark' },
  { color: '', border: 'border-2 border-orange-500 border-dashed', label: 'Under attack' },
  { color: '', border: 'border-2 border-green-400', label: 'Garrisoned' },
];

interface MapLegendProps {
  fogEnabled?: boolean;
  onFogToggle?: () => void;
}

export default function MapLegend({ fogEnabled, onFogToggle }: MapLegendProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="absolute bottom-4 right-4 z-10">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="bg-gray-900/90 border border-gray-700 text-gray-400 text-xs px-2 py-1 rounded cursor-pointer hover:text-white"
      >
        {collapsed ? 'Legend' : 'Hide'}
      </button>
      {!collapsed && (
        <div className="bg-gray-900/90 border border-gray-700 rounded-lg p-3 mt-1 min-w-[140px]">
          <div className="space-y-1.5">
            {ITEMS.map(item => (
              <div key={item.label} className="flex items-center gap-2 text-xs">
                <div className={`w-4 h-3 rounded-sm ${item.color} ${item.border}`} />
                <span className="text-gray-300">{item.label}</span>
              </div>
            ))}
          </div>
          {onFogToggle && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <button
                onClick={onFogToggle}
                className="flex items-center gap-2 text-xs text-gray-300 hover:text-white w-full"
              >
                <div className={`w-3 h-3 rounded-sm border ${fogEnabled ? 'bg-blue-500 border-blue-400' : 'bg-gray-700 border-gray-600'}`} />
                <span>Fog of War</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
