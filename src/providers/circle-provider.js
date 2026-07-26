// Circle integration for PayStream Arc.
//
// Provides access to Circle Wallets, Gateway, and Batch Facilitator:
//   - Circle Wallets: Developer-controlled wallets for receiving USDC payments
//   - Circle Gateway: Cross-chain transfer and settlement
//   - Batch Facilitator: Verifies and settles x402 payments in batches
//
// Docs: https://developers.circle.com

import crypto from 'crypto';
import { config } from '../config.js';

// Constructor for the Circle payment provider.
// Reads configuration from the shared config module.
function CirclePayStream() {
  var self = this;
  self.apiKey = config.circle.apiKey;
  self.gatewayUrl = config.circle.gatewayUrl;
  self.walletSetId = config.circle.walletSetId;
  self.entitySecret = config.circle.entitySecret;
}

// Check if Circle integration is properly configured.
// Returns true if both API key and wallet set ID are present.
CirclePayStream.prototype.hasConfig = function () {
  var self = this;
  return !!(self.apiKey && self.walletSetId);
};

// Create a developer-controlled wallet on Arc L1.
// POST /v1/w3s/wallets
// idempotencyKey: optional key for idempotent requests
// Returns the API response as JSON.
CirclePayStream.prototype.provisionWallet = async function (idempotencyKey) {
  var self = this;
  if (!self.hasConfig()) {
    return { error: 'Circle not configured. Set CIRCLE_API_KEY and CIRCLE_WALLET_SET_ID.' };
  }

  var response = await fetch(self.gatewayUrl + '/v1/w3s/wallets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': self.apiKey,
    },
    body: JSON.stringify({
      idempotencyKey: idempotencyKey || crypto.randomUUID(),
      blockchains: ['ARCL1'],
      count: 1,
      walletSetId: self.walletSetId,
    }),
  });

  return response.json();
};

// Get a cross-chain transfer quote via Circle Gateway.
// POST /v1/gateway/quote
// params: { sourceChain, destinationChain, amount, token }
// Returns the API response as JSON.
CirclePayStream.prototype.getGatewayQuote = async function (params) {
  var self = this;
  if (!self.hasConfig()) {
    return { error: 'Circle not configured.' };
  }

  var response = await fetch(self.gatewayUrl + '/v1/gateway/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': self.apiKey,
    },
    body: JSON.stringify({
      sourceChain: params.sourceChain,
      destinationChain: params.destinationChain,
      amount: params.amount,
      token: params.token,
    }),
  });

  return response.json();
};

// Verify an x402 payment via the Batch Facilitator.
// POST /v1/facilitator/verify
// payment: parsed payment object
// requirements: payment requirements object
// Returns the API response as JSON.
CirclePayStream.prototype.verify = async function (payment, requirements) {
  var self = this;
  var response = await fetch(self.gatewayUrl + '/v1/facilitator/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': self.apiKey,
    },
    body: JSON.stringify({
      payment: payment,
      requirements: requirements,
    }),
  });

  return response.json();
};

// Settle an x402 payment (claim the funds) via the Batch Facilitator.
// POST /v1/facilitator/settle
// payment: parsed payment object
// requirements: payment requirements object
// Returns the API response as JSON.
CirclePayStream.prototype.settle = async function (payment, requirements) {
  var self = this;
  var response = await fetch(self.gatewayUrl + '/v1/facilitator/settle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': self.apiKey,
    },
    body: JSON.stringify({
      payment: payment,
      requirements: requirements,
    }),
  });

  return response.json();
};

// Export a singleton instance
export var circleProvider = new CirclePayStream();
