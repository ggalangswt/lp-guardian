// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LPGuardianTuringRegistry
/// @notice ERC-8004-compatible identity subset plus app-specific agent decision benchmarking.
/// @dev ERC-8004 is still a draft. This contract implements the Identity Registry shape
///      with ERC-721 ownership, agentURI, and metadata, then records LP Guardian decisions
///      and benchmark outcomes for Mantle Turing Test demos.
contract LPGuardianTuringRegistry {
    uint16 public constant BPS_DENOMINATOR = 10_000;
    bytes4 private constant ERC165_INTERFACE_ID = 0x01ffc9a7;
    bytes4 private constant ERC721_INTERFACE_ID = 0x80ac58cd;
    bytes4 private constant ERC721_METADATA_INTERFACE_ID = 0x5b5e139f;

    string public name;
    string public symbol;
    uint256 public nextAgentId = 1;
    uint256 public nextDecisionId = 1;

    struct Agent {
        address owner;
        bytes32 codeHash;
        uint64 registeredAt;
        uint64 updatedAt;
        uint64 totalDecisions;
        uint64 totalOutcomes;
        uint256 totalScoreBps;
        string agentURI;
    }

    struct Decision {
        uint256 agentId;
        address subject;
        bytes32 scenarioHash;
        bytes32 reportHash;
        uint8 action;
        uint16 confidenceBps;
        uint16 riskScoreBps;
        uint64 timestamp;
        bool hasOutcome;
        string metadataURI;
    }

    struct Outcome {
        uint256 decisionId;
        uint256 agentId;
        int256 pnlBps;
        uint16 scoreBps;
        bytes32 outcomeHash;
        uint64 timestamp;
        string metadataURI;
    }

    struct AgentStats {
        address owner;
        bytes32 codeHash;
        uint64 registeredAt;
        uint64 updatedAt;
        uint64 totalDecisions;
        uint64 totalOutcomes;
        uint256 totalScoreBps;
        uint256 averageScoreBps;
    }

    mapping(uint256 => Agent) private agents;
    mapping(uint256 => Decision) private decisions;
    mapping(uint256 => Outcome) private outcomes;
    mapping(uint256 => mapping(bytes32 => bytes)) private metadata;

    mapping(uint256 => address) private tokenApprovals;
    mapping(address => uint256) private balances;
    mapping(address => mapping(address => bool)) private operatorApprovals;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedMetadataKey,
        string metadataKey,
        bytes metadataValue
    );
    event DecisionRecorded(
        uint256 indexed decisionId,
        uint256 indexed agentId,
        address indexed subject,
        bytes32 scenarioHash,
        bytes32 reportHash,
        uint8 action,
        uint16 confidenceBps,
        uint16 riskScoreBps,
        string metadataURI
    );
    event OutcomeRecorded(
        uint256 indexed decisionId,
        uint256 indexed agentId,
        int256 pnlBps,
        uint16 scoreBps,
        bytes32 outcomeHash,
        string metadataURI
    );

    error AgentNotFound(uint256 agentId);
    error DecisionNotFound(uint256 decisionId);
    error DuplicateOutcome(uint256 decisionId);
    error InvalidBps(uint256 value);
    error EmptyHash();
    error EmptyMetadataKey();
    error NotAuthorized();
    error ZeroAddress();

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function register(string calldata agentURI, bytes32 codeHash) external returns (uint256 agentId) {
        if (codeHash == bytes32(0)) revert EmptyHash();

        agentId = nextAgentId++;
        agents[agentId] = Agent({
            owner: msg.sender,
            codeHash: codeHash,
            registeredAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            totalDecisions: 0,
            totalOutcomes: 0,
            totalScoreBps: 0,
            agentURI: agentURI
        });
        balances[msg.sender] += 1;

        emit Transfer(address(0), msg.sender, agentId);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encode(msg.sender));
        emit Registered(agentId, agentURI, msg.sender);
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        _requireAgent(agentId);
        if (!_isAuthorized(msg.sender, agentId)) revert NotAuthorized();

        Agent storage agent = agents[agentId];
        agent.agentURI = newURI;
        agent.updatedAt = uint64(block.timestamp);

        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue) external {
        _requireAgent(agentId);
        if (!_isAuthorized(msg.sender, agentId)) revert NotAuthorized();
        if (bytes(metadataKey).length == 0) revert EmptyMetadataKey();
        if (_same(metadataKey, "agentWallet")) revert NotAuthorized();

        metadata[agentId][keccak256(bytes(metadataKey))] = metadataValue;
        agents[agentId].updatedAt = uint64(block.timestamp);

        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    function getMetadata(uint256 agentId, string calldata metadataKey) external view returns (bytes memory) {
        _requireAgent(agentId);
        if (bytes(metadataKey).length == 0) revert EmptyMetadataKey();
        if (_same(metadataKey, "agentWallet")) return abi.encode(agents[agentId].owner);
        return metadata[agentId][keccak256(bytes(metadataKey))];
    }

    function recordDecision(
        uint256 agentId,
        address subject,
        bytes32 scenarioHash,
        bytes32 reportHash,
        uint8 action,
        uint16 confidenceBps,
        uint16 riskScoreBps,
        string calldata metadataURI
    ) external returns (uint256 decisionId) {
        _requireAgent(agentId);
        if (!_isAuthorized(msg.sender, agentId)) revert NotAuthorized();
        if (subject == address(0)) revert ZeroAddress();
        if (scenarioHash == bytes32(0) || reportHash == bytes32(0)) revert EmptyHash();
        _requireBps(confidenceBps);
        _requireBps(riskScoreBps);

        decisionId = nextDecisionId++;
        decisions[decisionId] = Decision({
            agentId: agentId,
            subject: subject,
            scenarioHash: scenarioHash,
            reportHash: reportHash,
            action: action,
            confidenceBps: confidenceBps,
            riskScoreBps: riskScoreBps,
            timestamp: uint64(block.timestamp),
            hasOutcome: false,
            metadataURI: metadataURI
        });
        agents[agentId].totalDecisions += 1;

        emit DecisionRecorded(
            decisionId,
            agentId,
            subject,
            scenarioHash,
            reportHash,
            action,
            confidenceBps,
            riskScoreBps,
            metadataURI
        );
    }

    function recordOutcome(
        uint256 decisionId,
        int256 pnlBps,
        uint16 scoreBps,
        bytes32 outcomeHash,
        string calldata metadataURI
    ) external {
        Decision storage decision = decisions[decisionId];
        if (decision.agentId == 0) revert DecisionNotFound(decisionId);
        if (!_isAuthorized(msg.sender, decision.agentId)) revert NotAuthorized();
        if (decision.hasOutcome) revert DuplicateOutcome(decisionId);
        if (outcomeHash == bytes32(0)) revert EmptyHash();
        _requireBps(scoreBps);

        decision.hasOutcome = true;
        outcomes[decisionId] = Outcome({
            decisionId: decisionId,
            agentId: decision.agentId,
            pnlBps: pnlBps,
            scoreBps: scoreBps,
            outcomeHash: outcomeHash,
            timestamp: uint64(block.timestamp),
            metadataURI: metadataURI
        });

        Agent storage agent = agents[decision.agentId];
        agent.totalOutcomes += 1;
        agent.totalScoreBps += scoreBps;
        agent.updatedAt = uint64(block.timestamp);

        emit OutcomeRecorded(decisionId, decision.agentId, pnlBps, scoreBps, outcomeHash, metadataURI);
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        _requireAgent(agentId);
        return agents[agentId];
    }

    function getDecision(uint256 decisionId) external view returns (Decision memory) {
        if (decisions[decisionId].agentId == 0) revert DecisionNotFound(decisionId);
        return decisions[decisionId];
    }

    function getOutcome(uint256 decisionId) external view returns (Outcome memory) {
        if (outcomes[decisionId].agentId == 0) revert DecisionNotFound(decisionId);
        return outcomes[decisionId];
    }

    function getAgentStats(uint256 agentId) external view returns (AgentStats memory stats) {
        Agent storage agent = agents[agentId];
        if (agent.owner == address(0)) revert AgentNotFound(agentId);
        uint256 averageScore = agent.totalOutcomes == 0
            ? 0
            : agent.totalScoreBps / uint256(agent.totalOutcomes);

        stats = AgentStats({
            owner: agent.owner,
            codeHash: agent.codeHash,
            registeredAt: agent.registeredAt,
            updatedAt: agent.updatedAt,
            totalDecisions: agent.totalDecisions,
            totalOutcomes: agent.totalOutcomes,
            totalScoreBps: agent.totalScoreBps,
            averageScoreBps: averageScore
        });
    }

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        return balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = agents[tokenId].owner;
        if (owner == address(0)) revert AgentNotFound(tokenId);
        return owner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        _requireAgent(tokenId);
        return agents[tokenId].agentURI;
    }

    function approve(address to, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        if (msg.sender != owner && !operatorApprovals[owner][msg.sender]) revert NotAuthorized();
        tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        _requireAgent(tokenId);
        return tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        if (operator == msg.sender) revert NotAuthorized();
        operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return operatorApprovals[owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        if (to == address(0)) revert ZeroAddress();
        address owner = ownerOf(tokenId);
        if (owner != from) revert NotAuthorized();
        if (!_isAuthorized(msg.sender, tokenId)) revert NotAuthorized();

        delete tokenApprovals[tokenId];
        balances[from] -= 1;
        balances[to] += 1;
        agents[tokenId].owner = to;
        agents[tokenId].updatedAt = uint64(block.timestamp);

        emit Transfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == ERC165_INTERFACE_ID ||
            interfaceId == ERC721_INTERFACE_ID ||
            interfaceId == ERC721_METADATA_INTERFACE_ID;
    }

    function _requireAgent(uint256 agentId) private view {
        if (agents[agentId].owner == address(0)) revert AgentNotFound(agentId);
    }

    function _isAuthorized(address account, uint256 agentId) private view returns (bool) {
        address owner = agents[agentId].owner;
        return account == owner ||
            tokenApprovals[agentId] == account ||
            operatorApprovals[owner][account];
    }

    function _requireBps(uint256 value) private pure {
        if (value > BPS_DENOMINATOR) revert InvalidBps(value);
    }

    function _same(string calldata left, string memory right) private pure returns (bool) {
        return keccak256(bytes(left)) == keccak256(bytes(right));
    }
}
