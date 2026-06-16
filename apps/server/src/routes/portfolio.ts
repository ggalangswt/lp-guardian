import { Hono } from "hono";
import type { Address } from "viem";
import { z } from "zod";
import type { ServerConfig } from "../config.js";
import { fail, ok } from "../http/responses.js";
import { portfolioDiagnoseSchema } from "../schemas/portfolio.js";
import { PortfolioService } from "../services/portfolio/portfolioService.js";
import type { NfpmPositionSnapshot } from "../services/robinhood/transferScanner.js";
import type { V3PositionRaw } from "../indexer/types.js";
import type { WalletRiskInputResult } from "../services/portfolio/walletRiskInput.js";

function toBigIntRiskInput(
  input: NonNullable<z.infer<typeof portfolioDiagnoseSchema>["riskInput"]>,
) {
  return {
    totalPositions: BigInt(input.totalPositions),
    outOfRangePositions: BigInt(input.outOfRangePositions),
    dustPositions: BigInt(input.dustPositions),
    correlatedExposureBps: BigInt(input.correlatedExposureBps),
    concentrationBps: BigInt(input.concentrationBps),
  };
}

function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, toJsonSafe(entry)]),
  );
}

function positionToWire(
  position: NfpmPositionSnapshot,
  walletRisk: WalletRiskInputResult,
  config: ServerConfig,
): V3PositionRaw {
  const poolState = walletRisk.poolState.positions.find(
    (state) => state.tokenId === position.tokenId,
  );

  return {
    id: position.tokenId.toString(),
    owner: position.owner.toLowerCase(),
    liquidity: position.liquidity.toString(),
    depositedToken0: "0",
    depositedToken1: "0",
    collectedFeesToken0: position.tokensOwed0.toString(),
    collectedFeesToken1: position.tokensOwed1.toString(),
    tickLower: { tickIdx: position.tickLower.toString() },
    tickUpper: { tickIdx: position.tickUpper.toString() },
    pool: {
      id: (position.poolAddress ?? poolState?.poolAddress ?? "").toLowerCase(),
      feeTier: position.fee.toString(),
      tickSpacing: (position.tickSpacing ?? 0).toString(),
      tick: position.currentTick !== undefined
        ? position.currentTick.toString()
        : poolState
          ? poolState.currentTick.toString()
          : null,
      token0: {
        id: position.token0.toLowerCase(),
        symbol: position.token0Symbol ?? position.token0.slice(0, 8),
        decimals: (position.token0Decimals ?? 18).toString(),
      },
      token1: {
        id: position.token1.toLowerCase(),
        symbol: position.token1Symbol ?? position.token1.slice(0, 8),
        decimals: (position.token1Decimals ?? 18).toString(),
      },
    },
    protocol: position.protocol ?? "uniswap-v3",
    chainId: position.chainId ?? (
      config.chainMode === "mantle" ? config.mantleChainId : config.robinhoodChainId
    ),
    currentValueUSD: position.currentValueUSD,
    isInRange: position.isInRange ?? poolState?.isInRange,
  };
}

export function createPortfolioRoute(config: ServerConfig): Hono {
  const route = new Hono();
  const service = new PortfolioService(config);

  route.get("/:walletAddress/positions", async (c) => {
    const parsed = z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .safeParse(c.req.param("walletAddress"));

    if (!parsed.success) {
      return c.json(
        fail("BAD_REQUEST", "walletAddress must be an EVM address."),
        400,
      );
    }

    try {
      const walletRisk = await service.getWalletPositions(parsed.data as Address);

      return c.json(
        ok(
          toJsonSafe({
            address: parsed.data,
            version: 1,
            source: config.chainMode === "mantle" ? "merchant-moe" : "onchain",
            chainId: config.chainMode === "mantle"
              ? config.mantleChainId
              : config.robinhoodChainId,
            nfpmAddress: walletRisk.scan.nfpmAddress,
            scan: {
              fromBlock: walletRisk.scan.fromBlock,
              toBlock: walletRisk.scan.toBlock,
              transferCount: walletRisk.scan.transfers.length,
              candidateTokenIds: walletRisk.scan.candidateTokenIds,
              currentlyOwnedTokenIds: walletRisk.scan.currentlyOwnedTokenIds,
              movedOutTokenIds: walletRisk.scan.movedOutTokenIds,
            },
            positions: walletRisk.scan.positions.map((position) =>
              positionToWire(position, walletRisk, config),
            ),
            portfolioRiskInput: walletRisk.riskInput,
            sources: walletRisk.sources,
          }),
        ),
      );
    } catch (err) {
      return c.json(fail("INTERNAL_ERROR", String(err)), 500);
    }
  });

  route.post("/diagnose", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    const parsed = portfolioDiagnoseSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        fail(
          "BAD_REQUEST",
          "Invalid portfolio diagnose payload",
          parsed.error.issues,
        ),
        400,
      );
    }

    try {
      const result = await service.diagnose({
        ...parsed.data,
        walletAddress: parsed.data.walletAddress as Address,
        riskInput: parsed.data.riskInput ? toBigIntRiskInput(parsed.data.riskInput) : undefined,
        phalaAttestationHash: parsed.data.phalaAttestationHash as `0x${string}` | undefined,
        teeAttestationHash: parsed.data.teeAttestationHash as `0x${string}` | undefined,
      });

      return c.json(ok(toJsonSafe(result)));
    } catch (err) {
      const message = String(err);
      if (message.includes("OWNERSHIP_MISMATCH")) {
        return c.json(fail("OWNERSHIP_MISMATCH", message), 409);
      }
      if (message.includes("NO_POSITIONS")) {
        return c.json(fail("NO_POSITIONS", message), 404);
      }
      return c.json(fail("INTERNAL_ERROR", message), 500);
    }
  });

  route.post("/execute", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    const schema = z.object({
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      proposalHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      permit2Signature: z.string().regex(/^0x[a-fA-F0-9]+$/).optional(),
      dryRun: z.boolean().default(true),
      userApproved: z.boolean().default(false),
    });
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        fail("BAD_REQUEST", "Invalid portfolio execute payload", parsed.error.issues),
        400,
      );
    }

    const dryRun = parsed.data.dryRun;
    const userApproved = parsed.data.userApproved;
    const canSubmit =
      !dryRun &&
      userApproved &&
      Boolean(parsed.data.permit2Signature) &&
      Boolean(config.permit2BundlerAddress);
    const status = dryRun
      ? "preview"
      : userApproved
        ? "disabled"
        : "waiting_for_user";

    return c.json(
      ok({
        status,
        walletAddress: parsed.data.walletAddress,
        proposalHash: parsed.data.proposalHash,
        dryRun,
        userApproved,
        chainId: config.mantleChainId,
        contract: config.permit2BundlerAddress,
        txHash: undefined,
        provenance: [
          {
            label: canSubmit ? "UNAVAILABLE" : "EMULATED",
            source: "Executor",
            degraded: true,
            warnings: [
              canSubmit
                ? "Permit2Bundler is configured, but transaction submission is intentionally disabled until the execution backend is implemented."
                : "Execution endpoint is frozen as an approval-gated interface; no transaction was submitted.",
            ],
            observedAt: Date.now(),
          },
        ],
      }),
      dryRun || !userApproved ? 200 : 409,
    );
  });

  route.post("/validate-ownership", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    const schema = z.object({
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      tokenId: z.string().regex(/^\d+$/),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return c.json(fail("BAD_REQUEST", "Invalid payload"), 400);

    try {
      const result = await service.validateOwnership(
        parsed.data.walletAddress as Address,
        parsed.data.tokenId
      );
      return c.json(ok(toJsonSafe(result)));
    } catch (err) {
      return c.json(fail("INTERNAL_ERROR", String(err)), 500);
    }
  });

  return route;
}
