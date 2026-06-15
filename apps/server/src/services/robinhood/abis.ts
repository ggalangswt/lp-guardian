import { parseAbi, parseAbiItem } from "viem";

export const erc721TransferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);

export const nonfungiblePositionManagerAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function positions(uint256 tokenId) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)",
]);

export const v3FactoryAbi = parseAbi([
  "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address)",
]);

export const v3PoolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function tickSpacing() view returns (int24)",
]);

export const portfolioRiskEngineAbi = parseAbi([
  "function computeRisk(uint256 total_positions,uint256 out_of_range_positions,uint256 dust_positions,uint256 correlated_exposure_bps,uint256 concentration_bps) view returns (uint256 riskScoreBps,uint8 riskTier,uint8 recommendedAction)",
]);

export const portfolioReportRegistryAbi = parseAbi([
  "function publishReport(address portfolio_owner,uint256 subject_id,bytes32 root_hash,bytes32 attestation_hash)",
  "function getReport(bytes32 root_hash) view returns (address portfolioOwner,uint256 subjectId,address publisher,uint256 publishedAt,bytes32 rootHash,bytes32 attestationHash)",
  "function reportCount(uint256 subject_id) view returns (uint256)",
  "function reportAt(uint256 subject_id,uint256 index) view returns (bytes32)",
]);
