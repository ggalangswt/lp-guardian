import { keccak256, toBytes, type Hex } from "viem";
import type { DiagnosticEvent } from "@lp-guardian/core";
import type { ServerConfig } from "../config.js";
import { resolvePositionByTokenId } from "../indexer/resolvePosition.js";
import {
  getCurrentPricesUSD,
  getHistoricalPrices,
  getPriceAt,
} from "../prices/coinGecko.js";
import { computeIL } from "./math/il.js";
import { computeRegimeFeatures } from "./math/regimeFeatures.js";
import { classifyRegime, regimeNarrative } from "./math/regimeClassifier.js";
import { discoverHooks } from "./hooks/hookDiscovery.js";
import { discoverHooksFromSubgraph } from "./hooks/v4HookDiscovery.js";
import { scoreHook } from "./hooks/hookScorer.js";
import { buildMigrationPreview } from "./migration.js";
import { synthesizeVerdict } from "./verdict.js";
import { replaySwaps, type SwapReplayResult } from "./swapReplay.js";
import { getSwapsForReplay } from "../indexer/graphSwaps.js";
import { ARBITRUM_ADDRESSES } from "../chain/abis.js";
import type { Protocol } from "../indexer/types.js";
import { uploadReport } from "../storage/index.js";
import { updateAnchor } from "../storage/reportStore.js";
import { anchorReport } from "../chain/reportRegistry.js";
import { publishReplay } from "../chain/swapReplayVerifier.js";
import type { AssembledReportPayload } from "./reportTypes.js";
import type { FoundationRunRequest } from "../schemas/agent.js";
import type {
  AgentRuntime,
  StrategistAdvice,
} from "../services/agentRuntime/index.js";
import type { VerdictResult } from "./verdict.js";
import { createRobinhoodPublicClient } from "../services/robinhood/client.js";
import { validateNfpmTokenOwnership } from "../services/ownership.js";

const REGIME_WINDOW_HOURS = 72;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Runs the full 9-phase diagnostic for a single position, yielding typed SSE
 * events as it goes. Real Arbitrum data drives phases 1–6; the report is
 * uploaded (phase 8) and anchored on Robinhood Chain (phase 9).
 */
export async function* runDiagnosticPipeline(
  config: ServerConfig,
  tokenId: string,
  options: DiagnosticPipelineOptions = {},
): AsyncGenerator<DiagnosticEvent> {
  // ---- Phase 1: resolve position ----
  yield { type: "phase.start", phase: 1, label: "Resolve position" };
  const requestedWallet = options.foundationInput?.walletAddress;

  if (requestedWallet && config.chainMode !== "mantle") {
    // In Robinhood mode, validate ownership against the Robinhood NFPM.
    // In Mantle mode we skip this — ownership is validated later via the
    // Arbitrum V3 position manager inside resolvePositionByTokenId.
    yield {
      type: "tool.call",
      tool: "validateOwnership",
      input: { walletAddress: requestedWallet, tokenId },
    };
    const t0 = Date.now();
    const ownership = await validateOwnershipForDiagnostic(
      config,
      requestedWallet,
      tokenId,
    );
    yield {
      type: "tool.result",
      tool: "validateOwnership",
      latencyMs: Date.now() - t0,
      output: {
        ...ownership,
        label: ownership.status === "verified" ? "VERIFIED" : "EMULATED",
      },
    };

    if (ownership.status === "mismatch") {
      yield {
        type: "error",
        phase: 1,
        message: `Ownership mismatch: token ${tokenId} is owned by ${ownership.ownerAddress}, not ${requestedWallet}.`,
      };
      yield { type: "phase.end", phase: 1, durationMs: Date.now() - t0 };
      return;
    }
  }

  yield { type: "tool.call", tool: "getV3Position", input: { tokenId } };

  const t1 = Date.now();
  const resolved = await resolvePositionByTokenId(
    config,
    tokenId,
    options.protocolHint,
  );
  const pos = resolved.position;
  const pair = `${pos.pool.token0.symbol}/${pos.pool.token1.symbol}`;
  const token0 = pos.pool.token0.id;
  const token1 = pos.pool.token1.id;
  const tickLower = Number(pos.tickLower.tickIdx);
  const tickUpper = Number(pos.tickUpper.tickIdx);
  const ownershipMatches =
    requestedWallet && resolved.source === "onchain"
      ? sameAddress(resolved.owner, requestedWallet)
      : undefined;
  const resolveLabel = resolved.source === "onchain" ? "VERIFIED" : "EMULATED";

  yield {
    type: "tool.result",
    tool: "getV3Position",
    latencyMs: Date.now() - t1,
    output: {
      pair,
      tickLower,
      tickUpper,
      liquidity: pos.liquidity,
      owner: resolved.owner,
      source: resolved.source,
      label: resolveLabel,
      ownership: {
        requestedWallet,
        owner: resolved.owner,
        status:
          ownershipMatches === undefined
            ? resolved.source === "mock"
              ? "unavailable"
              : "not-requested"
            : ownershipMatches
              ? "verified"
              : "mismatch",
        label: resolveLabel,
      },
    },
  };
  if (
    requestedWallet &&
    resolved.source === "onchain" &&
    !sameAddress(resolved.owner, requestedWallet)
  ) {
    yield {
      type: "error",
      phase: 1,
      message: `Ownership mismatch: token ${tokenId} is owned by ${resolved.owner}, not ${requestedWallet}.`,
    };
    yield { type: "phase.end", phase: 1, durationMs: Date.now() - t1 };
    return;
  }

  yield {
    type: "narrative",
    text:
      resolved.source === "onchain"
        ? `Position #${tokenId} resolved on Arbitrum. ${pair}, range [${tickLower}, ${tickUpper}].`
        : `Position #${tokenId} not found on-chain — running on a mock ${pair} cartridge.`,
  };
  yield { type: "phase.end", phase: 1, durationMs: Date.now() - t1 };
  await sleep(40);

  // ---- prices ----
  const prices = await getCurrentPricesUSD(config, [token0, token1]);
  const price0Now = prices[token0.toLowerCase()] ?? 0;
  const price1Now = prices[token1.toLowerCase()] ?? 0;
  const thenMs = Date.now() - REGIME_WINDOW_HOURS * 3600_000;
  const [price0Then, price1Then] = await Promise.all([
    getPriceAt(config, token0, thenMs),
    getPriceAt(config, token1, thenMs),
  ]);

  // ---- Phase 2: replay swaps (fills the intentionally-empty phase-2 slot) ----
  yield { type: "phase.start", phase: 2, label: "Replay swaps" };
  yield { type: "tool.call", tool: "replaySwaps", input: { pool: pos.pool.id, tokenId } };
  const t2 = Date.now();
  let replay: SwapReplayResult | undefined;
  let replayAnchor:
    | { replayId: string; txHash: string; onchain: boolean }
    | undefined;
  let replaySource: "subgraph" | "rpc" | "none" = "none";
  const protocol: Protocol = pos.protocol ?? "uniswap-v3";
  // Replay real on-chain pools only; mock cartridges have no swaps to source.
  if (resolved.source === "onchain") {
    try {
      const feePips = Number(pos.pool.feeTier) > 0 ? Number(pos.pool.feeTier) : 3000;
      // Per-protocol swap indexing: The Graph first (v3/v4/camelot), RPC
      // getLogs fallback for v3/camelot. V4 has no per-pool address on-chain.
      const fetched = await getSwapsForReplay(config, {
        protocol,
        poolKey: pos.pool.id,
        token0Decimals: Number(pos.pool.token0.decimals),
        token1Decimals: Number(pos.pool.token1.decimals),
      });
      replaySource = fetched.source;
      replay = replaySwaps({
        pool: pos.pool.id,
        tickLower,
        tickUpper,
        positionLiquidity: safeBigInt(pos.liquidity),
        feePips,
        token0Decimals: Number(pos.pool.token0.decimals),
        token1Decimals: Number(pos.pool.token1.decimals),
        price0Usd: price0Now,
        price1Usd: price1Now,
        swaps: fetched.swaps,
        fromBlock: fetched.fromBlock,
        toBlock: fetched.toBlock,
      });
      // Anchor the replay proof on Robinhood Chain when the window has swaps.
      if (replay.swapCount > 0) {
        const attestationHash = keccak256(
          toBytes(`${replay.inputRoot}${replay.resultHash.slice(2)}`),
        ) as Hex;
        // V4 poolId is a 32-byte id, not a 20-byte address — anchor against the
        // singleton PoolManager (the real poolId is bound inside inputRoot).
        const anchorPool = (
          protocol === "uniswap-v4"
            ? ARBITRUM_ADDRESSES.v4PoolManager
            : pos.pool.id
        ) as `0x${string}`;
        const pub = await publishReplay(config, {
          portfolioOwner: normalizeOwner(resolved.owner),
          subjectId: safeBigInt(tokenId),
          pool: anchorPool,
          fromBlock: BigInt(replay.fromBlock),
          toBlock: BigInt(replay.toBlock),
          swapCount: replay.swapCount,
          inputRoot: replay.inputRoot,
          resultHash: replay.resultHash,
          attestationHash,
        });
        replayAnchor = {
          replayId: pub.replayId,
          txHash: pub.txHash,
          onchain: pub.onchain,
        };
      }
    } catch (err) {
      yield { type: "narrative", text: `Swap replay skipped: ${String(err)}` };
    }
  }
  yield {
    type: "tool.result",
    tool: "replaySwaps",
    latencyMs: Date.now() - t2,
    output: replay
      ? {
          ...replay,
          protocol,
          swapSource: replaySource,
          replayId: replayAnchor?.replayId,
          anchorTx: replayAnchor?.txHash,
          onchain: replayAnchor?.onchain ?? false,
        }
      : { skipped: true, reason: "no on-chain pool / mock cartridge" },
  };
  yield {
    type: "narrative",
    text:
      replay && replay.swapCount > 0
        ? `Replayed ${replay.swapCount} real swaps (${replay.swapsInRange} in-range) via ${replaySource === "subgraph" ? "The Graph" : "RPC"}. Counterfactual fees ≈ $${replay.feesUsd.toFixed(2)}${
            replayAnchor?.onchain ? ", proof anchored on Robinhood Chain." : "."
          }`
        : "No swaps in the scanned window — replay reported as EMULATED.",
  };
  yield { type: "phase.end", phase: 2, durationMs: Date.now() - t2 };
  await sleep(40);

  // ---- Phase 3: compute IL ----
  yield { type: "phase.start", phase: 3, label: "Compute IL" };
  yield { type: "tool.call", tool: "computeIL", input: { tokenId, pair } };
  const t3 = Date.now();
  const il = computeIL({
    amount0: Number(pos.depositedToken0),
    amount1: Number(pos.depositedToken1),
    price0Then: price0Then ?? price0Now,
    price1Then: price1Then ?? price1Now,
    price0Now,
    price1Now,
    fees0: Number(pos.collectedFeesToken0),
    fees1: Number(pos.collectedFeesToken1),
  });
  yield {
    type: "tool.result",
    tool: "computeIL",
    latencyMs: Date.now() - t3,
    output: il,
  };
  yield {
    type: "narrative",
    text:
      il.ilT1 > 0
        ? `Fees helped, but LP underperformed HODL by ${(il.ilPct * 100).toFixed(2)}%.`
        : `LP is ahead of HODL by ${Math.abs(il.ilPct * 100).toFixed(2)}% after fees.`,
  };
  yield { type: "phase.end", phase: 3, durationMs: Date.now() - t3 };
  await sleep(40);

  // ---- Phase 4: classify regime ----
  yield { type: "phase.start", phase: 4, label: "Classify regime" };
  yield {
    type: "tool.call",
    tool: "classifyRegime",
    input: { pair, hours: REGIME_WINDOW_HOURS },
  };
  const t4 = Date.now();
  const series = await pickRegimeSeries(config, token0, token1);
  const features = computeRegimeFeatures(series);
  const regime = classifyRegime(features);
  yield {
    type: "tool.result",
    tool: "classifyRegime",
    latencyMs: Date.now() - t4,
    output: {
      topLabel: regime.topLabel,
      confidence: regime.confidence,
      scores: regime.scores,
      features: regime.features,
    },
  };
  yield { type: "narrative", text: regimeNarrative(regime) };
  yield { type: "phase.end", phase: 4, durationMs: Date.now() - t4 };
  await sleep(40);

  // ---- Phase 5: discover hooks ----
  yield { type: "phase.start", phase: 5, label: "Discover hooks" };
  yield { type: "tool.call", tool: "discoverV4Hooks", input: { pair } };
  const t5 = Date.now();
  // Prefer real V4 pools from the subgraph (flags decoded from the hook
  // address); fall back to the heuristic when no query key / no V4 pool exists.
  const realHooks = await discoverHooksFromSubgraph(config, token0, token1, pair);
  const hooks = realHooks ?? discoverHooks(pair, pos.pool.id, regime.topLabel);
  const hooksVerified = realHooks !== null;
  yield {
    type: "tool.result",
    tool: "discoverV4Hooks",
    latencyMs: Date.now() - t5,
    output: { ...hooks, source: hooksVerified ? "subgraph" : "heuristic" },
  };
  yield {
    type: "narrative",
    text: hooksVerified
      ? `Found ${hooks.count} real V4 hook${hooks.count === 1 ? "" : "s"} for ${pair} (${hooks.topFamily.replace(/_/g, " ").toLowerCase()}).`
      : `No live V4 hook indexed for ${pair} — using a ${hooks.topFamily.replace(/_/g, " ").toLowerCase()} reference candidate.`,
  };
  yield { type: "phase.end", phase: 5, durationMs: Date.now() - t5 };
  await sleep(40);

  // ---- Phase 6: score hook ----
  yield { type: "phase.start", phase: 6, label: "Replay hooks" };
  const topHook = hooks.candidates[0]!;
  yield {
    type: "tool.call",
    tool: "scoreHook",
    input: { hookAddress: topHook.hookAddress, poolId: pos.pool.id },
  };
  const t6 = Date.now();
  const baselineAprPct = estimateBaselineApr(il.feesValueT1, il.lpValueT1);
  const hookScore = scoreHook({
    candidate: topHook,
    regime: regime.topLabel,
    baselineAprPct,
    baselineIlPct: il.ilPct * 100,
    hoursScored: REGIME_WINDOW_HOURS,
  });
  yield {
    type: "tool.result",
    tool: "scoreHook",
    latencyMs: Date.now() - t6,
    output: hookScore,
  };
  yield { type: "phase.end", phase: 6, durationMs: Date.now() - t6 };
  await sleep(40);

  // ---- Phase 7: migration preview ----
  yield { type: "phase.start", phase: 7, label: "Build migration" };
  yield { type: "tool.call", tool: "buildMigrationPreview", input: { tokenId } };
  const t7 = Date.now();
  const migration = buildMigrationPreview({
    position: pos,
    hook: topHook,
    regimeLabel: regime.topLabel.replace("_", "-"),
    price0Now,
    price1Now,
  });
  yield {
    type: "tool.result",
    tool: "buildMigrationPreview",
    latencyMs: Date.now() - t7,
    output: migration,
  };
  yield { type: "phase.end", phase: 7, durationMs: Date.now() - t7 };
  await sleep(40);

  // ---- compute verdict (emitted at phase 10, but needed for the payload) ----
  const verdict = await synthesizeVerdict(config, {
    pair,
    il,
    regime,
    hookScore,
  });
  const agentAdvice =
    config.agentRuntimeProvider === "eliza" && options.agentRuntime
      ? await options.agentRuntime.runFoundation(options.foundationInput)
      : undefined;
  const strategistAdvice = agentAdvice?.strategistAdvice;
  const finalVerdict = strategistAdvice
    ? applyStrategistAdvice(verdict, strategistAdvice)
    : verdict;

  if (strategistAdvice) {
    yield {
      type: "agent.advice",
      provider: strategistAdvice.source.provider,
      recommendation: strategistAdvice.recommendation,
      confidence: strategistAdvice.confidence,
      rationale: strategistAdvice.rationale,
      labels: {
        label: strategistAdvice.attestationLabel,
        sourceProvider: strategistAdvice.source.provider,
        sourceLabel: strategistAdvice.source.label,
        modelProvider: strategistAdvice.source.modelProvider ?? "",
        modelName: strategistAdvice.source.modelName ?? "",
        modelBacked: String(strategistAdvice.source.modelBacked ?? false),
        actionName: strategistAdvice.source.actionName ?? "",
      },
    };
    yield {
      type: "narrative",
      text: `ElizaOS strategist recommends ${strategistAdvice.recommendation}: ${strategistAdvice.rationale}`,
    };
  }

  // ---- Phase 8: upload report ----
  yield { type: "phase.start", phase: 8, label: "Upload report" };
  const t8 = Date.now();
  const payload = buildPayload({
    tokenId,
    pair,
    owner: resolved.owner,
    version: pos.protocol === "uniswap-v4" ? 4 : 3,
    il,
    regime,
    hooks,
    migration,
    verdict: finalVerdict,
    strategistAdvice,
    replay,
    replayAnchor,
    replaySource,
  });
  const upload = await uploadReport(config, payload);
  yield {
    type: "report.uploaded",
    rootHash: upload.rootHash,
    storageUrl: upload.storageUrl,
  };
  yield { type: "phase.end", phase: 8, durationMs: Date.now() - t8 };
  await sleep(40);

  // ---- Phase 9: anchor on Robinhood Chain ----
  yield { type: "phase.start", phase: 9, label: "Anchor root" };
  const t9 = Date.now();
  // When the verdict was produced inside the TEE, anchor keccak256(quote) so the
  // on-chain attestation hash binds to the real TDX attestation. Otherwise fall
  // back to hashing the attestation metadata.
  const attestationHash = (
    verdict.attestationQuote
      ? keccak256(toBytes(verdict.attestationQuote))
      : keccak256(toBytes(JSON.stringify(payload.attestation ?? {})))
  ) as Hex;
  const anchor = await anchorReport(config, {
    portfolioOwner: normalizeOwner(resolved.owner),
    subjectId: safeBigInt(tokenId),
    rootHash: upload.rootHash,
    attestationHash,
  });
  updateAnchor(upload.rootHash, {
    txHash: anchor.txHash,
    chainId: anchor.chainId,
    stub: !anchor.onchain,
  });
  yield {
    type: "report.anchored",
    txHash: anchor.txHash,
    chainId: anchor.chainId,
  };
  const anchorChainName = config.chainMode === "mantle" ? "Mantle" : "Robinhood Chain";
  yield {
    type: "narrative",
    text: anchor.onchain
      ? `Anchored on ${anchorChainName}. Anyone can verify rootHash ${upload.rootHash.slice(0, 10)}…`
      : `Anchor stubbed (no signer / write failed). rootHash ${upload.rootHash.slice(0, 10)}… still verifiable off-chain.`,
  };
  yield { type: "phase.end", phase: 9, durationMs: Date.now() - t9 };
  await sleep(40);

  // ---- Phase 10: verdict ----
  yield { type: "phase.start", phase: 10, label: "TEE verdict" };
  yield {
    type: "verdict.final",
    markdown: finalVerdict.markdown,
    labels: {
      model: finalVerdict.model,
      provider: finalVerdict.provider,
      label: finalVerdict.label,
      stub: String(finalVerdict.stub),
      strategistProvider: strategistAdvice?.source.provider ?? "",
      strategistModelProvider: strategistAdvice?.source.modelProvider ?? "",
      strategistModel: strategistAdvice?.source.modelName ?? "",
      strategistModelBacked: String(
        strategistAdvice?.source.modelBacked ?? false,
      ),
      strategistAction: strategistAdvice?.source.actionName ?? "",
    },
  };
  yield { type: "phase.end", phase: 10, durationMs: 20 };
}

interface DiagnosticPipelineOptions {
  agentRuntime?: AgentRuntime;
  foundationInput?: FoundationRunRequest;
  protocolHint?: Protocol;
}

interface DiagnosticOwnershipResult {
  status: "verified" | "mismatch" | "unavailable";
  walletAddress: string;
  tokenId: string;
  ownerAddress?: string;
  reason?: string;
}

async function validateOwnershipForDiagnostic(
  config: ServerConfig,
  walletAddress: string,
  tokenId: string,
): Promise<DiagnosticOwnershipResult> {
  try {
    const client = createRobinhoodPublicClient(config);
    const latestBlock = await client.getBlockNumber().catch(() => undefined);
    const result = await validateNfpmTokenOwnership({
      client,
      chainId: config.robinhoodChainId,
      nfpmAddress: config.robinhoodNfpmAddress as `0x${string}` | undefined,
      walletAddress: walletAddress as `0x${string}`,
      tokenId,
      blockNumber: latestBlock,
    });

    return {
      status: result.status,
      walletAddress,
      tokenId,
      ownerAddress: result.ownerAddress,
      reason: result.reason,
    };
  } catch (error) {
    return {
      status: "unavailable",
      walletAddress,
      tokenId,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

interface PayloadInputs {
  tokenId: string;
  pair: string;
  owner: string;
  version: 3 | 4;
  il: ReturnType<typeof computeIL>;
  regime: ReturnType<typeof classifyRegime>;
  hooks: ReturnType<typeof discoverHooks>;
  migration: ReturnType<typeof buildMigrationPreview>;
  verdict: Awaited<ReturnType<typeof synthesizeVerdict>>;
  strategistAdvice?: StrategistAdvice;
  replay?: SwapReplayResult;
  replayAnchor?: { replayId: string; txHash: string; onchain: boolean };
  replaySource?: "subgraph" | "rpc" | "none";
}

function buildPayload(i: PayloadInputs): AssembledReportPayload {
  const nowIso = new Date().toISOString();
  return {
    schemaVersion: 1,
    generatedAt: nowIso,
    agent: { name: "lp-guardian", version: "0.1.0" },
    position: {
      tokenId: i.tokenId,
      version: i.version,
      pair: i.pair,
      owner: i.owner,
    },
    attestation: {
      type: "tee-attestor-signature",
      provider: i.verdict.provider,
      model: i.verdict.model,
      // keccak256 of the TDX quote when TEE-attested — lets clients match the
      // report against the on-chain attestationHash.
      requestSignatureHash: i.verdict.attestationQuote
        ? keccak256(toBytes(i.verdict.attestationQuote))
        : undefined,
      generatedAt: nowIso,
      stub: i.verdict.stub,
    },
    il: {
      hodlValueT1: i.il.hodlValueT1,
      lpValueT1: i.il.lpValueT1,
      feesValueT1: i.il.feesValueT1,
      ilT1: i.il.ilT1,
      ilPct: i.il.ilPct,
    },
    swapReplay: i.replay
      ? {
          pool: i.replay.pool,
          swapSource: i.replaySource,
          swapCount: i.replay.swapCount,
          swapsInRange: i.replay.swapsInRange,
          feesUsd: i.replay.feesUsd,
          grossVolumeUsd: i.replay.grossVolumeUsd,
          fromBlock: i.replay.fromBlock,
          toBlock: i.replay.toBlock,
          inputRoot: i.replay.inputRoot,
          resultHash: i.replay.resultHash,
          replayId: i.replayAnchor?.replayId,
          anchorTxHash: i.replayAnchor?.txHash,
          anchorStub: i.replayAnchor ? !i.replayAnchor.onchain : undefined,
          label: i.replay.label,
        }
      : undefined,
    regime: {
      topLabel: i.regime.topLabel,
      confidence: i.regime.confidence,
      narrative: regimeNarrative(i.regime),
    },
    hooks: {
      pair: i.pair,
      topFamily: i.hooks.topFamily,
      candidateCount: i.hooks.count,
    },
    migration: {
      targetHookAddress: i.migration.targetHook?.address,
      targetFamily: i.migration.targetHook?.family,
      priceImpactPct: i.migration.swapQuote
        ? i.migration.swapQuote.priceImpact * 100
        : undefined,
      warnings: i.migration.warnings,
    },
    strategistAdvice: i.strategistAdvice
      ? {
          recommendation: i.strategistAdvice.recommendation,
          rationale: i.strategistAdvice.rationale,
          confidence: i.strategistAdvice.confidence,
          attestationLabel: i.strategistAdvice.attestationLabel,
          source: {
            provider: i.strategistAdvice.source.provider,
            label: i.strategistAdvice.source.label,
            modelProvider: i.strategistAdvice.source.modelProvider,
            modelName: i.strategistAdvice.source.modelName,
            modelBacked: i.strategistAdvice.source.modelBacked,
            actionName: i.strategistAdvice.source.actionName,
          },
        }
      : undefined,
    verdict: {
      recommendation: i.verdict.recommendation,
      markdown: i.verdict.markdown,
      label: i.verdict.label,
      provider: i.verdict.provider,
      model: i.verdict.model,
    },
  };
}

function applyStrategistAdvice(
  verdict: VerdictResult,
  advice: StrategistAdvice,
): VerdictResult {
  return {
    ...verdict,
    recommendation: advice.recommendation,
    markdown: [
      `**${advice.recommendation.toUpperCase()}** - ${advice.rationale}`,
      "",
      `_Strategist source: ${advice.source.provider}${
        advice.source.actionName ? `/${advice.source.actionName}` : ""
      }; model: ${advice.source.modelProvider ?? "unknown"}/${
        advice.source.modelName ?? "unknown"
      }; modelBacked: ${String(advice.source.modelBacked ?? false)}; label: ${advice.attestationLabel}._`,
      "",
      verdict.markdown,
    ].join("\n"),
    model: advice.source.modelName ?? verdict.model,
    provider: advice.source.provider,
    stub: advice.attestationLabel !== "VERIFIED",
    label: advice.attestationLabel,
  };
}

/** Picks the more volatile of the two token price series for regime analysis. */
async function pickRegimeSeries(
  config: ServerConfig,
  token0: string,
  token1: string,
): Promise<number[]> {
  const [h0, h1] = await Promise.all([
    getHistoricalPrices(config, token0, REGIME_WINDOW_HOURS),
    getHistoricalPrices(config, token1, REGIME_WINDOW_HOURS),
  ]);
  const s0 = h0.map((p) => p.price);
  const s1 = h1.map((p) => p.price);
  return cv(s0) >= cv(s1) ? s0 : s1;
}

/** Coefficient of variation — proxy for which series carries the signal. */
function cv(series: number[]): number {
  if (series.length < 2) return 0;
  const m = series.reduce((a, b) => a + b, 0) / series.length;
  if (m === 0) return 0;
  const v = series.reduce((a, b) => a + (b - m) ** 2, 0) / series.length;
  return Math.sqrt(v) / m;
}

function estimateBaselineApr(feesValueUsd: number, lpValueUsd: number): number {
  if (lpValueUsd <= 0) return 0;
  if (feesValueUsd <= 0) return 12; // ESTIMATED default when no fees accrued yet
  // Treat uncollected fees as ~30 days of accrual.
  const apr = (feesValueUsd / lpValueUsd) * (365 / 30) * 100;
  return Math.max(0, Math.min(200, apr));
}

function normalizeOwner(owner: string): `0x${string}` {
  if (/^0x[0-9a-fA-F]{40}$/.test(owner)) return owner as `0x${string}`;
  return "0x000000000000000000000000000000000000dEaD";
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function safeBigInt(tokenId: string): bigint {
  try {
    return BigInt(tokenId);
  } catch {
    return 0n;
  }
}
