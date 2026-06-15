// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { LPGuardianTuringRegistry } from "../src/LPGuardianTuringRegistry.sol";

interface Vm {
    function prank(address) external;
    function expectRevert(bytes calldata) external;
}

contract LPGuardianTuringRegistryTest {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    LPGuardianTuringRegistry private registry;
    address private owner = address(0xA11CE);
    address private operator = address(0xB0B);
    address private outsider = address(0xE11E);
    address private subject = address(0xCAFE);
    bytes32 private codeHash = keccak256("lp-guardian-agent-v1");
    bytes32 private scenarioHash = keccak256("scenario");
    bytes32 private reportHash = keccak256("report");
    bytes32 private outcomeHash = keccak256("outcome");

    function setUp() public {
        registry = new LPGuardianTuringRegistry("LP Guardian Agent", "LPG-AI");
    }

    function testRegisterAgentMintsIdentity() public {
        VM.prank(owner);
        uint256 agentId = registry.register("ipfs://agent", codeHash);

        require(agentId == 1, "wrong id");
        require(registry.ownerOf(agentId) == owner, "wrong owner");
        require(registry.balanceOf(owner) == 1, "wrong balance");
        require(keccak256(bytes(registry.tokenURI(agentId))) == keccak256("ipfs://agent"), "wrong uri");

        LPGuardianTuringRegistry.AgentStats memory stats = registry.getAgentStats(agentId);
        require(stats.owner == owner, "stats owner");
        require(stats.codeHash == codeHash, "stats code hash");
        require(stats.totalDecisions == 0, "initial decisions");
    }

    function testRegisterRejectsEmptyCodeHash() public {
        VM.expectRevert(abi.encodeWithSelector(LPGuardianTuringRegistry.EmptyHash.selector));
        registry.register("ipfs://agent", bytes32(0));
    }

    function testOwnerCanSetMetadataAndUri() public {
        uint256 agentId = _registerOwnerAgent();

        VM.prank(owner);
        registry.setAgentURI(agentId, "ipfs://agent-v2");
        require(keccak256(bytes(registry.tokenURI(agentId))) == keccak256("ipfs://agent-v2"), "uri not updated");

        VM.prank(owner);
        registry.setMetadata(agentId, "mcp", bytes("https://example.com/mcp"));
        bytes memory value = registry.getMetadata(agentId, "mcp");
        require(keccak256(value) == keccak256(bytes("https://example.com/mcp")), "metadata mismatch");
    }

    function testOutsiderCannotRecordDecision() public {
        uint256 agentId = _registerOwnerAgent();

        VM.prank(outsider);
        VM.expectRevert(abi.encodeWithSelector(LPGuardianTuringRegistry.NotAuthorized.selector));
        registry.recordDecision(agentId, subject, scenarioHash, reportHash, 2, 9_000, 5_000, "ipfs://decision");
    }

    function testOwnerRecordsDecision() public {
        uint256 agentId = _registerOwnerAgent();

        VM.prank(owner);
        uint256 decisionId = registry.recordDecision(
            agentId,
            subject,
            scenarioHash,
            reportHash,
            2,
            9_000,
            5_000,
            "ipfs://decision"
        );

        require(decisionId == 1, "wrong decision id");
        LPGuardianTuringRegistry.Decision memory decision = registry.getDecision(decisionId);
        require(decision.agentId == agentId, "decision agent");
        require(decision.subject == subject, "decision subject");
        require(decision.action == 2, "decision action");

        LPGuardianTuringRegistry.AgentStats memory stats = registry.getAgentStats(agentId);
        require(stats.totalDecisions == 1, "decision count");
    }

    function testApprovedOperatorRecordsDecision() public {
        uint256 agentId = _registerOwnerAgent();
        VM.prank(owner);
        registry.setApprovalForAll(operator, true);

        VM.prank(operator);
        uint256 decisionId = registry.recordDecision(
            agentId,
            subject,
            scenarioHash,
            reportHash,
            1,
            7_500,
            3_000,
            "ipfs://decision"
        );

        require(decisionId == 1, "operator decision failed");
    }

    function testInvalidBpsRejected() public {
        uint256 agentId = _registerOwnerAgent();

        VM.prank(owner);
        VM.expectRevert(abi.encodeWithSelector(LPGuardianTuringRegistry.InvalidBps.selector, 10_001));
        registry.recordDecision(agentId, subject, scenarioHash, reportHash, 2, 10_001, 5_000, "ipfs://decision");
    }

    function testOutcomeCanOnlyBeRecordedOnceAndUpdatesScore() public {
        uint256 decisionId = _recordOwnerDecision();

        VM.prank(owner);
        registry.recordOutcome(decisionId, 450, 8_400, outcomeHash, "ipfs://outcome");

        LPGuardianTuringRegistry.Outcome memory outcome = registry.getOutcome(decisionId);
        require(outcome.pnlBps == 450, "pnl");
        require(outcome.scoreBps == 8_400, "score");

        LPGuardianTuringRegistry.AgentStats memory stats = registry.getAgentStats(1);
        require(stats.totalOutcomes == 1, "outcome count");
        require(stats.totalScoreBps == 8_400, "total score");
        require(stats.averageScoreBps == 8_400, "avg score");

        VM.prank(owner);
        VM.expectRevert(abi.encodeWithSelector(LPGuardianTuringRegistry.DuplicateOutcome.selector, decisionId));
        registry.recordOutcome(decisionId, 100, 5_000, keccak256("second"), "ipfs://outcome-2");
    }

    function testOutsiderCannotRecordOutcome() public {
        uint256 decisionId = _recordOwnerDecision();

        VM.prank(outsider);
        VM.expectRevert(abi.encodeWithSelector(LPGuardianTuringRegistry.NotAuthorized.selector));
        registry.recordOutcome(decisionId, 100, 5_000, outcomeHash, "ipfs://outcome");
    }

    function testInvalidOutcomeScoreRejected() public {
        uint256 decisionId = _recordOwnerDecision();

        VM.prank(owner);
        VM.expectRevert(abi.encodeWithSelector(LPGuardianTuringRegistry.InvalidBps.selector, 10_001));
        registry.recordOutcome(decisionId, 100, 10_001, outcomeHash, "ipfs://outcome");
    }

    function testTransferClearsSingleApprovalAndPreservesNewOwnerAuthority() public {
        uint256 agentId = _registerOwnerAgent();

        VM.prank(owner);
        registry.approve(operator, agentId);

        VM.prank(operator);
        registry.transferFrom(owner, outsider, agentId);

        require(registry.ownerOf(agentId) == outsider, "new owner");

        VM.prank(operator);
        VM.expectRevert(abi.encodeWithSelector(LPGuardianTuringRegistry.NotAuthorized.selector));
        registry.recordDecision(agentId, subject, scenarioHash, reportHash, 2, 8_000, 4_000, "ipfs://decision");

        VM.prank(outsider);
        registry.recordDecision(agentId, subject, scenarioHash, reportHash, 2, 8_000, 4_000, "ipfs://decision");
    }

    function _registerOwnerAgent() private returns (uint256 agentId) {
        VM.prank(owner);
        agentId = registry.register("ipfs://agent", codeHash);
    }

    function _recordOwnerDecision() private returns (uint256 decisionId) {
        uint256 agentId = _registerOwnerAgent();
        VM.prank(owner);
        decisionId = registry.recordDecision(
            agentId,
            subject,
            scenarioHash,
            reportHash,
            2,
            9_000,
            5_000,
            "ipfs://decision"
        );
    }
}
