import axios from 'axios';
import {
  Account,
  Address,
  Chain,
  PublicClient,
  RpcSchema,
  Transport,
  WalletClient,
  createWalletClient,
  http,
  parseEther,
} from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';

import { ABI } from './abi';
import { publicClient as defaultPublicClient, kaiaMainnet } from './chain';
import { KAIAFUN_CORE_ADDRESS, WETH_ADDRESS } from './constants';
import { getEventFromReceipt } from './utils';

export namespace KaiaFunSchema {
  export type Metadata = {
    name: string;
    symbol: string;
    description: string;
    imageURL: string;

    // optional
    twitter?: string;
    telegram?: string;
    website?: string;
  };

  export type BuyOptions = {
    tokenAddress: Address;
    amount: bigint;
    minTokenAmount?: bigint;
  };
  export type SellOptions = {
    tokenAddress: Address;
    amount: bigint;
    minBaseAmount?: bigint;
    isOutputKAIA?: boolean;
  };
  export type ListOptions = {
    metadata: Metadata;
  };
}

export type KaiaFunClientOptions = {
  account: Account;
  publicClient?: PublicClient<Transport, Chain>;
  walletClient?: WalletClient<Transport, Chain, Account, RpcSchema>;
};

export class KaiaFunClient {
  public readonly publicClient: PublicClient<Transport, Chain>;
  public readonly walletClient: WalletClient<Transport, Chain, Account, RpcSchema>;
  public readonly account: Account;
  public readonly API_BASE_URL = 'https://kaiafun.io/api';

  constructor({ account, publicClient, walletClient }: KaiaFunClientOptions) {
    this.account = account;
    this.publicClient = publicClient || defaultPublicClient;
    this.walletClient =
      walletClient ||
      createWalletClient({
        account,
        chain: kaiaMainnet,
        transport: http(),
      });
  }

  public async buy({ tokenAddress, amount, minTokenAmount = 0n }: KaiaFunSchema.BuyOptions) {
    if (this.walletClient.chain?.id !== kaiaMainnet.id) {
      throw new Error('Unsupported chain');
    }

    const hash = await this.walletClient.writeContract({
      address: KAIAFUN_CORE_ADDRESS,
      abi: [ABI.buyWithETH],
      functionName: 'buyWithETH',
      args: [tokenAddress, minTokenAmount],
      value: amount,
    });

    const receipt = await waitForTransactionReceipt(this.publicClient, { hash });
    const tradeEvent = getEventFromReceipt(receipt, [ABI.TradeEvent], ABI.TradeEvent.name);
    return { receipt, tradeEvent };
  }

  public async sell({
    tokenAddress,
    amount,
    minBaseAmount = 0n,
    isOutputKAIA = true,
  }: KaiaFunSchema.SellOptions) {
    if (this.walletClient.chain?.id !== kaiaMainnet.id) {
      throw new Error('Unsupported chain');
    }

    const hash = await this.walletClient.writeContract({
      address: KAIAFUN_CORE_ADDRESS,
      abi: [ABI.sell],
      functionName: 'sell',
      args: [tokenAddress, amount, minBaseAmount, isOutputKAIA],
    });

    const receipt = await waitForTransactionReceipt(this.publicClient, { hash });
    const tradeEvent = getEventFromReceipt(receipt, [ABI.TradeEvent], ABI.TradeEvent.name);
    return { receipt, tradeEvent };
  }

  public async list({ metadata }: KaiaFunSchema.ListOptions) {
    if (this.walletClient.chain?.id !== kaiaMainnet.id) {
      throw new Error('Unsupported chain');
    }

    // check if user KAIA (ETH) balance is more then 10 KAIA
    const balance = await this.publicClient.getBalance({
      address: this.walletClient.account.address,
    });
    if (balance < parseEther('10')) {
      throw new Error('Insufficient balance');
    }

    const serialized = JSON.stringify({
      name: metadata.name,
      symbol: metadata.symbol,
      description: metadata.description,
      imageURL: metadata.imageURL,
      creator: this.walletClient.account.address.toLowerCase(),
      t: Date.now(),
    });
    const {
      data: { hash: metadataHash },
    } = await axios.post<{ hash: string }>(`${this.API_BASE_URL}/token/metadata`, {
      metadata: serialized,
    });

    const hash = await this.walletClient.writeContract({
      address: KAIAFUN_CORE_ADDRESS,
      abi: [ABI.listWithETH],
      functionName: 'listWithETH',
      args: [WETH_ADDRESS, metadata.name, metadata.symbol, metadataHash],
      value: parseEther('10'),
    });

    const receipt = await waitForTransactionReceipt(this.publicClient, { hash });
    const listEvent = getEventFromReceipt(receipt, [ABI.ListEvent], ABI.ListEvent.name);
    return { receipt, listEvent };
  }

  public async uploadImage(file: File): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await axios.post<{ url: string }>(
        `${this.API_BASE_URL}/upload?filename=${file.name}`,
        file,
        { headers: { 'Content-Type': file.type } },
      );

      return data.url;
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  }
}
