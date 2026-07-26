// x402 Payment Protocol implementation for PayStream Arc.
//
// This module implements the x402 HTTP 402 payment protocol for AI agent
// payments. The flow is:
//   1. Agent requests a resource
//   2. Server returns 402 + WWW-Authenticate header with payment requirements
//   3. Agent pays (USDC transfer) and retries with X-Payment header
//   4. Server verifies payment, returns resource + X-Payment-Response header
//
// Spec: https://x402.org

// Constructor for the x402 payment provider.
// Uses prototype-based methods for clear instance semantics.
function PaymentStream402() {
  var that = this;
  that.scheme = 'x402';
}

// Build the payment requirements object that tells the agent how to pay.
// params: { network, asset, payTo, price, resource, description }
// Returns a payment requirements object.
PaymentStream402.prototype.generateRequirements = function (params) {
  return {
    scheme: 'exact',
    network: params.network,
    asset: params.asset,
    payTo: params.payTo,
    maxAmountRequired: params.price,
    resource: params.resource,
    description: params.description,
    mimeType: 'application/json',
    // Timestamp when the requirements were created
    createdAt: new Date().toISOString(),
    // Payment is valid for 1 hour from creation
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  };
};

// Build the WWW-Authenticate header value for a 402 response.
// requirements: payment requirements object from generateRequirements
// Returns the header string.
PaymentStream402.prototype.createAuthHeader = function (requirements) {
  var that = this;
  return that.scheme + ' ' + JSON.stringify(requirements);
};

// Parse the X-Payment header sent by the agent after payment.
// headerValue: raw header string or undefined
// Returns parsed payment object, or null if invalid.
PaymentStream402.prototype.decodePayment = function (headerValue) {
  if (!headerValue) return null;
  // X-Payment typically contains a base64-encoded JSON payload
  try {
    var decoded = Buffer.from(headerValue, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (e) {
    // Maybe it is raw JSON instead
    try {
      return JSON.parse(headerValue);
    } catch (e2) {
      return null;
    }
  }
};

// Verify a payment against the requirements.
//
// In production, this calls the x402 Facilitator (or Circle Batch
// Facilitator) to verify the on-chain USDC transfer.
//
// payment: parsed payment from decodePayment
// requirements: payment requirements from the 402 response
// facilitatorUrl: URL of the payment facilitator
// Returns { valid, reason?, settlement? }
PaymentStream402.prototype.validatePayment = async function (payment, requirements, facilitatorUrl) {
  var that = this;

  if (!payment) {
    return { valid: false, reason: 'Missing X-Payment header' };
  }

  // Production path: call the facilitator for on-chain verification
  // Skip if facilitator not configured or is a placeholder
  if (facilitatorUrl && !facilitatorUrl.includes('localhost') && !facilitatorUrl.includes('facilitator.arc1.dev')) {
    try {
      var resp = await fetch(facilitatorUrl + '/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment: payment,
          requirements: requirements,
        }),
      });

      if (!resp.ok) {
        var err = await resp.json().catch(function () { return {}; });
        return { valid: false, reason: err.error || ('Facilitator returned ' + resp.status) };
      }

      var result = await resp.json();
      return {
        valid: true,
        settlement: {
          network: requirements.network,
          transactionId: result.transactionId || result.txHash || 'unknown',
          paidAmount: requirements.maxAmountRequired,
        },
      };
    } catch (err) {
      // Facilitator unreachable, fall through to demo verification
      console.warn('[x402] Facilitator unreachable, falling back to demo mode: ' + err.message);
    }
  }

  // Demo/dev path: basic structural verification
  if (!payment.payload && !payment.transactionId && !payment.txHash) {
    return { valid: false, reason: 'Invalid payment format: missing payload or txHash' };
  }

  var payload = payment.payload || payment;
  var paidAmount = BigInt(payload.amount || payload.value || '0');
  var required = BigInt(requirements.maxAmountRequired);

  if (paidAmount < required) {
    return { valid: false, reason: 'Insufficient payment: ' + paidAmount + ' < ' + required };
  }

  if (payload.payTo && payload.payTo.toLowerCase() !== requirements.payTo.toLowerCase()) {
    return { valid: false, reason: 'Wrong payee address' };
  }

  return {
    valid: true,
    settlement: {
      network: requirements.network,
      transactionId: payload.txHash || payment.transactionId || 'demo-verified',
      paidAmount: requirements.maxAmountRequired,
    },
  };
};

// Build the X-Payment-Response header value to return after successful payment.
// settlement: settlement data from validatePayment
// Returns base64-encoded response string.
PaymentStream402.prototype.createResponseHeader = function (settlement) {
  return Buffer.from(JSON.stringify(settlement)).toString('base64');
};

// Export a singleton instance
export var x402Provider = new PaymentStream402();
