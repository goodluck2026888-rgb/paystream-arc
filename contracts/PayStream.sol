// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PayStream
 * @notice On-chain streaming payment protocol for Arc L1.
 *         Senders start per-second USDC streams to receivers, who can
 *         withdraw accrued balances at any time. Streams can be stopped
 *         by either party.
 *
 * @dev Deploy on Arc L1. USDC must be a standard ERC-20 with 6 decimals.
 *      Flow rate is in USDC base units (6 decimals) per second.
 */
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract PayStream {
    IERC20 public immutable usdc;

    struct Stream {
        bytes32 streamId;
        address sender;
        address receiver;
        uint256 flowRate;      // USDC base units per second
        uint256 startTime;     // block timestamp when stream started
        uint256 stopTime;      // block timestamp when stream stopped (0 if active)
        uint256 withdrawnAmount;
        bool active;
    }

    /// @notice All streams keyed by streamId
    mapping(bytes32 => Stream) public streams;

    /// @notice Array of all streamIds for enumeration
    bytes32[] public streamIds;

    /// @notice StreamIds per sender
    mapping(address => bytes32[]) public senderStreams;

    /// @notice StreamIds per receiver
    mapping(address => bytes32[]) public receiverStreams;

    event StreamStarted(bytes32 indexed streamId, address indexed sender, address indexed receiver, uint256 flowRate);
    event StreamStopped(bytes32 indexed streamId, uint256 totalStreamed);
    event StreamWithdrawn(bytes32 indexed streamId, address indexed receiver, uint256 amount);

    constructor(address _usdc) {
        require(_usdc != address(0), "Invalid USDC address");
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Start a new payment stream.
     * @param _receiver Recipient address
     * @param _flowRate USDC per second in base units (6 decimals)
     * @return streamId The unique stream identifier
     * @dev Caller must pre-approve sufficient USDC for the expected duration.
     */
    function startStream(address _receiver, uint256 _flowRate) external returns (bytes32) {
        require(_receiver != address(0), "Invalid receiver");
        require(_receiver != msg.sender, "Sender != receiver");
        require(_flowRate > 0, "Flow rate must be > 0");

        bytes32 streamId = keccak256(abi.encodePacked(msg.sender, _receiver, block.timestamp));
        require(streams[streamId].sender == address(0), "Stream already exists");

        streams[streamId] = Stream({
            streamId: streamId,
            sender: msg.sender,
            receiver: _receiver,
            flowRate: _flowRate,
            startTime: block.timestamp,
            stopTime: 0,
            withdrawnAmount: 0,
            active: true
        });
        streamIds.push(streamId);
        senderStreams[msg.sender].push(streamId);
        receiverStreams[_receiver].push(streamId);

        emit StreamStarted(streamId, msg.sender, _receiver, _flowRate);
        return streamId;
    }

    /**
     * @notice Stop an active stream. Only the sender or receiver can stop it.
     * @param _streamId Stream to stop
     */
    function stopStream(bytes32 _streamId) external {
        Stream storage s = streams[_streamId];
        require(s.active, "Stream not active");
        require(msg.sender == s.sender || msg.sender == s.receiver, "Not authorized");

        s.active = false;
        s.stopTime = block.timestamp;

        // Calculate total streamed and transfer from sender to receiver
        uint256 duration = block.timestamp - s.startTime;
        uint256 totalStreamed = s.flowRate * duration;
        uint256 transferable = totalStreamed - s.withdrawnAmount;

        if (transferable > 0) {
            require(
                usdc.transferFrom(s.sender, s.receiver, transferable),
                "Final settlement failed"
            );
        }

        emit StreamStopped(_streamId, totalStreamed);
    }

    /**
     * @notice Withdraw accrued streaming balance to the receiver.
     * @param _streamId Stream to withdraw from
     * @dev Transfers the accrued but unwithdrawn amount to the receiver.
     */
    function withdrawFromStream(bytes32 _streamId) external {
        Stream storage s = streams[_streamId];
        require(s.sender != address(0), "Stream not found");
        require(msg.sender == s.receiver, "Only receiver can withdraw");

        uint256 endTime = s.active ? block.timestamp : s.stopTime;
        uint256 duration = endTime - s.startTime;
        uint256 totalStreamed = s.flowRate * duration;
        uint256 withdrawable = totalStreamed - s.withdrawnAmount;

        require(withdrawable > 0, "Nothing to withdraw");
        s.withdrawnAmount += withdrawable;

        require(
            usdc.transferFrom(s.sender, msg.sender, withdrawable),
            "Withdrawal transfer failed"
        );

        emit StreamWithdrawn(_streamId, msg.sender, withdrawable);
    }

    /**
     * @notice Get full stream info.
     * @param _streamId Stream identifier
     * @return Stream struct
     */
    function getStreamInfo(bytes32 _streamId) external view returns (Stream memory) {
        require(streams[_streamId].sender != address(0), "Stream not found");
        return streams[_streamId];
    }

    /**
     * @notice Get all active streamIds.
     * @return Array of active streamIds
     */
    function getActiveStreams() external view returns (bytes32[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < streamIds.length; i++) {
            if (streams[streamIds[i]].active) count++;
        }

        bytes32[] memory active = new bytes32[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < streamIds.length; i++) {
            if (streams[streamIds[i]].active) {
                active[idx++] = streamIds[i];
            }
        }
        return active;
    }

    /**
     * @notice Get total stream count.
     */
    function getStreamCount() external view returns (uint256) {
        return streamIds.length;
    }
}
