export const buyWithETH = {
  inputs: [
    { internalType: 'address', name: '_tokenAddress', type: 'address' },
    { internalType: 'uint256', name: '_minTokenAmount', type: 'uint256' },
  ],
  name: 'buyWithETH',
  outputs: [],
  stateMutability: 'payable',
  type: 'function',
} as const;

export const listWithETH = {
  inputs: [
    { internalType: 'address', name: '_wethAddress', type: 'address' },
    { internalType: 'string', name: '_name', type: 'string' },
    { internalType: 'string', name: '_symbol', type: 'string' },
    { internalType: 'string', name: '_metadataHash', type: 'string' },
  ],
  name: 'listWithETH',
  outputs: [],
  stateMutability: 'payable',
  type: 'function',
} as const;

export const sell = {
  inputs: [
    { internalType: 'address', name: '_tokenAddress', type: 'address' },
    { internalType: 'uint256', name: '_tokenAmount', type: 'uint256' },
    { internalType: 'uint256', name: '_minBaseTokenAmount', type: 'uint256' },
    { internalType: 'bool', name: '_isOutputETH', type: 'bool' },
  ],
  name: 'sell',
  outputs: [{ internalType: 'uint256', name: '_baseTokenAfterFee', type: 'uint256' }],
  stateMutability: 'nonpayable',
  type: 'function',
} as const;

export const TradeEvent = {
  anonymous: false,
  inputs: [
    { indexed: true, internalType: 'address', name: 'tokenAddress', type: 'address' },
    { indexed: true, internalType: 'address', name: 'sender', type: 'address' },
    { indexed: false, internalType: 'uint256', name: 'baseIn', type: 'uint256' },
    { indexed: false, internalType: 'uint256', name: 'tokenIn', type: 'uint256' },
    { indexed: false, internalType: 'uint256', name: 'baseOut', type: 'uint256' },
    { indexed: false, internalType: 'uint256', name: 'tokenOut', type: 'uint256' },
    { indexed: false, internalType: 'uint256', name: 'baseFee', type: 'uint256' },
    { indexed: false, internalType: 'address', name: 'instrument', type: 'address' },
  ],
  name: 'Trade',
  type: 'event',
} as const;

export const ListEvent = {
  anonymous: false,
  inputs: [
    { indexed: true, internalType: 'address', name: 'creator', type: 'address' },
    { indexed: true, internalType: 'address', name: 'tokenAddress', type: 'address' },
    { indexed: true, internalType: 'address', name: 'baseTokenAddress', type: 'address' },
    { indexed: false, internalType: 'string', name: 'name', type: 'string' },
    { indexed: false, internalType: 'string', name: 'symbol', type: 'string' },
    { indexed: false, internalType: 'string', name: 'metadataHash', type: 'string' },
  ],
  name: 'List',
  type: 'event',
} as const;

export const ABI = {
  // trading
  buyWithETH,
  sell,
  TradeEvent,

  // listing
  ListEvent,
  listWithETH,
};
