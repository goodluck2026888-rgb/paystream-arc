/**
 * PayStream Arc - x402 Payment Server
 *
 * Serves payment stream analytics behind an x402 paywall.
 * AI agents pay $0.001 USDC per request to unlock stream data.
 *
 * Endpoints:
 *   GET /health        - Free health check
 *   GET /stats         - Free stream statistics summary
 *   GET /streams       - x402 paywalled active streams ($0.001 USDC)
 *   GET /streams/:id   - x402 paywalled single stream detail ($0.001 USDC)
 *
 * Run: npm start
 */
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import {
  getStreams,
  getStreamCount,
  getStreamById,
  getStreamStats,
} from './providers/stream-store.js';
import { formatStreamStatus } from './providers/stream.js';
import { x402Provider } from './providers/x402-provider.js';
import { PaymentSettler } from './providers/payment-settler.js';

// --- Payment settler integration (Circle App Kit) ---
const settler = new PaymentSettler(config.deployer.privateKey);
settler.initialize().then((ok) => {
  if (!ok) console.warn('[paystream] PaymentSettler not initialized — settle endpoint will degrade.');
});

const app = express();
app.use(cors());
app.use(express.json());

// --- Build payment requirements for the current request ---
function getRequirements(req) {
  return x402Provider.generateRequirements({
    network: config.arc.networkId,
    asset: `eip155:${config.arc.chainId}/erc20:${config.usdcAddress}`,
    payTo: config.server.walletAddress,
    price: config.signalPrice,
    resource: req.originalUrl,
    description: 'PayStream Arc - Payment stream analytics',
  });
}

// --- Handle x402 payment flow ---
async function handlePaidRequest(req, res, dataFn) {
  const requirements = getRequirements(req);
  const paymentHeader = req.headers['x-payment'];

  // No payment -> return 402
  if (!paymentHeader) {
    return res
      .status(402)
      .set('WWW-Authenticate', x402Provider.createAuthHeader(requirements))
      .json({
        error: 'Payment required',
        x402Version: 1,
        paymentRequirements: requirements,
        message: `Pay $${Number(config.signalPrice) / 1e6} USDC to access this resource`,
      });
  }

  // Parse and verify payment
  const payment = x402Provider.decodePayment(paymentHeader);
  const result = await x402Provider.validatePayment(payment, requirements, config.facilitatorUrl);

  if (!result.valid) {
    return res.status(402).json({
      error: 'Payment verification failed',
      reason: result.reason,
      paymentRequirements: requirements,
    });
  }

  // Payment verified -> return data
  const data = dataFn();
  res.set('X-Payment-Response', x402Provider.createResponseHeader(result.settlement));

  return res.json({
    status: 'success',
    paid: `${Number(config.signalPrice) / 1e6} USDC`,
    settlement: result.settlement,
    ...data,
  });
}

// --- Routes ---

// Health check (free)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    streams: getStreamCount(),
    timestamp: new Date().toISOString(),
  });
});

// Stats (free)
app.get('/stats', (req, res) => {
  const stats = getStreamStats();
  res.json({
    ...stats,
    pricing: {
      perRequest: `${Number(config.signalPrice) / 1e6} USDC`,
      baseUnit: config.signalPrice,
    },
    network: {
      name: config.arc.networkId,
      chainId: config.arc.chainId,
      rpc: config.arc.rpcUrl,
    },
    usdc: config.usdcAddress,
    serverWallet: config.server.walletAddress,
  });
});

// Active payment streams (x402 paywalled)
app.get('/streams', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const status = req.query.status || 'active';

  const rawStreams = getStreams(limit, status);
  const formatted = rawStreams.map(s => formatStreamStatus(s));

  await handlePaidRequest(req, res, () => ({
    streams: formatted,
    count: formatted.length,
    totalAvailable: getStreamCount(),
    params: { limit, status },
  }));
});

// Single stream detail by ID (x402 paywalled)
app.get('/streams/:id', async (req, res) => {
  const stream = getStreamById(req.params.id);
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found', id: req.params.id });
  }

  await handlePaidRequest(req, res, () => ({
    stream: formatStreamStatus(stream),
  }));
});

// Settle a payment stream (x402 paywalled)
app.post('/api/stream/settle', async (req, res) => {
  await handlePaidRequest(req, res, async () => {
    const { streamId, recipient, amount } = req.body || {};
    const result = await settler.settleStream(streamId, recipient, amount);
    return { settlement: result.body, httpCode: result.statusCode };
  });
});

// Get settlement status for a stream (x402 paywalled)
app.get('/api/stream/:id/settlement', async (req, res) => {
  await handlePaidRequest(req, res, () => {
    const streamId = req.params.id;
    const stream = getStreamById(streamId);
    if (!stream) {
      return { settlement: { error: 'Stream not found', streamId } };
    }
    return {
      settlement: {
        streamId,
        initialized: settler.isInitialized(),
        streamStatus: formatStreamStatus(stream),
      },
    };
  });
});

// --- Start server ---
app.listen(config.server.port, () => {
  const price = Number(config.signalPrice) / 1e6;
  console.log('');
  console.log('  \x1b[36m___ PayStream Arc - x402 Server\x1b[0m');
  console.log('');
  console.log(`  \x1b[32mServer running  : http://localhost:${config.server.port}\x1b[0m`);
  console.log('');
  console.log('  Endpoints:');
  console.log(`    GET /health        Free health check`);
  console.log(`    GET /stats         Free stream statistics`);
  console.log(`    GET /streams        Active streams ($${price} USDC per request)`);
  console.log(`    GET /streams/:id    Stream detail   ($${price} USDC per request)`);
  console.log(`    POST /api/stream/settle       Settle stream    ($${price} USDC per request)`);
  console.log(`    GET /api/stream/:id/settlement Settlement status ($${price} USDC per request)`);
  console.log('');
  console.log(`  Payment address : ${config.server.walletAddress}`);
  console.log(`  Network         : ${config.arc.networkId} (chainId ${config.arc.chainId})`);
  console.log('');
  console.log('  \x1b[2mTip: Start the indexer first (npm run indexer) to detect streams.\x1b[0m');
  console.log('');
});
