import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Address, Hex, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

import { KaiaFunClient, KaiaFunSchema } from './sdk/client';

type KaiaFunServer = Server & {
  kaiaFunClient?: KaiaFunClient;
  imageCache?: Map<string, { path: string; mimeType: string }>;
};

// Schemas for validation
const schemas = {
  toolInputs: {
    listMemecoin: z.object({
      name: z.string().min(1, 'Name is required'),
      symbol: z.string().min(1, 'Symbol is required'),
      description: z.string().min(1, 'Description is required'),
      imageURL: z
        .string()
        .url('Image URL must be a valid URL (best if result from `upload_image` tool)'),
      twitter: z.string().optional(),
      telegram: z.string().optional(),
      website: z.string().optional(),
    }),
    buyMemecoin: z.object({
      tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address'),
      amount: z.string().min(1, 'Amount is required'),
      minTokenAmount: z.string().optional(),
    }),
    sellMemecoin: z.object({
      tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address'),
      amount: z.string().min(1, 'Amount is required'),
      minBaseAmount: z.string().optional(),
      isOutputKAIA: z.boolean().optional(),
    }),
    getTokenInfo: z.object({
      tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address'),
    }),
    getTokenUrl: z.object({
      tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address'),
    }),
    parseEther: z.object({
      amount: z.string().min(1, 'Amount is required'),
    }),
    formatEther: z.object({
      amount: z.string().min(1, 'Amount is required'),
    }),
    getWalletBalance: z.object({}),
    getWalletAddress: z.object({}),
    getTokenBalance: z.object({
      tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address'),
    }),
    // getTransactionHistory: z.object({
    //   limit: z.number().optional(),
    // }),
    uploadImage: z.object({
      imageURL: z.string().url('Image URL must be a valid URL'),
    }),
  },
};

// Setup KaiaFun client
const setupKaiaFunClient = (privateKey: Hex): KaiaFunClient => {
  const account = privateKeyToAccount(privateKey);
  return new KaiaFunClient({ account });
};

function formatError(error: any): string {
  console.error('Full error:', JSON.stringify(error, null, 2));

  if (error.code) {
    return `Error (${error.code}): ${error.message || 'Unknown error'}`;
  }
  return error.message || 'An unknown error occurred';
}

const TOOL_DEFINITIONS = [
  {
    name: 'list_memecoin',
    description: 'List a new memecoin on KaiaFun (requires 10 KAIA to list)',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the memecoin',
        },
        symbol: {
          type: 'string',
          description: 'Symbol of the memecoin (ticker)',
        },
        description: {
          type: 'string',
          description: 'Description of the memecoin',
        },
        imageURL: {
          type: 'string',
          description: 'URL to the memecoin image',
        },
        twitter: {
          type: 'string',
          description: 'Twitter handle (optional)',
        },
        telegram: {
          type: 'string',
          description: 'Telegram group (optional)',
        },
        website: {
          type: 'string',
          description: 'Website URL (optional)',
        },
      },
      required: ['name', 'symbol', 'description', 'imageURL'],
    },
  },
  {
    name: 'buy_memecoin',
    description: 'Buy a memecoin with KAIA',
    inputSchema: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: 'Address of the token to buy',
        },
        amount: {
          type: 'string',
          description: 'Amount of KAIA to spend (in KAIA, not wei)',
        },
        minTokenAmount: {
          type: 'string',
          description: 'Minimum amount of tokens to receive (optional)',
        },
      },
      required: ['tokenAddress', 'amount'],
    },
  },
  {
    name: 'sell_memecoin',
    description: 'Sell a memecoin for KAIA',
    inputSchema: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: 'Address of the token to sell',
        },
        amount: {
          type: 'string',
          description: 'Amount of tokens to sell',
        },
        minBaseAmount: {
          type: 'string',
          description: 'Minimum amount of KAIA to receive (optional)',
        },
        isOutputKAIA: {
          type: 'boolean',
          description: 'Whether to receive KAIA or WKAIA (optional, defaults to true)',
        },
      },
      required: ['tokenAddress', 'amount'],
    },
  },
  {
    name: 'get_token_info',
    description: 'Get information about a token',
    inputSchema: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: 'Address of the token',
        },
      },
      required: ['tokenAddress'],
    },
  },
  {
    name: 'get_token_url',
    description: 'Get the KaiaFun detail page URL for a token',
    inputSchema: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: 'Address of the token',
        },
      },
      required: ['tokenAddress'],
    },
  },
  {
    name: 'parse_ether',
    description: 'Convert KAIA amount to wei (1 KAIA = 10^18 wei)',
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'string',
          description: 'Amount in KAIA',
        },
      },
      required: ['amount'],
    },
  },
  {
    name: 'format_ether',
    description: 'Convert wei amount to KAIA (10^18 wei = 1 KAIA)',
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'string',
          description: 'Amount in wei',
        },
      },
      required: ['amount'],
    },
  },
  {
    name: 'get_wallet_balance',
    description: 'Get the KAIA balance of the wallet',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_wallet_address',
    description: 'Get the wallet address being used for transactions',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_token_balance',
    description: 'Get the balance of a specific token for the wallet',
    inputSchema: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: 'Address of the token to check balance for',
        },
      },
      required: ['tokenAddress'],
    },
  },
  {
    name: 'get_transaction_history',
    description: 'Get recent transactions for the wallet (limited functionality)',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of transactions to retrieve (optional)',
        },
      },
      required: [],
    },
  },
  {
    name: 'upload_image',
    description: 'Upload an image from a URL to KaiaFun server and return the new image URL',
    inputSchema: {
      type: 'object',
      properties: {
        imageURL: {
          type: 'string',
          description: 'URL of the image to upload, preferably from a website (not base64 encoded)',
        },
      },
      required: ['imageURL'],
    },
  },
] as const;

// Helper function to download image from URL and save to temp file
async function downloadImageToTempFile(
  imageUrl: string,
): Promise<{ filePath: string; fileName: string; mimeType: string }> {
  try {
    // Generate a temp file path
    const tempDir = os.tmpdir();
    const randomFileName = `${crypto.randomUUID()}.${getExtensionFromUrl(imageUrl)}`;
    const tempFilePath = path.join(tempDir, randomFileName);

    // Download the image
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });

    // Get content type
    const mimeType = response.headers['content-type'] || 'image/jpeg';

    // Write to temp file
    fs.writeFileSync(tempFilePath, Buffer.from(response.data));

    return { filePath: tempFilePath, fileName: randomFileName, mimeType };
  } catch (error) {
    console.error('Error downloading image:', error);
    throw new Error('Failed to download image from URL');
  }
}

// Extract extension from URL
function getExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const extension = path.extname(pathname).slice(1);
    return extension || 'jpg';
  } catch (error) {
    return 'jpg';
  }
}

// Tool implementation handlers with closure for accessing kaiaFunClient
const createToolHandlers = (server: KaiaFunServer) => ({
  async list_memecoin(args: unknown) {
    try {
      const { name, symbol, description, imageURL, twitter, telegram, website } =
        schemas.toolInputs.listMemecoin.parse(args);

      if (!server.kaiaFunClient) throw new Error('KaiaFun client not initialized');

      const metadata: KaiaFunSchema.Metadata = {
        name,
        symbol,
        description,
        imageURL,
        twitter,
        telegram,
        website,
      };

      const result = await server.kaiaFunClient.list({ metadata });

      const tokenAddress = result.listEvent?.args.tokenAddress || 'Unknown';

      return {
        content: [
          {
            type: 'text',
            text: `Successfully listed new memecoin!
Name: ${name}
Symbol: ${symbol}
Token Address: ${tokenAddress}
Transaction Hash: ${result.receipt.transactionHash}`,
          },
        ],
      } as const;
    } catch (error) {
      console.error('Error listing memecoin:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error listing memecoin: ${formatError(error)}`,
          },
        ],
      } as const;
    }
  },

  async buy_memecoin(args: unknown) {
    try {
      const { tokenAddress, amount, minTokenAmount } = schemas.toolInputs.buyMemecoin.parse(args);

      if (!server.kaiaFunClient) throw new Error('KaiaFun client not initialized');

      const parsedAmount = parseEther(amount);
      const parsedMinTokenAmount = minTokenAmount ? parseEther(minTokenAmount) : 0n;

      const result = await server.kaiaFunClient.buy({
        tokenAddress: tokenAddress as `0x${string}`,
        amount: parsedAmount,
        minTokenAmount: parsedMinTokenAmount,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully bought memecoin!
Token Address: ${tokenAddress}
Amount Spent: ${amount} KAIA
Transaction Hash: ${result.receipt.transactionHash}`,
          },
        ],
      } as const;
    } catch (error) {
      console.error('Error buying memecoin:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error buying memecoin: ${formatError(error)}`,
          },
        ],
      } as const;
    }
  },

  async sell_memecoin(args: unknown) {
    try {
      const { tokenAddress, amount, minBaseAmount, isOutputKAIA } =
        schemas.toolInputs.sellMemecoin.parse(args);

      if (!server.kaiaFunClient) throw new Error('KaiaFun client not initialized');

      const parsedAmount = parseEther(amount);
      const parsedMinBaseAmount = minBaseAmount ? parseEther(minBaseAmount) : 0n;

      const result = await server.kaiaFunClient.sell({
        tokenAddress: tokenAddress as `0x${string}`,
        amount: parsedAmount,
        minBaseAmount: parsedMinBaseAmount,
        isOutputKAIA,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully sold memecoin!
Token Address: ${tokenAddress}
Amount Sold: ${amount} tokens
Transaction Hash: ${result.receipt.transactionHash}`,
          },
        ],
      } as const;
    } catch (error) {
      console.error('Error selling memecoin:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error selling memecoin: ${formatError(error)}`,
          },
        ],
      } as const;
    }
  },

  async get_token_info(args: unknown) {
    try {
      const { tokenAddress } = schemas.toolInputs.getTokenInfo.parse(args);

      // This is a placeholder - KaiaFunClient doesn't have a method to get token info directly
      // We would need to add this functionality or use the publicClient to fetch the data

      // For now, let's return a simple response with the address
      return {
        content: [
          {
            type: 'text',
            text: `Token information for ${tokenAddress}:
This feature is not fully implemented yet. 
You can use this token address for buy/sell operations.`,
          },
        ],
      } as const;
    } catch (error) {
      console.error('Error getting token info:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error getting token info: ${formatError(error)}`,
          },
        ],
      } as const;
    }
  },

  async get_token_url(args: unknown) {
    try {
      const { tokenAddress } = schemas.toolInputs.getTokenUrl.parse(args);

      // Construct the KaiaFun detail page URL directly
      const url = `https://kaiafun.io/token/${tokenAddress.toLowerCase()}`;

      return {
        content: [
          {
            type: 'text',
            text: `Token URL: ${url}`,
          },
        ],
      } as const;
    } catch (error) {
      console.error('Error getting token URL:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error getting token URL: ${formatError(error)}`,
          },
        ],
      } as const;
    }
  },

  async parse_ether(args: unknown) {
    try {
      const { amount } = schemas.toolInputs.parseEther.parse(args);

      const parsedAmount = parseEther(amount);

      return {
        content: [
          {
            type: 'text',
            text: `${amount} KAIA = ${parsedAmount.toString()} wei`,
          },
        ],
      } as const;
    } catch (error) {
      console.error('Error parsing ether:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error parsing ether: ${formatError(error)}`,
          },
        ],
      } as const;
    }
  },

  async format_ether(args: unknown) {
    try {
      const { amount } = schemas.toolInputs.formatEther.parse(args);

      const formattedAmount = formatEther(BigInt(amount));

      return {
        content: [
          {
            type: 'text',
            text: `${amount} wei = ${formattedAmount} KAIA`,
          },
        ],
      } as const;
    } catch (error) {
      console.error('Error formatting ether:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error formatting ether: ${formatError(error)}`,
          },
        ],
      } as const;
    }
  },

  async get_wallet_balance(args: unknown) {
    try {
      // Parse arguments (empty in this case)
      schemas.toolInputs.getWalletBalance.parse(args);

      if (!server.kaiaFunClient) throw new Error('KaiaFun client not initialized');

      const balance = await server.kaiaFunClient.publicClient.getBalance({
        address: server.kaiaFunClient.account.address,
      });

      const formattedBalance = formatEther(balance);

      return {
        content: [
          {
            type: 'text',
            text: `Wallet Balance: ${formattedBalance} KAIA`,
          },
        ],
      } as const;
    } catch (error) {
      console.error('Error getting wallet balance:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error getting wallet balance: ${formatError(error)}`,
          },
        ],
      } as const;
    }
  },

  async get_wallet_address(args: unknown) {
    try {
      // Parse arguments (empty in this case)
      schemas.toolInputs.getWalletAddress.parse(args);

      if (!server.kaiaFunClient) throw new Error('KaiaFun client not initialized');

      return {
        content: [
          {
            type: 'text',
            text: `Wallet Address: ${server.kaiaFunClient.account.address}`,
          },
        ],
      } as const;
    } catch (error) {
      console.error('Error getting wallet address:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error getting wallet address: ${formatError(error)}`,
          },
        ],
      } as const;
    }
  },

  async get_token_balance(args: unknown) {
    try {
      const { tokenAddress } = schemas.toolInputs.getTokenBalance.parse(args);

      if (!server.kaiaFunClient) throw new Error('KaiaFun client not initialized');

      // ERC20 Token balanceOf function
      const tokenContract = {
        address: tokenAddress as Address,
        abi: [
          {
            inputs: [{ name: 'account', type: 'address' }],
            name: 'balanceOf',
            outputs: [{ name: 'balance', type: 'uint256' }],
            stateMutability: 'view',
            type: 'function',
          },
          {
            inputs: [],
            name: 'decimals',
            outputs: [{ name: '', type: 'uint8' }],
            stateMutability: 'view',
            type: 'function',
          },
          {
            inputs: [],
            name: 'symbol',
            outputs: [{ name: '', type: 'string' }],
            stateMutability: 'view',
            type: 'function',
          },
        ],
      };

      try {
        // Get token decimals and symbol
        const decimals = (await server.kaiaFunClient.publicClient.readContract({
          ...tokenContract,
          functionName: 'decimals',
        })) as number;

        const symbol = (await server.kaiaFunClient.publicClient.readContract({
          ...tokenContract,
          functionName: 'symbol',
        })) as string;

        // Get token balance
        const balance = (await server.kaiaFunClient.publicClient.readContract({
          ...tokenContract,
          functionName: 'balanceOf',
          args: [server.kaiaFunClient.account.address],
        })) as bigint;

        // Format based on token decimals
        const divisor = 10n ** BigInt(decimals);
        const formattedBalance = Number(balance) / Number(divisor);

        return {
          content: [
            {
              type: 'text',
              text: `Token Balance for ${tokenAddress}:
Symbol: ${symbol}
Balance: ${formattedBalance.toString()} ${symbol}`,
            },
          ],
        } as const;
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error reading token contract: ${formatError(error)}
This may not be a valid ERC20 token or the contract may be inaccessible.`,
            },
          ],
        } as const;
      }
    } catch (error) {
      console.error('Error getting token balance:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error getting token balance: ${formatError(error)}`,
          },
        ],
      } as const;
    }
  },

  //   async get_transaction_history(args: unknown) {
  //     try {
  //       const { limit = 5 } = schemas.toolInputs.getTransactionHistory.parse(args);

  //       if (!server.kaiaFunClient) throw new Error('KaiaFun client not initialized');

  //       // Note: To get detailed transaction history, you'd typically need to use a block explorer API
  //       // or archive node. This is a simplified implementation.

  //       return {
  //         content: [
  //           {
  //             type: 'text',
  //             text: `Transaction History Feature:
  // Wallet Address: ${server.kaiaFunClient.account.address}

  // To view detailed transaction history for this address, please visit:
  // https://klaytnscope.com/account/${server.kaiaFunClient.account.address}

  // Note: Full transaction history requires integration with a blockchain explorer API, which is not implemented in this basic version.`,
  //           },
  //         ],
  //       } as const;
  //     } catch (error) {
  //       console.error('Error getting transaction history:', error);
  //       return {
  //         content: [
  //           {
  //             type: 'text',
  //             text: `Error getting transaction history: ${formatError(error)}`,
  //           },
  //         ],
  //       } as const;
  //     }
  //   },

  async upload_image(args: unknown) {
    try {
      const { imageURL } = schemas.toolInputs.uploadImage.parse(args);

      if (!server.kaiaFunClient) throw new Error('KaiaFun client not initialized');

      try {
        // Download the image from the URL and save to temp file
        const { filePath, fileName, mimeType } = await downloadImageToTempFile(imageURL);

        // Create a File object from the temp file
        const file = new File([fs.readFileSync(filePath)], fileName, { type: mimeType });

        // Upload the image using KaiaFun's uploadImage method
        const uploadedUrl = await server.kaiaFunClient.uploadImage(file);

        if (!uploadedUrl) {
          throw new Error('Failed to upload image to KaiaFun server');
        }

        // Clean up the temp file
        fs.unlinkSync(filePath);

        return {
          content: [
            {
              type: 'text',
              text: `Successfully uploaded image to KaiaFun!
Original URL: ${imageURL}
Uploaded URL: ${uploadedUrl}`,
            },
          ],
        } as const;
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error processing image: ${formatError(error)}`,
            },
          ],
        } as const;
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error uploading image: ${formatError(error)}`,
          },
        ],
      } as const;
    }
  },
});

// Initialize MCP server
const server: KaiaFunServer = new Server(
  {
    name: 'kaiafun-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

// Initialize image cache
server.imageCache = new Map();

// Create tool handlers with access to the server
const toolHandlers = createToolHandlers(server);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('Tools requested by client');
  return { tools: TOOL_DEFINITIONS };
});

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;

  try {
    const handler = toolHandlers[name as keyof typeof toolHandlers];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return await handler(args);
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);
    throw error;
  }
});

// Register resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  if (!server.imageCache) {
    return { resources: [] };
  }

  const resources = Array.from(server.imageCache.entries()).map(([uri, info]) => ({
    uri,
    name: `Image: ${path.basename(uri)}`,
    description: 'Uploaded image resource',
    mimeType: info.mimeType,
  }));

  return { resources };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (!server.imageCache || !server.imageCache.has(uri)) {
    throw new Error(`Resource not found: ${uri}`);
  }

  const imageInfo = server.imageCache.get(uri);
  if (!imageInfo) {
    throw new Error(`Resource not found: ${uri}`);
  }

  try {
    // Read the image file
    const imageBuffer = fs.readFileSync(imageInfo.path);

    // Return the image as a binary resource
    return {
      contents: [
        {
          uri,
          mimeType: imageInfo.mimeType,
          blob: imageBuffer.toString('base64'),
        },
      ],
    };
  } catch (error) {
    console.error(`Error reading resource ${uri}:`, error);
    throw new Error(`Failed to read resource: ${formatError(error)}`);
  }
});

// Start the server
async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  // Initialize `KaiaFunClient` once when server starts and connect to server instance
  server.kaiaFunClient = setupKaiaFunClient(process.env.PRIVATE_KEY as Hex);
  console.error('KaiaFun client initialized');

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('KaiaFun MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
