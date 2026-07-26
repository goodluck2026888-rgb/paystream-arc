# PayStream Arc — B2B Recurring USDC Payment Gateway

> Recurring USDC subscription payments for businesses

PayStream Arc enables businesses to accept recurring USDC payments on Arc L1. The API handles subscription billing, payment verification, and revenue analytics. Each payment verification call costs $0.001 USDC via x402 nanopayments, settled through Circle Batch Facilitator. Merchant wallets are managed by Circle Wallets with Gateway settlement.

## 🏗️ Architecture

```
Arc L1 (USDC Transfer Events)
    ↓
PayStream Arc Indexer (polls every 15s, processes recurring USDC subscription payments)
    ↓
Detection Engine (payment verification results)
    ↓
x402 Payment Gateway ($0.0010 USDC per request)
    ↓
Structured JSON API Response
```

## 🔧 Tech Stack

| Component | Technology |
|---|---|
| Blockchain | Arc L1 (Chain ID: 5042002) |
| Native Token | USDC (gas + transfers) |
| USDC Contract | `0x3600000000000000000000000000000000000000` |
| Payment Protocol | x402 Nanopayments |
| Circle Products | Wallets, Gateway, Batch Facilitator |
| Runtime | Node.js 22+ (ESM) |
| RPC | Arc Testnet public / QuickNode / dRPC |

## 🚀 Quick Start

```bash
# Install dependencies
npm install


# Configure environment
cp .env.example .env
# Edit .env: fill in SERVER_WALLET_ADDRESS and DEPLOYER_PRIVATE_KEY

# Get testnet USDC
# Visit https://faucet.circle.com → Select Arc Testnet → Paste your address

# Start indexer (terminal 1)
npm run indexer

# Start API server (terminal 2)
npm start

# Test x402 payment flow
npm test
```

## 📡 API Endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/health` | GET | Free | Service health check |
| `/stats` | GET | Free | Detection statistics |
| `/signals` | GET | x402 | Latest payment verification results (JSON) |
| `/signals/:id` | GET | x402 | Specific signal detail |

## 💰 x402 Payment Flow

1. Client requests `GET /signals` without payment header
2. Server responds `402 Payment Required` + x402 payment requirements
3. Client pays **$0.0010 USDC** via Circle Gateway
4. Server verifies payment via Circle Batch Facilitator
5. Server returns payment verification results + settlement proof in `X-Payment-Response` header

## 🎯 Use Cases

1. SaaS companies
2. Content creators
3. Service providers

## ✨ Key Features

- Subscription billing engine
- Automated payment verification
- x402 pay-per-verification API
- Circle Wallets merchant accounts

## 📊 Configuration

| Parameter | Value |
|---|---|
| Detection Threshold | $50 USDC |
| API Price | $0.0010 USDC per call |
| Server Port | 3008 |
| Poll Interval | 15 seconds |
| Track | Agentic Economy |

## 🔗 Circle Integration

- **Circle Wallets**: Agent/wallet fund management and escrow
- **Circle Gateway**: Cross-chain USDC settlement and bridging
- **Circle Batch Facilitator**: x402 payment verification and settlement

## 📄 License

MIT
