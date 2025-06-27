# Blockend: Decentralized MCP Registry

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-blue?logo=ethereum)](https://docs.soliditylang.org)
[![Hardhat](https://img.shields.io/badge/Hardhat-dev-yellow)](https://hardhat.org)
[![Chainlink](https://img.shields.io/badge/Chainlink-Data-Feeds)](https://chain.link/data-feeds)
[![Chainlink](https://img.shields.io/badge/Chainlink-Automation-blue)](https://chain.link/automation)
[![Docker](https://img.shields.io/badge/Docker-Container-blue?logo=docker)](https://docker.com)
[![MCP](https://img.shields.io/badge/MCP-Registry-critical)](#)

---

# What is MCP?

Model Context Protocol is a new open standard for AI models to interact with external data and services. For more informaion, check out [this](https://www.youtube.com/watch?v=HyzlYwjoXOQ) video.

# Peer-to-peer MCP Protocol

A minimal viable decentralized market for MCPs services, enabling decentralized service discovery and request routing.
This project serves as a foundational layer for building a decentralized marketplace for AI APIs, allowing providers to register their services and consumers to request them.
We believe this service will be valuable for the Blockchain x AI ecosystem, enabling efficient, cost effective, democratic and decentralized access to computing resources.

# MCP examples (clickable links)

<a href="https://github.com/BlindVibeDev/CoinGeckoMCP" target="_blank">
  <img src="./assets/CoinGecko_logo.png" alt="Coingecko_Logo" width="100"/>
</a>
<a href="https://hub.docker.com/r/mcp/notion" target="_blank">
  <img src="./assets/Notion_app_logo.png" alt="Notion_Logo" width="100"/>
</a>
<a href="https://hub.docker.com/r/mcp/postgres" target="_blank">
  <img src="./assets/Postgresql_elephant.svg.png" alt="Postgres_Logo" width="100"/>
</a>

## 🧱 Architecture Overview

![MCP Contract Flow](./assets/r-r.gif)

---

## 🔩 Component Breakdown

### 🔵 McpProvider.sol

- Provider-side registry of MCP service metadata.
- Stores `httpsURI` and `registeredAt` per submission.
- Uses `msg.sender` as the primary identity.

```solidity
struct McpMetadata {
    address owner;
    string httpsURI;
    uint256 registeredAt;
}
```

### 🟢 McpConsumer.sol

- Queries the provider contract for valid `httpsURI`.
- Emits an `McpRequested` event to signal off-chain routing.
- Validates that the provider exists before emitting request.

---

## 🛠 Getting Started

### Prerequisites

```bash
# Hardhat Project Init
npm install --save-dev hardhat
npx hardhat
```

### File Structure

```
contracts/
├── McpProvider.sol
└── McpConsumer.sol
```

---

## 🚀 Local Contract Deployment (Hardhat)

Ensure you are in ./blockend for deploys

```bash
# Start Hardhat node
npx hardhat node


# In a new terminal
# Deploy
npx hardhat ignition deploy ignition/modules/McpProvider.ts --network localhost
```

## 🏂 Fuji Contract Deployment (Hardhat)

```bash
npx hardhat ignition deploy ignition/modules/DeployMcpSystem.ts --network fuji --reset
```

## 🏂 Fuji Contract Verify (Provider) (Hardhat)

```bash
npx hardhat verify --network fuji DEPLOYED_CONTRACT_ADDRESS "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD"
```

## 🏂 Fuji Contract Verify (Consumer) (Hardhat)

```bash
npx hardhat verify --network fuji DEPLOYED_CONTRACT_ADDRESS "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD" "PROVIDER_CONTRACT_ADDRESS"
```

---

## 🔌 Provider Functions

| Function                              | Description                                |
| ------------------------------------- | ------------------------------------------ |
| `registerProvider(string httpsURI)`   | Register a service                         |
| `deregisterProvider(string httpsURI)` | Stop providing services for a specific MCP |

---

## 📡 Consumer Functions

| Function                                  | Description                        |
| ----------------------------------------- | ---------------------------------- | ------------------------------ |
| `requestMcpSubscription(string httpsURI)` | Subscribe to a service for 30 days |
| `endMcpSubscription(string httpsURI)`     | Ends the subscription              | Called by Chainlink Automation |

---

## 📖 Events

```solidity
// In McpProvider.sol
event RegistrationFailed(address indexed provider, string httpsURI, uint256 timestamp);
event ProviderRegistered(address indexed provider, string httpsURI, uint256 timestamp);
event ProviderDeregistered(address indexed provider, string httpsURI, uint256 timestamp);

// In McpConsumer.sol
event RequestFailed(address indexed requester, string httpsURI, uint256 timestamp);
event McpRequested(address indexed requester, string httpsURI, uint256 timestamp);
event McpRequestEnded(address indexed requester, string httpsURI, uint256 timestamp);
```

---

## 🛡 Security Notes

- Only `msg.sender` can register
- Optionally add stake + slashing
- Consumer checks must prevent spoofed requests

---

## 📚 Future Work

- Provider reputation system
- SLA enforcement
- Onchain hash-based verification system with Chainlink Functions (current model suffers from trust based assumptions)
- AVAX Subnet-ification of same MCP models for high throughput
- Cross-chain support via Chainlink CCIP

---

## 🧪 Testing

Prior to deploying, it is crucial to check all tests pass

```bash
npx hardhat test
```

# This document provides deployment instructions and automation registration

## 🏂 Fuji Contract Deployment (Hardhat)

```bash
npx hardhat ignition deploy ignition/modules/DeployMcpSystem.ts --network fuji --reset
```

## 🏂 Fuji Contract Verify (Provider) (Hardhat)

```bash
npx hardhat verify --network fuji PROVIDER_CONTRACT_ADDRESS "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD"
```

## 🏂 Fuji Contract Verify (Consumer) (Hardhat)

```bash
npx hardhat verify --network fuji CONSUMER_CONTRACT_ADDRESS "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD" "PROVIDER_CONTRACT_ADDRESS"
```

## ⚙️ Upkeep Automation Registration

![automation-step-1](../../assets/cl-automation-1.png)

![automation-step-2](../../assets/cl-automation-2.png)

![automation-step-3](../../assets/cl-automation-3.png)
