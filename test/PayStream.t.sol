// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/PayStream.sol";
import "./mocks/StreamMockToken.sol";

contract PayStreamTest is Test {
    PayStream public stream;
    StreamMockToken public usdc;
    address public sender = address(0xA1);
    address public receiver = address(0xA2);

    function setUp() public {
        usdc = new StreamMockToken();
        stream = new PayStream(address(usdc));
    }

    function testStartStream() public {
        vm.prank(sender);
        bytes32 streamId = stream.startStream(receiver, 100);

        assertTrue(streamId != bytes32(0));
        assertEq(stream.getStreamCount(), 1);

        PayStream.Stream memory s = stream.getStreamInfo(streamId);
        assertEq(s.sender, sender);
        assertEq(s.receiver, receiver);
        assertEq(s.flowRate, 100);
        assertTrue(s.active);
    }

    function testGetActiveStreams() public {
        vm.startPrank(sender);
        stream.startStream(receiver, 100);
        stream.startStream(address(0xA3), 200); // Different receiver = different streamId
        vm.stopPrank();

        bytes32[] memory active = stream.getActiveStreams();
        assertEq(active.length, 2);
    }

    function testStopStream() public {
        vm.startPrank(sender);
        bytes32 streamId = stream.startStream(receiver, 100);

        // Need USDC for the transferFrom in stopStream
        usdc.mint(sender, 1_000_000);
        usdc.approve(address(stream), 1_000_000);

        vm.warp(block.timestamp + 100); // 100 seconds at 100/sec = 10_000 units
        stream.stopStream(streamId);
        vm.stopPrank();

        PayStream.Stream memory s = stream.getStreamInfo(streamId);
        assertFalse(s.active);
    }

    function testWithdrawFromStream() public {
        vm.startPrank(sender);
        bytes32 streamId = stream.startStream(receiver, 100);

        usdc.mint(sender, 1_000_000);
        usdc.approve(address(stream), 1_000_000);
        vm.stopPrank();

        vm.warp(block.timestamp + 50); // 50 seconds at 100/sec = 5_000

        // Only receiver can withdraw
        vm.prank(receiver);
        stream.withdrawFromStream(streamId);

        // Receiver should have received the streamed amount
        assertGt(usdc.balanceOf(receiver), 0);
    }

    function testCannotStartStreamToZeroAddress() public {
        vm.prank(sender);
        vm.expectRevert();
        stream.startStream(address(0), 100);
    }
}
