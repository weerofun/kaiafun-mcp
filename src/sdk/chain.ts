import { PublicClient, Transport, createPublicClient, defineChain, http } from 'viem';

export const kaiaMainnet = defineChain({
  id: 8217,
  name: 'Kaia',
  nativeCurrency: {
    decimals: 18,
    name: 'Kaia',
    symbol: 'KAIA',
  },
  rpcUrls: {
    default: {
      http: ['https://public-en.node.kaia.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Kaiascope',
      url: 'https://klaytnscope.com',
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 96002415,
    },
  },
});

export const publicClient = createPublicClient({
  chain: kaiaMainnet,
  transport: http(),
});
