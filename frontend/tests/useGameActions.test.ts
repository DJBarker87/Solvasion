import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock all external dependencies — factories must not reference top-level variables
const mockPublicKey = { toBase58: () => 'TestWallet11111111111111111111111111111111' };

vi.mock('@solana/wallet-adapter-react', () => ({
  useConnection: () => ({ connection: {} }),
  useWallet: () => ({ publicKey: mockPublicKey }),
  useAnchorWallet: () => ({
    publicKey: mockPublicKey,
    signTransaction: vi.fn(),
    signAllTransactions: vi.fn(),
  }),
}));

vi.mock('../src/solana/program', () => ({
  getProgram: () => ({ methods: {}, programId: 'test' }),
}));

vi.mock('../src/solana/actions', () => ({
  joinSeason: vi.fn().mockResolvedValue('txSig123'),
  claimHex: vi.fn().mockResolvedValue('txSig456'),
  commitDefence: vi.fn().mockResolvedValue('txSig789'),
  increaseDefence: vi.fn().mockResolvedValue('txSigABC'),
  withdrawDefence: vi.fn().mockResolvedValue('txSigDEF'),
  launchAttack: vi.fn().mockResolvedValue('txSigGHI'),
  revealDefence: vi.fn().mockResolvedValue('txSigJKL'),
}));

vi.mock('../src/solana/defenceLedger', () => ({
  getAll: () => [{ nonce: 3 }, { nonce: 5 }],
  getEntry: () => ({ amount: 10, blind: 'aa', nonce: 5 }),
}));

// Import after mocks
import { useGameActions } from '../src/hooks/useGameActions';
import * as actions from '../src/solana/actions';

describe('useGameActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with null tx state', () => {
    const { result } = renderHook(() => useGameActions());
    expect(result.current.tx).toBeNull();
  });

  it('clearTx resets tx state to null', async () => {
    const { result } = renderHook(() => useGameActions());

    await act(async () => {
      await result.current.joinSeason(1);
    });
    expect(result.current.tx).not.toBeNull();

    act(() => {
      result.current.clearTx();
    });
    expect(result.current.tx).toBeNull();
  });

  it('joinSeason sets confirmed on success', async () => {
    const { result } = renderHook(() => useGameActions());

    await act(async () => {
      await result.current.joinSeason(1);
    });

    expect(result.current.tx?.state).toBe('confirmed');
    expect(result.current.tx?.message).toBe('Joining season...');
    expect(actions.joinSeason).toHaveBeenCalledOnce();
  });

  it('joinSeason sets error state on failure', async () => {
    vi.mocked(actions.joinSeason).mockRejectedValueOnce(new Error('Simulation failed'));

    const { result } = renderHook(() => useGameActions());

    await act(async () => {
      await result.current.joinSeason(1);
    });

    expect(result.current.tx?.state).toBe('error');
    expect(result.current.tx?.message).toContain('Simulation failed');
  });

  it('claimHex calls action with correct nonce', async () => {
    const { result } = renderHook(() => useGameActions());

    await act(async () => {
      await result.current.claimHex(1, '100', null);
    });

    expect(result.current.tx?.state).toBe('confirmed');
    // getAll returns max nonce 5, so next nonce = 6
    expect(actions.claimHex).toHaveBeenCalledWith(
      expect.anything(), 1, mockPublicKey, '100', null, 6
    );
  });

  it('commitDefence calls action and sets confirmed', async () => {
    const { result } = renderHook(() => useGameActions());

    await act(async () => {
      await result.current.commitDefence(1, ['100', '200'], [10, 20]);
    });

    expect(result.current.tx?.state).toBe('confirmed');
    expect(actions.commitDefence).toHaveBeenCalledOnce();
  });

  it('launchAttack calls program with correct params', async () => {
    const { result } = renderHook(() => useGameActions());

    await act(async () => {
      await result.current.launchAttack(1, '200', '100', 25, '11111111111111111111111111111112', 0);
    });

    expect(result.current.tx?.state).toBe('confirmed');
    expect(actions.launchAttack).toHaveBeenCalledOnce();
  });

  it('revealDefence calls action with correct params', async () => {
    const { result } = renderHook(() => useGameActions());

    await act(async () => {
      await result.current.revealDefence(1, 5, '300', '11111111111111111111111111111112');
    });

    expect(result.current.tx?.state).toBe('confirmed');
    expect(actions.revealDefence).toHaveBeenCalledOnce();
  });
});
