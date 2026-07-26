/**
 * PaymentSettler — settles USDC payment streams via Circle App Kit send().
 *
 * Uses a prototype-based constructor pattern so that each instance carries
 * its own kit/adapter state while sharing method implementations on the
 * prototype chain.
 */
import { AppKit } from '@circle-fin/app-kit';
import { createViemAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2';

/**
 * Constructor: stores private-key and chain config for later initialization.
 * @param {string} privateKey - EVM private key (hex string with 0x prefix)
 */
function PaymentSettler(privateKey) {
  // Step 1: Persist the private key supplied by the caller.
  this._privateKey = privateKey || '';
  // Step 2: Hold references that will be created during initialize().
  this.kit = null;
  this._adapter = null;
  // Step 3: Default chain — Arc Testnet.
  this._chain = 'Arc_Testnet';
  // Step 4: Default token for stream settlement.
  this._token = 'USDC';
  // Step 5: Track readiness flag.
  this._initialized = false;
  // Step 6: Kit configuration key (optional).
  this._kitKey = process.env.KIT_KEY || '';
}

/**
 * Initialize the AppKit instance and viem adapter.
 * Returns true on success, false on failure.
 */
PaymentSettler.prototype.initialize = async function () {
  // Step 1: Guard — refuse to init without a private key.
  if (!this._privateKey) {
    console.warn('[PaymentSettler] No private key supplied; remaining uninitialized.');
    return false;
  }
  // Step 2: Create the AppKit instance.
  var that = this;
  try {
    that.kit = new AppKit();
    // Step 3: Create the viem adapter from the stored private key.
    that._adapter = createViemAdapterFromPrivateKey({ privateKey: that._privateKey });
    // Step 4: Flip the readiness flag.
    that._initialized = true;
    console.log('[PaymentSettler] Initialized successfully. chain=' + that._chain);
    return true;
  } catch (err) {
    // Step 5: On failure, ensure we stay in a clean degraded state.
    console.warn('[PaymentSettler] initialize() error:', JSON.stringify(err && err.message || err));
    that.kit = null;
    that._adapter = null;
    that._initialized = false;
    return false;
  }
};

/**
 * Settle a payment stream by sending USDC to the recipient via kit.send().
 * @param {string} streamId  - Logical identifier for the stream being settled.
 * @param {string} recipient - Recipient wallet address (0x-prefixed hex).
 * @param {string} amount    - Human-readable amount (e.g. "5.00").
 * @returns {Object} Result with statusCode and body properties.
 */
PaymentSettler.prototype.settleStream = async function (streamId, recipient, amount) {
  // Step 1: Verify that the settler has been initialized.
  if (!this.isInitialized()) {
    return {
      statusCode: 503,
      body: { error: 'PaymentSettler not initialized', streamId: streamId },
    };
  }
  // Step 2: Validate required parameters.
  if (!streamId || !recipient || !amount) {
    return {
      statusCode: 400,
      body: { error: 'Missing required fields: streamId, recipient, amount' },
    };
  }
  // Step 3: Execute the send via Circle App Kit.
  var that = this;
  try {
    console.log('[PaymentSettler] Settling stream ' + streamId + ' -> ' + recipient + ' amount=' + amount);
    var sendResult = await that.kit.send({
      from: { adapter: that._adapter, chain: that._chain },
      to: recipient,
      amount: amount,
      token: that._token,
    });
    // Step 4: Return a success response with settlement details.
    return {
      statusCode: 200,
      body: {
        status: 'settled',
        streamId: streamId,
        recipient: recipient,
        amount: amount,
        token: that._token,
        chain: that._chain,
        transaction: sendResult,
      },
    };
  } catch (err) {
    // Step 5: Return an error response if the send fails.
    console.warn('[PaymentSettler] settleStream() error:', JSON.stringify(err && err.message || err));
    return {
      statusCode: 500,
      body: {
        error: 'Settlement failed',
        streamId: streamId,
        detail: (err && err.message) || String(err),
      },
    };
  }
};

/**
 * Check whether the settler has been initialized.
 * @returns {boolean}
 */
PaymentSettler.prototype.isInitialized = function () {
  return this._initialized === true && this.kit !== null && this._adapter !== null;
};

export { PaymentSettler };
