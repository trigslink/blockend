# This document provides deployment instructions (internal use)

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
