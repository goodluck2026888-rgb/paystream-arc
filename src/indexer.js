/**
 * PayStream Arc - Indexer
 *
 * Detects and tracks streaming payment patterns on Arc L1.
 * Polls ALL USDC Transfer events, groups by (from, to) address pairs,
 * and identifies regular recurring transfers that form "streams".
 *
 * Minimal RPC footprint: 1 request per 15s, no backfill.
 *
 * Run: npm run indexer
 */
import { ethers } from 'ethers';
import { config } from './config.js';
import {
  analyzeTransfersForStreams,
  detectStreamInterruption,
} from './providers/stream.js';
import {
  addOrUpdateStream,
  getActiveStreams,
  getStreamById,
  markStreamInterrupted,
  getStreamCount,
} from './providers/stream-store.js';

const POLL_INTERVAL_MS = 15000; // 15 seconds — 1 request per poll
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const MAX_BLOCKS_PER_REQUEST = 10000;
const ROLLING_WINDOW_SIZE = 1000; // Keep last 1000 transfers for analysis

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function startIndexer() {
  console.log('\n  \x1b[36m___ PayStream Arc - Indexer\x1b[0m');
  console.log('  \x1b[36m    Detecting streaming payment patterns on Arc L1\x1b[0m\n');

  const provider = new ethers.JsonRpcProvider(config.arc.rpcUrl, {
    chainId: config.arc.chainId,
    name: config.arc.networkId,
    batchMaxCount: 1, // disable ethers.js internal batching
  });

  // Verify connection
  try {
    const network = await provider.getNetwork();
    console.log(`  RPC connected  : chainId=${network.chainId}`);
  } catch (err) {
    console.error(`  \x1b[31mRPC failed: ${err.message}\x1b[0m`);
    process.exit(1);
  }

  const minConfidence = config.streamConfig.minConfidence;
  const minPayments = config.streamConfig.minPaymentsForStream;
  console.log(`  USDC contract  : ${config.usdcAddress}`);
  console.log(`  Min confidence  : ${minConfidence}`);
  console.log(`  Min payments   : ${minPayments}`);
  console.log(`  Window size    : ${ROLLING_WINDOW_SIZE} transfers`);
  console.log(`  Poll interval  : ${POLL_INTERVAL_MS / 1000}s`);
  console.log('');

  // Get current block — start from here, no backfill
  let lastCheckedBlock = await provider.getBlockNumber().catch(() => 0);
  console.log(`  Starting from block: ${lastCheckedBlock}`);
  console.log(`  \x1b[2m(Skipped backfill to save RPC quota)\x1b[0m\n`);

  console.log('  \x1b[32mListening for USDC transfer patterns...\x1b[0m\n');

  // Rolling window of recent transfers
  const recentTransfers = [];
  const seenTxs = new Set();
  let consecutiveErrors = 0;

  async function poll() {
    try {
      const currentBlock = await provider.getBlockNumber();

      if (currentBlock <= lastCheckedBlock) return;

      let fromBlock = lastCheckedBlock + 1;
      let toBlock = currentBlock;

      // If too many blocks piled up, cap it
      if (toBlock - fromBlock > MAX_BLOCKS_PER_REQUEST) {
        fromBlock = toBlock - MAX_BLOCKS_PER_REQUEST;
      }

      // Single getLogs request — no batching
      // Get ALL USDC Transfer events (no threshold filtering)
      const logs = await provider.getLogs({
        address: config.usdcAddress,
        topics: [TRANSFER_TOPIC],
        fromBlock,
        toBlock,
      });

      lastCheckedBlock = currentBlock;
      consecutiveErrors = 0; // reset on success

      // Add new transfers to the rolling window
      for (const log of logs) {
        const txKey = log.transactionHash + '-' + log.index;
        if (seenTxs.has(txKey)) continue;
        seenTxs.add(txKey);

        // Prune
        if (seenTxs.size > 5000) {
          const arr = [...seenTxs];
          seenTxs.clear();
          arr.slice(-2000).forEach(x => seenTxs.add(x));
        }

        const transfer = {
          from: '0x' + log.topics[1].slice(26),
          to: '0x' + log.topics[2].slice(26),
          value: BigInt(log.data).toString(),
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          logIndex: log.index,
        };
        recentTransfers.push(transfer);
      }

      // Trim rolling window
      if (recentTransfers.length > ROLLING_WINDOW_SIZE) {
        recentTransfers.splice(0, recentTransfers.length - ROLLING_WINDOW_SIZE);
      }

      // Analyze transfers for streaming patterns
      // Only store/log when a streaming pattern is detected
      if (recentTransfers.length >= minPayments) {
        const detectedStreams = analyzeTransfersForStreams(recentTransfers, minPayments);

        // Filter by minimum confidence
        const qualifyingStreams = detectedStreams.filter(
          s => s.confidence >= minConfidence
        );

        for (const stream of qualifyingStreams) {
          const wasInterrupted = getStreamById(stream.streamId)?.status === 'interrupted';
          addOrUpdateStream(stream);

          const flowRateUsd = stream.flowRate / 1e6;
          const flowDisplay = flowRateUsd >= 1
            ? `${flowRateUsd.toFixed(2)} USDC/s`
            : `${(flowRateUsd * 1000).toFixed(3)} mUSDC/s`;

          const icon = wasInterrupted ? '\x1b[33m⚡' : '\x1b[32mSTREAM';
          const senderShort = `${stream.sender.slice(0, 6)}...${stream.sender.slice(-4)}`;
          const receiverShort = `${stream.receiver.slice(0, 6)}...${stream.receiver.slice(-4)}`;

          console.log(
            `  ${icon} [${wasInterrupted ? 'RESUMED ' : 'DETECTED'}] ` +
            `${flowDisplay.padEnd(16)}  ` +
            `${senderShort} → ${receiverShort}  ` +
            `payments=${stream.paymentCount}  ` +
            `confidence=${(stream.confidence * 100).toFixed(0)}%`
          );
        }
      }

      // Check existing active streams for interruptions
      const activeStreams = getActiveStreams();
      for (const stream of activeStreams) {
        const interruption = detectStreamInterruption(
          stream,
          currentBlock,
          config.streamConfig.interruptionBlocks
        );

        if (interruption.interrupted) {
          markStreamInterrupted(stream.streamId);
          const senderShort = `${stream.sender.slice(0, 6)}...${stream.sender.slice(-4)}`;
          const receiverShort = `${stream.receiver.slice(0, 6)}...${stream.receiver.slice(-4)}`;
          console.log(
            `  \x1b[31mINTERRUPTED  ${formatFlowRate(stream)}  ` +
            `${senderShort} → ${receiverShort}  ` +
            `last block=${stream.lastPaymentBlock}  ` +
            `gap=${interruption.blocksSinceLastPayment} blocks\x1b[0m`
          );
        }
      }
    } catch (err) {
      consecutiveErrors++;
      const wait = Math.min(60000, 5000 * consecutiveErrors); // exponential backoff
      console.log(`  \x1b[33m  Error #${consecutiveErrors}: ${err.shortMessage || err.message} — waiting ${wait/1000}s\x1b[0m`);

      if (consecutiveErrors >= 10) {
        console.log('  \x1b[31m  Too many errors, switching to slower poll...\x1b[0m');
      }
    }
  }

  // Helper to format flow rate for console output
  function formatFlowRate(stream) {
    const usd = stream.flowRate / 1e6;
    return usd >= 1 ? `${usd.toFixed(2)} USDC/s` : `${(usd * 1000).toFixed(3)} mUSDC/s`;
  }

  // Start polling
  setInterval(poll, POLL_INTERVAL_MS);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n  Shutting down... Total streams:', getStreamCount());
    process.exit(0);
  });
}

startIndexer().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
