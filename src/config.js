import dotenv from 'dotenv';
dotenv.config();

export const config = {
  arc: {
    rpcUrl: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
    chainId: parseInt(process.env.ARC_CHAIN_ID || '5042002'),
    networkId: process.env.ARC_NETWORK_ID || 'arc-testnet',
    explorer: process.env.ARC_EXPLORER || 'https://testnet.arcscan.app',
  },
  usdcAddress: process.env.USDC_CONTRACT || '0x3600000000000000000000000000000000000000',
  gateway: {
    wallet: process.env.GATEWAY_WALLET || '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
    minter: process.env.GATEWAY_MINTER || '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B',
  },
  streamConfig: {
    minConfidence: parseFloat(process.env.MIN_STREAM_CONFIDENCE || '0.7'),
    interruptionBlocks: parseInt(process.env.INTERRUPTION_BLOCKS || '50'),
    minPaymentsForStream: parseInt(process.env.MIN_PAYMENTS_FOR_STREAM || '3'),
  },
  signalPrice: process.env.SIGNAL_PRICE || '1000', // $0.001 USDC
  server: {
    port: parseInt(process.env.PORT || '3008'),
    walletAddress: process.env.SERVER_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000',
  },
  facilitatorUrl: process.env.FACILITATOR_URL || 'https://gateway-api-testnet.circle.com',
  circle: {
    apiKey: process.env.CIRCLE_API_KEY || '',
    entitySecret: process.env.CIRCLE_ENTITY_SECRET || '',
    walletSetId: process.env.CIRCLE_WALLET_SET_ID || '',
    gatewayUrl: process.env.CIRCLE_GATEWAY_URL || 'https://gateway-api-testnet.circle.com',
  },
  deployer: {
    privateKey: process.env.DEPLOYER_PRIVATE_KEY || '',
  },
};
