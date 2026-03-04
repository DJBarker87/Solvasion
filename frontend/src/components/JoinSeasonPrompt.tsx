interface JoinSeasonPromptProps {
  seasonId: number;
  onJoin: () => void;
  loading: boolean;
}

export default function JoinSeasonPrompt({ seasonId, onJoin, loading }: JoinSeasonPromptProps) {
  return (
    <div className="p-4 border-b border-gray-800">
      <p className="text-gray-300 text-sm mb-2">
        Season {seasonId} is active. Join to start conquering territory.
      </p>
      <button
        onClick={onJoin}
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm py-2 rounded cursor-pointer disabled:cursor-not-allowed"
      >
        {loading ? 'Joining...' : 'Join Season'}
      </button>
    </div>
  );
}
