import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['buffer', 'process', 'crypto', 'stream', 'util'],
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Mapbox GL is ~700KB min — load separately
          mapbox: ['mapbox-gl'],
          // Wallet adapters + WalletConnect pull in a huge dependency tree
          wallets: [
            '@solana/wallet-adapter-react',
            '@solana/wallet-adapter-react-ui',
            '@solana/wallet-adapter-wallets',
          ],
          // Solana core + Anchor
          solana: ['@solana/web3.js', '@coral-xyz/anchor'],
          // H3 hex library
          h3: ['h3-js'],
          // Cryptography (noble curves + hashes)
          crypto: ['@noble/curves', '@noble/hashes'],
        },
      },
    },
  },
})
