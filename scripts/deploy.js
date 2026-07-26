/**
 * PayStream Arc - Deploy Script
 *
 * Deploys the PayStream contract to Arc L1.
 *
 * Prerequisites:
 *   Option A (Foundry): Install Foundry, then:
 *     forge create contracts/PayStream.sol:PayStream \
 *       --rpc-url $ARC_RPC_URL \
 *       --private-key $DEPLOYER_PRIVATE_KEY \
 *       --constructor-args $USDC_CONTRACT
 *
 *   Option B ( Remix / Hardhat ): Compile contracts/PayStream.sol and
 *     deploy with constructor arg = USDC contract address.
 *
 *   Option C ( This script ): Uses ethers.js with a pre-compiled bytecode.
 *     You need to compile the contract first and paste the bytecode below.
 *
 * Run: npm run deploy
 */
import { ethers } from 'ethers';
import { config } from '../src/config.js';

// --- ABI of the PayStream contract ---
const PAYSTREAM_ABI = [
  'constructor(address usdc)',
  'function startStream(address receiver, uint256 flowRate) external returns (bytes32)',
  'function stopStream(bytes32 streamId) external',
  'function withdrawFromStream(bytes32 streamId) external',
  'function getStreamInfo(bytes32 streamId) external view returns (tuple)',
  'function getActiveStreams() external view returns (bytes32[])',
  'function getStreamCount() external view returns (uint256)',
  'function streams(bytes32) external view returns (tuple)',
  'function senderStreams(address) external view returns (bytes32[])',
  'function receiverStreams(address) external view returns (bytes32[])',
  'event StreamStarted(bytes32 streamId, address sender, address receiver, uint256 flowRate)',
  'event StreamStopped(bytes32 streamId, uint256 totalStreamed)',
  'event StreamWithdrawn(bytes32 streamId, address receiver, uint256 amount)',
];

// --- Paste compiled bytecode here after running `forge build` ---
// Get it from: out/PayStream.sol/PayStream.json -> "bytecode" object
const PAYSTREAM_BYTECODE = '0x'; // <-- Replace with compiled bytecode

async function deploy() {
  const privateKey = config.deployer.privateKey;
  if (!privateKey) {
    console.error('\n  ERROR: Set DEPLOYER_PRIVATE_KEY in .env\n');
    process.exit(1);
  }

  if (PAYSTREAM_BYTECODE === '0x') {
    console.log('');
    console.log('  \x1b[33mBytecode not set. To deploy with this script:\x1b[0m');
    console.log('');
    console.log('  1. Install Foundry:  curl -L https://foundry.paradigm.xyz | bash');
    console.log('  2. Compile:          forge build');
    console.log('  3. Copy bytecode from out/PayStream.sol/PayStream.json');
    console.log('  4. Paste it into scripts/deploy.js (PAYSTREAM_BYTECODE)');
    console.log('  5. Run:              npm run deploy');
    console.log('');
    console.log('  \x1b[2mOr deploy directly with Forge:\x1b[0m');
    console.log('');
    console.log('  forge create contracts/PayStream.sol:PayStream \\');
    console.log('    --rpc-url ' + config.arc.rpcUrl + ' \\');
    console.log('    --private-key $DEPLOYER_PRIVATE_KEY \\');
    console.log('    --constructor-args ' + config.usdcAddress);
    console.log('');
    process.exit(0);
  }

  const provider = new ethers.JsonRpcProvider(config.arc.rpcUrl, {
    chainId: config.arc.chainId,
    name: config.arc.networkId,
  });

  const wallet = new ethers.Wallet(privateKey, provider);

  console.log('\n  Deploying PayStream to Arc L1...');
  console.log(`  Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`  Balance:  ${ethers.formatEther(balance)} ETH\n`);

  const factory = new ethers.ContractFactory(
    PAYSTREAM_ABI,
    PAYSTREAM_BYTECODE,
    wallet
  );

  const contract = await factory.deploy(config.usdcAddress);
  console.log(`  Tx hash:      ${contract.deploymentTransaction()?.hash}`);
  console.log('  Waiting for confirmation...');

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`\n  \x1b[32mPayStream deployed at: ${address}\x1b[0m`);
  console.log(`  Explorer: ${config.arc.explorer}/address/${address}`);
  console.log(`  USDC:     ${config.usdcAddress}`);
  console.log(`  Price:    $${Number(config.signalPrice) / 1e6} USDC per request\n`);

  // Save deployed address
  console.log('  Add to .env:');
  console.log(`  PAYSTREAM_ADDRESS=${address}\n`);
}

deploy().catch(err => {
  console.error('\n  Deploy failed:', err.message, '\n');
  process.exit(1);
});
