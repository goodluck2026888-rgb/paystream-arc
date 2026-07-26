/**
 * Payment stream detection and analysis utilities.
 * Detects regular, recurring USDC transfer patterns between address pairs.
 */

// Arc L1 testnet approximate block time in seconds
const BLOCK_TIME_SECONDS = 2;

/**
 * Compute the arithmetic mean of an array of numbers.
 * @param {number[]} arr
 * @returns {number}
 */
function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Compute the standard deviation of an array of numbers.
 * @param {number[]} arr
 * @returns {number}
 */
function stdDev(arr) {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Compute the coefficient of variation (stddev / mean).
 * Returns Infinity if mean is zero.
 * @param {number[]} arr
 * @returns {number}
 */
function coefficientOfVariation(arr) {
  const m = mean(arr);
  if (m === 0) return Infinity;
  return stdDev(arr) / m;
}

/**
 * Calculate the per-second flow rate from a set of recurring transfers.
 * @param {Array} transfers - Array of transfer objects with {value, blockNumber}
 * @returns {number} Flow rate in USDC base units per second
 */
export function computeFlowRate(transfers) {
  if (transfers.length === 0) return 0;

  const totalAmount = transfers.reduce((sum, t) => sum + Number(t.value), 0);
  const firstBlock = Math.min(...transfers.map(t => t.blockNumber));
  const lastBlock = Math.max(...transfers.map(t => t.blockNumber));
  const durationBlocks = Math.max(1, lastBlock - firstBlock);
  const durationSeconds = durationBlocks * BLOCK_TIME_SECONDS;

  return Math.round(totalAmount / durationSeconds);
}

/**
 * Given a list of transfers between the same from->to pair, determine
 * if they form a streaming pattern (regular intervals, similar amounts).
 * @param {Array} transfers - Array of transfer objects with {value, blockNumber, from, to, txHash}
 * @param {Object} addressPair - {sender, receiver}
 * @param {number} minPayments - Minimum payments required (default 3)
 * @returns {{isStream: boolean, flowRate: number, intervalSeconds: number, confidence: number}}
 */
export function detectStreamPattern(transfers, addressPair, minPayments = 3) {
  if (!transfers || transfers.length < minPayments) {
    return { isStream: false, flowRate: 0, intervalSeconds: 0, confidence: 0 };
  }

  // Sort by block number
  const sorted = [...transfers].sort((a, b) => a.blockNumber - b.blockNumber);

  // Compute intervals (block differences between consecutive transfers)
  const intervals = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i].blockNumber - sorted[i - 1].blockNumber);
  }

  // Compute amounts
  const amounts = sorted.map(t => Number(t.value));

  // Coefficient of variation for intervals and amounts
  // Lower CV = more regular pattern
  const intervalCV = coefficientOfVariation(intervals);
  const amountCV = coefficientOfVariation(amounts);

  // Confidence: weighted blend — interval regularity matters more
  // CV of 0 = perfect regularity, CV of 1+ = irregular
  const intervalScore = Math.max(0, 1 - intervalCV);
  const amountScore = Math.max(0, 1 - amountCV);
  const confidence = Math.max(0, Math.min(1, intervalScore * 0.6 + amountScore * 0.4));

  const flowRate = computeFlowRate(sorted);
  const avgIntervalBlocks = mean(intervals);
  const intervalSeconds = Math.round(avgIntervalBlocks * BLOCK_TIME_SECONDS);

  // A stream requires at least moderate confidence
  const isStream = confidence >= 0.4 && intervals.length > 0;

  return { isStream, flowRate, intervalSeconds, confidence };
}

/**
 * Check if a previously active stream has stopped (no transfers for N blocks).
 * @param {Object} stream - Stream record with lastPaymentBlock
 * @param {number} latestBlock - Current block number
 * @param {number} interruptionBlocks - Block threshold for interruption (default 50)
 * @returns {{interrupted: boolean, lastPaymentBlock: number, blocksSinceLastPayment: number}}
 */
export function detectStreamInterruption(stream, latestBlock, interruptionBlocks = 50) {
  const blocksSinceLastPayment = latestBlock - stream.lastPaymentBlock;
  return {
    interrupted: blocksSinceLastPayment >= interruptionBlocks,
    lastPaymentBlock: stream.lastPaymentBlock,
    blocksSinceLastPayment,
  };
}

/**
 * Format a stream record into a human-readable status object.
 * @param {Object} stream - Stream record
 * @returns {Object} Formatted status
 */
export function formatStreamStatus(stream) {
  const flowRateUsd = stream.flowRate / 1e6;
  const totalSentUsd = Number(stream.totalSent) / 1e6;
  const durationBlocks = stream.lastPaymentBlock - stream.startTime;
  const durationSeconds = durationBlocks * BLOCK_TIME_SECONDS;

  const flowRateDisplay = flowRateUsd >= 1
    ? `${flowRateUsd.toFixed(2)} USDC/s`
    : `${(flowRateUsd * 1000).toFixed(3)} mUSDC/s`;

  const totalSentDisplay = totalSentUsd >= 1e6
    ? `$${(totalSentUsd / 1e6).toFixed(2)}M`
    : totalSentUsd >= 1e3
      ? `$${(totalSentUsd / 1e3).toFixed(1)}K`
      : `$${totalSentUsd.toFixed(2)}`;

  const durationDisplay = durationSeconds >= 3600
    ? `${(durationSeconds / 3600).toFixed(1)}h`
    : durationSeconds >= 60
      ? `${(durationSeconds / 60).toFixed(1)}m`
      : `${durationSeconds}s`;

  const senderShort = `${stream.sender.slice(0, 6)}...${stream.sender.slice(-4)}`;
  const receiverShort = `${stream.receiver.slice(0, 6)}...${stream.receiver.slice(-4)}`;

  return {
    streamId: stream.streamId,
    sender: stream.sender,
    receiver: stream.receiver,
    senderShort,
    receiverShort,
    flowRate: stream.flowRate,
    flowRateDisplay,
    totalSent: stream.totalSent,
    totalSentDisplay,
    durationSeconds,
    durationDisplay,
    paymentCount: stream.paymentCount,
    confidence: stream.confidence,
    confidenceDisplay: `${(stream.confidence * 100).toFixed(1)}%`,
    status: stream.status,
    lastPaymentBlock: stream.lastPaymentBlock,
  };
}

/**
 * Group transfers by (from, to) address pair, run detectStreamPattern
 * on each group, and return all detected streams.
 * @param {Array} transfers - All transfer objects with {from, to, value, blockNumber, txHash}
 * @param {number} minPayments - Minimum payments for a stream (default 3)
 * @returns {Array} Detected stream objects
 */
export function analyzeTransfersForStreams(transfers, minPayments = 3) {
  // Group by (from, to) pair
  const groups = new Map();

  for (const t of transfers) {
    const fromLower = t.from.toLowerCase();
    const toLower = t.to.toLowerCase();
    const pairKey = `${fromLower}-${toLower}`;

    if (!groups.has(pairKey)) {
      groups.set(pairKey, {
        sender: fromLower,
        receiver: toLower,
        transfers: [],
      });
    }
    groups.get(pairKey).transfers.push(t);
  }

  const detectedStreams = [];

  for (const [, group] of groups) {
    if (group.transfers.length < minPayments) continue;

    const addressPair = { sender: group.sender, receiver: group.receiver };
    const result = detectStreamPattern(group.transfers, addressPair, minPayments);

    if (!result.isStream) continue;

    const sorted = [...group.transfers].sort((a, b) => a.blockNumber - b.blockNumber);
    const firstBlock = sorted[0].blockNumber;
    const lastBlock = sorted[sorted.length - 1].blockNumber;
    const totalSent = sorted.reduce((sum, t) => sum + BigInt(t.value), BigInt(0));

    detectedStreams.push({
      streamId: `${group.sender}-${group.receiver}`,
      sender: group.sender,
      receiver: group.receiver,
      flowRate: result.flowRate,
      startTime: firstBlock,
      lastPaymentBlock: lastBlock,
      lastPaymentTime: Date.now(),
      totalSent: totalSent.toString(),
      paymentCount: sorted.length,
      status: 'active',
      confidence: result.confidence,
      intervalSeconds: result.intervalSeconds,
    });
  }

  return detectedStreams;
}
