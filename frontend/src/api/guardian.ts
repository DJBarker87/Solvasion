const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface GuardianPacketPayload {
  season_id: number;
  player_wallet: string;
  hex_id: string;
  energy_amount: number;
  blind_hex: string;
  nonce: number;
  signature: string;
}

export async function uploadGuardianPacket(payload: GuardianPacketPayload): Promise<void> {
  const res = await fetch(`${API}/api/guardian/packets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Guardian upload failed: ${res.status}`);
  }
}

export async function deleteGuardianPacket(
  seasonId: number,
  hexId: string,
  wallet: string,
  signature: string,
): Promise<boolean> {
  const params = new URLSearchParams({ wallet, signature });
  const res = await fetch(
    `${API}/api/guardian/packets/${seasonId}/${hexId}?${params}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Guardian delete failed: ${res.status}`);
  }
  const data = await res.json();
  return data.deleted ?? false;
}
