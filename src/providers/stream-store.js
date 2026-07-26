/**
 * In-memory payment stream store.
 * Tracks detected streaming patterns, their flow rates, and status.
 * Replace with Redis/Postgres for production multi-instance deployments.
 */
const streams = new Map(); // streamId -> stream record
const MAX_STREAMS = 2000;

/**
 * Add or update a stream record. If the stream already exists, its
 * flow rate, last payment block, total sent, and payment count are updated.
 * @param {Object} stream - Stream record from analyzeTransfersForStreams
 */
export function addOrUpdateStream(stream) {
  const existing = streams.get(stream.streamId);

  if (existing) {
    // Update existing stream
    existing.flowRate = stream.flowRate;
    existing.lastPaymentBlock = stream.lastPaymentBlock;
    existing.lastPaymentTime = stream.lastPaymentTime;
    existing.totalSent = stream.totalSent;
    existing.paymentCount = stream.paymentCount;
    existing.confidence = stream.confidence;
    existing.intervalSeconds = stream.intervalSeconds;
    // If stream was interrupted but new payments arrived, reactivate
    if (existing.status === 'interrupted') {
      existing.status = 'active';
    }
  } else {
    // Create new stream record
    streams.set(stream.streamId, {
      streamId: stream.streamId,
      sender: stream.sender,
      receiver: stream.receiver,
      flowRate: stream.flowRate,
      startTime: stream.startTime,
      lastPaymentBlock: stream.lastPaymentBlock,
      lastPaymentTime: stream.lastPaymentTime,
      totalSent: stream.totalSent,
      paymentCount: stream.paymentCount,
      status: stream.status,
      confidence: stream.confidence,
      intervalSeconds: stream.intervalSeconds,
    });

    // Enforce max size
    if (streams.size > MAX_STREAMS) {
      // Remove the oldest stream by lastPaymentTime
      let oldestKey = null;
      let oldestTime = Infinity;
      for (const [key, val] of streams) {
        if (val.lastPaymentTime < oldestTime) {
          oldestTime = val.lastPaymentTime;
          oldestKey = key;
        }
      }
      if (oldestKey) streams.delete(oldestKey);
    }
  }
}

/**
 * Get recent streams, optionally filtered by status.
 * @param {number} limit - Maximum results
 * @param {string} status - Filter by status ('active', 'interrupted', 'stopped')
 * @returns {Array}
 */
export function getStreams(limit = 10, status = null) {
  let arr = [...streams.values()];
  if (status) {
    arr = arr.filter(s => s.status === status);
  }
  // Sort by lastPaymentTime descending (most recent first)
  arr.sort((a, b) => b.lastPaymentTime - a.lastPaymentTime);
  return arr.slice(0, limit);
}

/**
 * Get total stream count.
 * @returns {number}
 */
export function getStreamCount() {
  return streams.size;
}

/**
 * Get a specific stream by ID.
 * @param {string} streamId - Stream identifier
 * @returns {Object|null}
 */
export function getStreamById(streamId) {
  const stream = streams.get(streamId);
  return stream || null;
}

/**
 * Get all active streams.
 * @returns {Array}
 */
export function getActiveStreams() {
  return [...streams.values()].filter(s => s.status === 'active');
}

/**
 * Mark a stream as interrupted.
 * @param {string} streamId - Stream identifier
 */
export function markStreamInterrupted(streamId) {
  const stream = streams.get(streamId);
  if (stream && stream.status === 'active') {
    stream.status = 'interrupted';
  }
}

/**
 * Get aggregate stream statistics.
 * @returns {Object}
 */
export function getStreamStats() {
  const all = [...streams.values()];
  const active = all.filter(s => s.status === 'active');
  const interrupted = all.filter(s => s.status === 'interrupted');
  const totalFlowRate = active.reduce((sum, s) => sum + s.flowRate, 0);
  const totalVolume = all.reduce((sum, s) => sum + Number(s.totalSent), 0);

  return {
    totalStreams: all.length,
    activeStreams: active.length,
    interruptedStreams: interrupted.length,
    totalFlowRate,
    totalFlowRateDisplay: `${(totalFlowRate / 1e6).toFixed(6)} USDC/s`,
    totalVolumeStreamed: totalVolume.toString(),
    totalVolumeStreamedUsd: totalVolume / 1e6,
    avgConfidence: all.length > 0
      ? (all.reduce((sum, s) => sum + s.confidence, 0) / all.length).toFixed(4)
      : '0',
  };
}
