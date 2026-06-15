// Minimal ABIs for the contracts the data pipeline touches. Kept as viem
// const-arrays so calls are fully typed.

export const erc20Abi = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

// Uniswap V3 NonfungiblePositionManager (same address on Arbitrum as mainnet).
export const univ3PositionManagerAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

// Camelot V3 (Algebra) NonfungiblePositionManager — no static fee field.
export const algebraPositionManagerAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

export const univ3FactoryAbi = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;

export const univ3PoolAbi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "tickSpacing",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "int24" }],
  },
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
  {
    type: "function",
    name: "feeGrowthGlobal0X128",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "feeGrowthGlobal1X128",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "ticks",
    stateMutability: "view",
    inputs: [{ name: "tick", type: "int24" }],
    outputs: [
      { name: "liquidityGross", type: "uint128" },
      { name: "liquidityNet", type: "int128" },
      { name: "feeGrowthOutside0X128", type: "uint256" },
      { name: "feeGrowthOutside1X128", type: "uint256" },
      { name: "tickCumulativeOutside", type: "int56" },
      { name: "secondsPerLiquidityOutsideX128", type: "uint160" },
      { name: "secondsOutside", type: "uint32" },
      { name: "initialized", type: "bool" },
    ],
  },
] as const;

// Camelot/Algebra pool — current price/tick lives in globalState(). Algebra
// versions differ in the trailing fields (and some encode `unlocked` as a value
// viem won't accept as bool), so we only declare the leading fields we use;
// viem reads these and ignores the rest.
export const algebraPoolAbi = [
  {
    type: "function",
    name: "globalState",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "price", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "fee", type: "uint16" },
    ],
  },
  {
    type: "function",
    name: "tickSpacing",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "int24" }],
  },
] as const;

export const algebraFactoryAbi = [
  {
    type: "function",
    name: "poolByPair",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;

// --- Stylus contracts on Robinhood Chain (from contracts/*/abi) ---

export const portfolioReportRegistryAbi = [
  {
    type: "function",
    name: "publishReport",
    stateMutability: "nonpayable",
    inputs: [
      { name: "portfolio_owner", type: "address" },
      { name: "subject_id", type: "uint256" },
      { name: "root_hash", type: "bytes32" },
      { name: "attestation_hash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getReport",
    stateMutability: "view",
    inputs: [{ name: "root_hash", type: "bytes32" }],
    outputs: [
      { type: "address" },
      { type: "uint256" },
      { type: "address" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "reportCount",
    stateMutability: "view",
    inputs: [{ name: "subject_id", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "reportAt",
    stateMutability: "view",
    inputs: [
      { name: "subject_id", type: "uint256" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "bytes32" }],
  },
] as const;

export const portfolioRiskEngineAbi = [
  {
    type: "function",
    name: "computeRisk",
    stateMutability: "view",
    inputs: [
      { name: "total_positions", type: "uint256" },
      { name: "out_of_range_positions", type: "uint256" },
      { name: "dust_positions", type: "uint256" },
      { name: "correlated_exposure_bps", type: "uint256" },
      { name: "concentration_bps", type: "uint256" },
    ],
    outputs: [
      { type: "uint256" },
      { type: "uint8" },
      { type: "uint8" },
    ],
  },
] as const;

// SwapReplayVerifier (Stylus) — anchors off-chain swap-replay proofs on
// Robinhood Chain. publishReplay is the write; computeFee mirrors the on-chain
// per-swap fee primitive so any single replayed swap stays reproducible.
export const swapReplayVerifierAbi = [
  {
    type: "function",
    name: "publishReplay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "portfolio_owner", type: "address" },
      { name: "subject_id", type: "uint256" },
      { name: "pool", type: "address" },
      { name: "from_block", type: "uint64" },
      { name: "to_block", type: "uint64" },
      { name: "swap_count", type: "uint32" },
      { name: "input_root", type: "bytes32" },
      { name: "result_hash", type: "bytes32" },
      { name: "attestation_hash", type: "bytes32" },
      { name: "tee_image_hash", type: "bytes32" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "getReplay",
    stateMutability: "view",
    inputs: [{ name: "replay_id", type: "bytes32" }],
    outputs: [
      { type: "address" }, // publisher
      { type: "uint256" }, // timestamp
      { type: "address" }, // portfolio_owner
      { type: "uint256" }, // subject_id
      { type: "address" }, // pool
      { type: "uint256" }, // from_block
      { type: "uint256" }, // to_block
      { type: "uint256" }, // swap_count
      { type: "bytes32" }, // input_root
      { type: "bytes32" }, // result_hash
      { type: "bytes32" }, // attestation_hash
      { type: "bytes32" }, // tee_image_hash
    ],
  },
  {
    type: "function",
    name: "replayCount",
    stateMutability: "view",
    inputs: [{ name: "subject_id", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "replayAt",
    stateMutability: "view",
    inputs: [
      { name: "subject_id", type: "uint256" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "computeReplayId",
    stateMutability: "view",
    inputs: [
      { name: "portfolio_owner", type: "address" },
      { name: "subject_id", type: "uint256" },
      { name: "pool", type: "address" },
      { name: "from_block", type: "uint64" },
      { name: "to_block", type: "uint64" },
      { name: "swap_count", type: "uint32" },
      { name: "input_root", type: "bytes32" },
      { name: "result_hash", type: "bytes32" },
      { name: "attestation_hash", type: "bytes32" },
      { name: "tee_image_hash", type: "bytes32" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "computeFee",
    stateMutability: "view",
    inputs: [
      { name: "amount_in", type: "uint256" },
      { name: "fee_pips", type: "uint32" },
    ],
    outputs: [
      { type: "uint256" }, // amount_after_fee
      { type: "uint256" }, // fee_amount
    ],
  },
] as const;

// Uniswap V3 / Algebra pool Swap event — read from Arbitrum logs to source the
// real swaps fed into the off-chain replay. Algebra emits the same topic shape
// (the 5th field is `price` not `sqrtPriceX96`, but decoding is identical).
export const univ3SwapEventAbi = [
  {
    type: "event",
    name: "Swap",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount0", type: "int256", indexed: false },
      { name: "amount1", type: "int256", indexed: false },
      { name: "sqrtPriceX96", type: "uint160", indexed: false },
      { name: "liquidity", type: "uint128", indexed: false },
      { name: "tick", type: "int24", indexed: false },
    ],
  },
] as const;

// Uniswap V4 PositionManager (posm) — Arbitrum One. Position state is split:
// the posm holds the NFT + poolKey/range, the singleton PoolManager holds
// liquidity/slot0 (read via StateView).
export const v4PositionManagerAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getPositionLiquidity",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint128" }],
  },
  {
    type: "function",
    name: "getPoolAndPositionInfo",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "info", type: "uint256" },
    ],
  },
] as const;

// Uniswap V4 StateView — reads pool state from the singleton PoolManager.
export const v4StateViewAbi = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
] as const;

// Well-known Arbitrum One addresses.
export const ARBITRUM_ADDRESSES = {
  univ3PositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  univ3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  // Camelot V3 (Algebra) — Arbitrum One
  camelotPositionManager: "0x00c7f3082833e796A5b3e4Bd59f6642FF44DCD15",
  camelotFactory: "0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B",
  // Uniswap V4 — Arbitrum One (verified on-chain)
  v4PositionManager: "0xd88f38f930b7952f2db2432cb002e7abbf3dd869",
  v4StateView: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990",
  v4PoolManager: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
} as const;
