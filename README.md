# KaiaFun MCP

> 🐍 ☁️ An MCP server for listing and trading tokens on [KaiaFun](http://kaiafun.io) and interacting with the Kaia blockchain

![demo](https://github.com/weerofun/kaiafun-mcp/blob/main/.github/demo.png)

## 🛠️ MCP Server

### Overview

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) is an open protocol that standardizes how applications provide context to Large Language Models (LLMs).

This repository implements an MCP server for the KaiaFun protocol, enabling token listing, trading, and interaction with the Kaia blockchain (e.g. checking token balances of configured wallet).

### Installation

```bash
# Clone the repository
git clone https://github.com/weerofun/kaiafun-mcp
cd kaiafun-mcp

# Install dependencies
yarn

# Build
yarn build
```

The build process will generate output in the directory specified in `tsconfig.json` (`dist` as default) via `tsc`.

To start the MCP Server, you'll need to run `dist/kaiafun-mcp-server.js` (see [#configuration](#configuration) below).

### Configuration

Update your [Claude Desktop](https://claude.ai/download) configuration by updating `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kaiafun": {
      "command": "node",
      "args": ["/path/to/dist/kaiafun-mcp-server.js"],
      "env": {
        "PRIVATE_KEY": "0x"
      }
    },
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
    }
  }
}
```

- Set `mcpServers.kaiafun.args[0]` to the absolute path of `dist/kaiafun-mcp-server.js`
- Configure `PRIVATE_KEY` with the account's private key for transaction signing
- We also recommend adding [`@modelcontextprotocol/server-puppeteer`](https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer) to your configuration for basic web browsing capabilities

> [!CAUTION]
> PLEASE NOTE that storing private key (`PRIVATE_KEY`) in plaintext is not safe, and this is primarily for development/exploration purposes.
>
> This repo is currently in development, and the contributors in/and the related projects, protocols, and entities are not responsible for any loss of funds, losses, or issues due to the use of this project.
>
> Anyone is free to use this project at their own risk, and contribute to the project by opening issues and pull requests. 💗

## 🛠️ SDK

We are also working on a TypeScript SDK to interact with the KaiaFun protocol. It powers the core functionality of our MCP server and can later be used independently for building custom applications. Source code is located in the `src/sdk` directory.

Currently supported features are as follows:

- ✅ Listing new tokens with predefined metadata
- ✅ Buying and selling tokens with KAIA

Please note that the SDK is also in beta, and features and implementation are subject to change.

## 📄 License

Licensed under the [Apache License 2.0](LICENSE).

Copyright 2025 KaiaFun.
