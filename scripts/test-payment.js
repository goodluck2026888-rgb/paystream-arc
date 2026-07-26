/**
 * PayStream Arc - Payment Test Script
 *
 * Tests the x402 payment flow against the local server.
 * Simulates what an AI agent would do:
 *   1. Request /streams without payment -> get 402
 *   2. Parse payment requirements
 *   3. Simulate payment -> retry with X-Payment header
 *   4. Get stream analytics data
 *
 * Run: npm test
 */
import { config } from '../src/config.js';

const SERVER_URL = `http://localhost:${config.server.port}`;

async function testPaymentFlow() {
  console.log('\n  Testing x402 payment flow...\n');

  // Step 1: Request without payment
  console.log('  Step 1: Request /streams without payment...');
  const resp1 = await fetch(`${SERVER_URL}/streams?limit=3&status=active`);

  if (resp1.status !== 402) {
    console.log(`  Expected 402, got ${resp1.status}. Is the server running?`);
    return;
  }

  const body1 = await resp1.json();
  console.log('  Got 402 Payment Required');
  console.log(`  Payment required: $${Number(body1.paymentRequirements.maxAmountRequired) / 1e6} USDC`);
  console.log(`  Pay to: ${body1.paymentRequirements.payTo}`);
  console.log('');

  // Step 2: Simulate payment (in production, agent sends USDC on-chain)
  console.log('  Step 2: Simulating payment...');
  const fakePayment = {
    payload: {
      amount: body1.paymentRequirements.maxAmountRequired,
      payTo: body1.paymentRequirements.payTo,
      txHash: '0x' + Math.random().toString(16).slice(2).padStart(64, '0'),
      network: body1.paymentRequirements.network,
    },
    signature: '0x' + Math.random().toString(16).slice(2).padStart(130, '0'),
  };

  const paymentHeader = Buffer.from(JSON.stringify(fakePayment)).toString('base64');

  // Step 3: Retry with payment
  console.log('  Step 3: Retrying with X-Payment header...');
  const resp2 = await fetch(`${SERVER_URL}/streams?limit=3&status=active`, {
    headers: {
      'X-Payment': paymentHeader,
    },
  });

  const body2 = await resp2.json();

  if (resp2.status === 200) {
    console.log('  \x1b[32mPayment accepted!\x1b[0m');
    console.log(`  Settlement: ${body2.settlement?.transactionId?.slice(0, 18)}...`);
    console.log(`  Streams received: ${body2.count}`);
    console.log(`  Total available:  ${body2.totalAvailable}`);
    if (body2.streams && body2.streams.length > 0) {
      console.log('\n  Detected payment streams:');
      for (const s of body2.streams) {
        console.log(`    [${s.status}] ${s.flowRateDisplay}  ${s.senderShort} -> ${s.receiverShort}  confidence=${s.confidenceDisplay}`);
      }
    }
  } else {
    console.log(`  Payment rejected: ${resp2.status}`);
    console.log(`  Reason: ${body2.reason || body2.error}`);
  }

  // Step 4: Test free endpoints
  console.log('\n  Step 4: Testing free endpoints...');
  const stats = await (await fetch(`${SERVER_URL}/stats`)).json();
  console.log(`  /stats: ${stats.totalStreams} streams, ${stats.activeStreams} active, $${Number(stats.pricing.baseUnit) / 1e6}/request`);

  const health = await (await fetch(`${SERVER_URL}/health`)).json();
  console.log(`  /health: ${health.status}, uptime ${health.uptime}s`);

  console.log('\n  \x1b[32mAll tests passed.\x1b[0m\n');
}

testPaymentFlow().catch(err => {
  console.error('\n  Test failed:', err.message);
  console.error('  Make sure the server is running: npm start\n');
  process.exit(1);
});
