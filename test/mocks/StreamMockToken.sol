// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Mock token with stream support for paystream testing
contract StreamMockToken {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public accountBalance;
    mapping(address => mapping(address => uint256)) public spenderApproval;

    // Event emitted when a stream payment occurs
    event StreamPayment(address indexed from, address indexed to, uint256 amount, bytes32 indexed streamId);

    function transfer(address to, uint256 amount) external returns (bool) {
        require(accountBalance[msg.sender] >= amount, "Insufficient balance");
        accountBalance[msg.sender] -= amount;
        accountBalance[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(spenderApproval[from][msg.sender] >= amount, "Insufficient allowance");
        spenderApproval[from][msg.sender] -= amount;
        require(accountBalance[from] >= amount, "Insufficient balance");
        accountBalance[from] -= amount;
        accountBalance[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        spenderApproval[msg.sender][spender] = amount;
        return true;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        accountBalance[to] += amount;
    }

    // Helper to check balance with streaming context
    function streamingBalanceOf(address account) external view returns (uint256) {
        return accountBalance[account];
    }

    // Emit a stream payment event for testing
    function emitStreamPayment(address from, address to, uint256 amount, bytes32 streamId) external {
        emit StreamPayment(from, to, amount, streamId);
    }
}
