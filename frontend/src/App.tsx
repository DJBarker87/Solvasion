import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
const MapView = React.lazy(() => import('./components/Map/MapView'));
import HexInfoPanel from './components/Map/HexInfoPanel';
import MapLegend from './components/Map/MapLegend';
import Sidebar from './components/Sidebar/Sidebar';
import TxToast from './components/TxToast';
import JoinSeasonPrompt from './components/JoinSeasonPrompt';
import GarrisonModal from './components/GarrisonModal';
import AttackModal from './components/AttackModal';
import RevealPrompt from './components/RevealPrompt';
import BattleReportModal, { type BattleReport } from './components/BattleReportModal';
import ReplayView from './components/ReplayView';
import OnboardingModal from './components/OnboardingModal';
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
import { buildHexGeoJson, buildStaticHexGeoJson, type FogOptions } from './utils/hexGeoJson';
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
  const [nextAttackId, setNextAttackId] = useState<number | null>(null);
  const [battleReport, setBattleReport] = useState<BattleReport | null>(null);
  const [fogEnabled, setFogEnabled] = useState(true);
  const [replaySeasonId, setReplaySeasonId] = useState<number | null>(null);

  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const walletStr = publicKey?.toBase58() ?? null;

  // Check URL hash for replay mode (#replay/N)
  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/^#replay\/(\d+)$/);
    if (match) setReplaySeasonId(Number(match[1]));

    const onHashChange = () => {
      const h = window.location.hash;
      const m = h.match(/^#replay\/(\d+)$/);
      setReplaySeasonId(m ? Number(m[1]) : null);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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
    if (event === 'AttackLaunched') {
      // Cache next_attack_id from WS event
      const attackId = Number(data.attackId ?? data.attack_id);
      if (!isNaN(attackId)) setNextAttackId(attackId + 1);

      // Incoming attack — refresh pending attacks immediately
      if (data.defender === walletStr && seasonId && walletStr) {
        fetchPendingAttacks(seasonId, walletStr).then(setPendingAttacks).catch(() => {});
      }
    }
    // Battle report modal when player is involved in a resolved attack
    if (event === 'AttackResolved' && isMe) {
      const attacker = String(data.attacker ?? '');
      const defender = String(data.defender ?? '');
      const hexId = String(data.hexId ?? data.hex_id ?? '');
      const outcome = Number(data.outcome);
      const outcomeName = outcome === 0 ? 'AttackerWins' : outcome === 1 ? 'DefenderWins' : 'Timeout';
      const hex = hexes.find(h => h.hexId === hexId);
      setBattleReport({
        hexId,
        hexName: hex?.landmarkName ?? hex?.regionName ?? `hex ${hexId.slice(0, 8)}`,
        outcome: outcomeName as BattleReport['outcome'],
        attackerWallet: attacker,
        defenderWallet: defender,
        attackerCommitted: Number(data.attackerCommitted ?? data.attacker_committed ?? 0),
        defenderRevealed: Number(data.defenderRevealed ?? data.defender_revealed ?? 0),
        surplusReturned: Number(data.attackerSurplusReturned ?? data.attacker_surplus_returned ?? 0),
        refund: Number(data.attackerRefund ?? data.attacker_refund ?? 0),
        isAttacker: attacker === walletStr,
        isDefender: defender === walletStr,
      });
    }

    if (isMe) {
      refreshPlayer();
    }
  }, [walletStr, seasonId, refreshMap, refreshPlayer, hexes]);

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

  // Fetch pending attacks on mount / season change (real-time updates via WS)
  useEffect(() => {
    if (!seasonId || !walletStr) {
      setPendingAttacks([]);
      return;
    }
    fetchPendingAttacks(seasonId, walletStr).then(setPendingAttacks).catch(() => {});
  }, [seasonId, walletStr]);

  // Build GeoJSON (memoized — avoids recomputing 251+ hexes on every render)
  const geoJson = useMemo(() => {
    if (!lookups) return null;
    const fog: FogOptions = { enabled: fogEnabled, playerWallet: walletStr };
    return hexes.length > 0
      ? buildHexGeoJson(hexes, fog)
      : buildStaticHexGeoJson(
          lookups.allH3Ids,
          lookups.allU64Ids,
          new Map(Array.from(lookups.regionSummary.entries()).map(([k, v]) => [k, v.name])),
          lookups.u64ToRegionId,
          lookups.landmarksByU64,
        );
  }, [hexes, lookups, fogEnabled, walletStr]);

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
      let attackId: number;
      if (nextAttackId !== null) {
        // Use cached value from WebSocket
        attackId = nextAttackId;
      } else {
        // Fall back to on-chain read
        const [countersPda] = findSeasonCounters(seasonId);
        const info = await connection.getAccountInfo(countersPda);
        if (!info?.data) throw new Error('Could not read SeasonCounters');
        // Layout: 8 (discriminator) + 8 (season_id u64) + 4 (player_count u32) + 4 (total_hexes_claimed u32) + 8 (next_attack_id u64)
        attackId = Number(info.data.readBigUInt64LE(24));
      }
      await gameActions.launchAttack(seasonId, targetHexId, originHexId, energy, targetHex.owner, attackId);
    } catch (err) {
      console.error('Failed to launch attack:', err);
    }
  }, [seasonId, hexes, gameActions, publicKey, connection, nextAttackId]);

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

  // Replay mode
  if (replaySeasonId && lookups) {
    const hexH3Map = new Map<string, string>();
    for (let i = 0; i < lookups.allU64Ids.length; i++) {
      hexH3Map.set(lookups.allU64Ids[i], lookups.allH3Ids[i]);
    }
    return (
      <div className="h-screen w-screen">
        <ReplayView
          seasonId={replaySeasonId}
          mapboxToken={MAPBOX_TOKEN}
          hexH3Map={hexH3Map}
          onExit={() => { setReplaySeasonId(null); window.location.hash = ''; }}
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex">
      {/* Map */}
      <div className="flex-1 relative">
        <Suspense fallback={
          <div className="w-full h-full bg-gray-950 flex items-center justify-center">
            <div className="text-gray-500 text-sm">Loading map...</div>
          </div>
        }>
          <MapView
            token={MAPBOX_TOKEN}
            geoJson={geoJson}
            selectedHexId={selectedHexId}
            onHexClick={handleHexClick}
          />
        </Suspense>

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

        <MapLegend
          fogEnabled={fogEnabled}
          onFogToggle={() => setFogEnabled(f => !f)}
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
        hexes={hexes}
        pendingAttacks={pendingAttacks}
        lookups={lookups}
        walletStr={walletStr}
        onReveal={handleReveal}
        onGarrison={handleGarrison}
        onAttack={handleAttack}
        apiBase={import.meta.env.VITE_API_URL || 'http://localhost:3001'}
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
          loading={gameActions.tx?.state === 'pending'}
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
          lookups={lookups}
          onAttack={handleLaunchAttack}
          onClose={() => setAttackHexId(null)}
        />
      )}

      {/* Transaction Toast */}
      <TxToast tx={gameActions.tx} onDismiss={gameActions.clearTx} />

      {/* Battle Report Modal */}
      {battleReport && (
        <BattleReportModal
          report={battleReport}
          onClose={() => setBattleReport(null)}
          onGarrison={handleGarrison}
        />
      )}

      {/* Onboarding (first visit) */}
      <OnboardingModal />
    </div>
  );
}
