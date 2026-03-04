import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import MapView from './components/Map/MapView';
import HexInfoPanel from './components/Map/HexInfoPanel';
import Sidebar from './components/Sidebar/Sidebar';
import TxToast from './components/TxToast';
import JoinSeasonPrompt from './components/JoinSeasonPrompt';
import GarrisonModal from './components/GarrisonModal';
import AttackModal from './components/AttackModal';
import RevealPrompt from './components/RevealPrompt';
import { useActiveSeason } from './hooks/useSeasonData';
import { useMapData } from './hooks/useMapData';
import { useLeaderboard } from './hooks/useLeaderboard';
import { useWarFeed } from './hooks/useWarFeed';
import { usePlayerData } from './hooks/usePlayerData';
import { useGameActions } from './hooks/useGameActions';
import { useWebSocket, type WsEvent } from './hooks/useWebSocket';
import { useGuardian } from './hooks/useGuardian';
import { loadMapData, type MapLookups } from './utils/mapData';
import { getAdjacent } from './utils/adjacency';
import { buildHexGeoJson, buildStaticHexGeoJson } from './utils/hexGeoJson';
import { fetchPendingAttacks } from './api';
import { findSeasonCounters } from './solana/pda';
import type { EnrichedHex, Attack } from './types';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function App() {
  const [lookups, setLookups] = useState<MapLookups | null>(null);
  const [selectedHexId, setSelectedHexId] = useState<string | null>(null);
  const [garrisonHexId, setGarrisonHexId] = useState<string | null>(null);
  const [attackHexId, setAttackHexId] = useState<string | null>(null);
  const [pendingAttacks, setPendingAttacks] = useState<Attack[]>([]);

  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const walletStr = publicKey?.toBase58() ?? null;

  // Load static map data
  useEffect(() => {
    loadMapData().then(setLookups);
  }, []);

  // Season + live data
  const { season, loading: seasonLoading, error: seasonError } = useActiveSeason();
  const seasonId = season?.season_id ?? null;
  const { hexes, refresh: refreshMap } = useMapData(seasonId, lookups);
  const players = useLeaderboard(seasonId);
  const feedItems = useWarFeed(seasonId);
  const { player: playerData, refresh: refreshPlayer } = usePlayerData(seasonId);

  // Game actions
  const refreshAll = useCallback(() => {
    refreshMap();
    refreshPlayer();
  }, [refreshMap, refreshPlayer]);

  const guardian = useGuardian();
  const gameActions = useGameActions(refreshAll, guardian);

  // WebSocket for real-time updates
  const handleWsEvent = useCallback((evt: WsEvent) => {
    const { event, data } = evt;
    const involved = (data.involved_players as string[] | undefined) ?? [];
    const isMe = walletStr && (
      involved.includes(walletStr) ||
      data.player === walletStr ||
      data.attacker === walletStr ||
      data.defender === walletStr
    );

    if (['HexClaimed', 'AttackResolved', 'DefenceIncreased', 'DefenceWithdrawn'].includes(event)) {
      refreshMap();
    }
    if (event === 'AttackLaunched' && data.defender === walletStr) {
      // Incoming attack — refresh pending attacks immediately
      if (seasonId && walletStr) {
        fetchPendingAttacks(seasonId, walletStr).then(setPendingAttacks).catch(() => {});
      }
    }
    if (isMe) {
      refreshPlayer();
    }
  }, [walletStr, seasonId, refreshMap, refreshPlayer]);

  const handleFullSync = useCallback(() => {
    refreshMap();
    refreshPlayer();
  }, [refreshMap, refreshPlayer]);

  const { connected: wsConnected } = useWebSocket({
    seasonId,
    wallet: walletStr,
    onEvent: handleWsEvent,
    onFullSyncRequired: handleFullSync,
  });

  // Owned hex IDs for adjacency checks
  const ownedHexIds = useMemo(() => {
    const set = new Set<string>();
    if (!walletStr) return set;
    for (const h of hexes) {
      if (h.owner === walletStr) set.add(h.hexId);
    }
    return set;
  }, [hexes, walletStr]);

  // Poll for pending attacks against this player
  useEffect(() => {
    if (!seasonId || !walletStr) {
      setPendingAttacks([]);
      return;
    }
    const poll = () => {
      fetchPendingAttacks(seasonId, walletStr).then(setPendingAttacks).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  }, [seasonId, walletStr]);

  // Build GeoJSON
  const geoJson = lookups
    ? hexes.length > 0
      ? buildHexGeoJson(hexes)
      : buildStaticHexGeoJson(
          lookups.allH3Ids,
          lookups.allU64Ids,
          new Map(Array.from(lookups.regionSummary.entries()).map(([k, v]) => [k, v.name])),
          lookups.u64ToRegionId,
          lookups.landmarksByU64,
        )
    : null;

  // Find selected hex
  const selectedHex: EnrichedHex | null =
    selectedHexId ? (hexes.length > 0 ? hexes : []).find((h) => h.hexId === selectedHexId) ?? null : null;

  // Find hex for attack modal
  const attackTargetHex: EnrichedHex | null =
    attackHexId ? hexes.find(h => h.hexId === attackHexId) ?? null : null;

  const handleHexClick = useCallback((hexId: string) => {
    setSelectedHexId((prev) => (prev === hexId ? null : hexId));
  }, []);

  // --- Action handlers ---

  const handleJoin = useCallback(async () => {
    if (seasonId) await gameActions.joinSeason(seasonId);
  }, [seasonId, gameActions]);

  const handleClaim = useCallback(async (hexId: string) => {
    if (!seasonId) return;
    // Find an owned adjacent hex (null for first claim)
    const adjacent = getAdjacent(hexId);
    const adjacentOwned = Array.from(adjacent).find(id => ownedHexIds.has(id)) ?? null;
    await gameActions.claimHex(seasonId, hexId, adjacentOwned);
  }, [seasonId, gameActions, ownedHexIds]);

  const handleGarrison = useCallback((hexId: string) => {
    setGarrisonHexId(hexId);
  }, []);

  const handleAttack = useCallback((hexId: string) => {
    setAttackHexId(hexId);
  }, []);

  const handleCommitDefence = useCallback(async (hexIds: string[], amounts: number[]) => {
    if (seasonId) await gameActions.commitDefence(seasonId, hexIds, amounts);
  }, [seasonId, gameActions]);

  const handleIncreaseDefence = useCallback(async (hexId: string, newTotal: number, delta: number) => {
    if (seasonId) await gameActions.increaseDefence(seasonId, hexId, newTotal, delta);
  }, [seasonId, gameActions]);

  const handleWithdrawDefence = useCallback(async (hexId: string) => {
    if (seasonId) await gameActions.withdrawDefence(seasonId, hexId);
  }, [seasonId, gameActions]);

  const handleLaunchAttack = useCallback(async (targetHexId: string, originHexId: string, energy: number) => {
    if (!seasonId || !publicKey) return;
    const targetHex = hexes.find(h => h.hexId === targetHexId);
    if (!targetHex?.owner) return;

    try {
      // Read next_attack_id from on-chain SeasonCounters
      const [countersPda] = findSeasonCounters(seasonId);
      const info = await connection.getAccountInfo(countersPda);
      if (!info?.data) throw new Error('Could not read SeasonCounters');
      // Layout: 8 (discriminator) + 8 (season_id u64) + 4 (player_count u32) + 4 (total_hexes_claimed u32) + 8 (next_attack_id u64)
      const nextAttackId = Number(info.data.readBigUInt64LE(24));
      await gameActions.launchAttack(seasonId, targetHexId, originHexId, energy, targetHex.owner, nextAttackId);
    } catch (err) {
      console.error('Failed to launch attack:', err);
    }
  }, [seasonId, hexes, gameActions, publicKey, connection]);

  const handleReveal = useCallback(async (attackId: number, hexId: string, attackerWallet: string) => {
    if (seasonId) await gameActions.revealDefence(seasonId, attackId, hexId, attackerWallet);
  }, [seasonId, gameActions]);

  const isJoined = !!playerData;
  const showJoinPrompt = walletStr && !isJoined && seasonId && season?.phase !== 'Ended';

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-950 text-gray-400">
        <div className="text-center">
          <p className="text-lg mb-2">Missing Mapbox token</p>
          <p className="text-sm">Set <code className="text-gray-300">VITE_MAPBOX_TOKEN</code> in <code className="text-gray-300">.env</code></p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex">
      {/* Map */}
      <div className="flex-1 relative">
        <MapView
          token={MAPBOX_TOKEN}
          geoJson={geoJson}
          selectedHexId={selectedHexId}
          onHexClick={handleHexClick}
        />

        {/* Incoming attack alerts */}
        <RevealPrompt attacks={pendingAttacks} onReveal={handleReveal} />

        <HexInfoPanel
          hex={selectedHex}
          onClose={() => setSelectedHexId(null)}
          playerWallet={walletStr}
          playerData={playerData}
          seasonId={seasonId}
          ownedHexIds={ownedHexIds}
          seasonPhase={season?.phase ?? null}
          onClaim={handleClaim}
          onGarrison={handleGarrison}
          onAttack={handleAttack}
        />

        {/* Loading/error overlays */}
        {seasonLoading && (
          <div className="absolute top-4 left-4 bg-gray-900/80 text-gray-300 text-xs px-3 py-1.5 rounded">
            Loading season...
          </div>
        )}
        {seasonError && (
          <div className="absolute top-4 left-4 bg-red-900/80 text-red-300 text-xs px-3 py-1.5 rounded">
            Backend offline — showing static map
          </div>
        )}
      </div>

      {/* Sidebar */}
      <Sidebar
        season={season}
        players={players}
        feedItems={feedItems}
        playerData={playerData}
        connected={wsConnected}
        guardianEnabled={guardian.enabled}
        onGuardianToggle={guardian.toggle}
        guardianSyncedCount={guardian.syncedHexes.size}
        guardianTotalHexes={playerData?.hex_count ?? 0}
        onGuardianSyncAll={seasonId ? () => guardian.syncAll(seasonId) : undefined}
      >
        {showJoinPrompt && (
          <JoinSeasonPrompt
            seasonId={seasonId!}
            onJoin={handleJoin}
            loading={gameActions.tx?.state === 'pending'}
          />
        )}
      </Sidebar>

      {/* Garrison Modal */}
      {garrisonHexId && playerData && seasonId && walletStr && (
        <GarrisonModal
          hexId={garrisonHexId}
          seasonId={seasonId}
          wallet={walletStr}
          playerData={playerData}
          onCommit={handleCommitDefence}
          onIncrease={handleIncreaseDefence}
          onWithdraw={handleWithdrawDefence}
          onClose={() => setGarrisonHexId(null)}
        />
      )}

      {/* Attack Modal */}
      {attackTargetHex && playerData && season && (
        <AttackModal
          targetHex={attackTargetHex}
          season={season}
          playerData={playerData}
          ownedHexIds={ownedHexIds}
          onAttack={handleLaunchAttack}
          onClose={() => setAttackHexId(null)}
        />
      )}

      {/* Transaction Toast */}
      <TxToast tx={gameActions.tx} onDismiss={gameActions.clearTx} />
    </div>
  );
}
