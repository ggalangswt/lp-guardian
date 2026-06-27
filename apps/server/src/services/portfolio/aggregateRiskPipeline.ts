import type { Address, Hex, PublicClient, WalletClient } from "viem";
import type { ServerConfig } from "../../config.js";
import { requireAddress } from "../robinhood/client.js";
import {
  publishReportAnchor,
  type PublishReportAnchorInput,
} from "../robinhood/reportRegistry.js";
import {
  computePortfolioRisk,
  type PortfolioRiskInput,
} from "../robinhood/riskEngine.js";
import { computeRiskOffchain } from "../../chain/riskEngine.js";
import {
  buildPortfolioReport,
  hashPayload,
  type HashedPortfolioReport,
  type PortfolioReportSource,
} from "./report.js";
import type { OwnershipValidationResult } from "../ownership.js";

export interface AggregateRiskPipelineInput {
  walletAddress: Address;
  subjectId: bigint;
  riskInput: PortfolioRiskInput;
  sources: PortfolioReportSource[];
  ownership?: OwnershipValidationResult;
  phalaAttestation?: {
    attestationHash: Hex;
    verifier?: string;
    agentContract?: string;
  };
  requirePhala: boolean;
  publishReport: boolean;
}

export interface AggregateRiskPipelineResult {
  report: HashedPortfolioReport;
  attestationHash: Hex;
  anchor:
    | {
        status: "published";
        txHash: Hex;
        args: PublishReportAnchorInput;
      }
    | {
        status: "skipped";
        reason: "publish-disabled" | "backend-signer-unavailable";
        args: PublishReportAnchorInput;
      };
}

function zeroHash(): Hex {
  return `0x${"0".repeat(64)}`;
}

export async function runAggregateRiskPipeline(
  config: ServerConfig,
  publicClient: PublicClient,
  walletClient: WalletClient | undefined,
  input: AggregateRiskPipelineInput,
): Promise<AggregateRiskPipelineResult> {
  if (input.requirePhala && !input.phalaAttestation) {
    throw new Error("Real Phala attestation is required for this pipeline.");
  }

  // In mantle mode, risk is computed off-chain (no Robinhood Stylus contract).
  let riskOutput: Awaited<ReturnType<typeof computePortfolioRisk>>;
  if (config.chainMode === "mantle") {
    const offchain = computeRiskOffchain({
      totalPositions: Number(input.riskInput.totalPositions),
      outOfRangePositions: Number(input.riskInput.outOfRangePositions),
      dustPositions: Number(input.riskInput.dustPositions),
      correlatedExposureBps: Number(input.riskInput.correlatedExposureBps),
      concentrationBps: Number(input.riskInput.concentrationBps),
    });
    riskOutput = {
      riskScoreBps: BigInt(offchain.riskScoreBps),
      riskTier: Math.min(offchain.riskTier, 2) as 0 | 1 | 2,
      recommendedAction: Math.min(offchain.recommendedAction, 2) as 0 | 1 | 2,
    };
  } else {
    const riskEngineAddress = requireAddress(
      config.lpGuardianRiskEngineContract,
      "LPGUARDIAN_RISK_ENGINE_CONTRACT",
    );
    riskOutput = await computePortfolioRisk(publicClient, riskEngineAddress, input.riskInput);
  }

  const activeChainId = config.chainMode === "mantle"
    ? config.mantleChainId
    : (config.robinhoodChainId ?? 46630);
  const report = buildPortfolioReport({
    schemaVersion: "lp-guardian.report.v1",
    generatedAt: new Date().toISOString(),
    walletAddress: input.walletAddress,
    subjectId: input.subjectId.toString(),
    chainId: activeChainId,
    ownership: input.ownership,
    riskInput: input.riskInput,
    riskOutput,
    sources: input.sources,
    phala: input.phalaAttestation
      ? {
          status: "VERIFIED",
          ...input.phalaAttestation,
        }
      : undefined,
  });
  const attestationHash =
    input.phalaAttestation?.attestationHash ??
    hashPayload({
      status: "unavailable",
      reason: "phala-attestation-not-provided",
      reportRoot: report.rootHash,
    });
  const registryAddress = requireAddress(
    config.lpGuardianReportsContract,
    "LPGUARDIAN_REPORTS_CONTRACT",
  );
  const args: PublishReportAnchorInput = {
    portfolioOwner: input.walletAddress,
    subjectId: input.subjectId,
    rootHash: report.rootHash,
    attestationHash: input.phalaAttestation ? attestationHash : zeroHash(),
  };

  if (!input.publishReport) {
    return {
      report,
      attestationHash: args.attestationHash,
      anchor: {
        status: "skipped",
        reason: "publish-disabled",
        args,
      },
    };
  }

  if (!walletClient) {
    return {
      report,
      attestationHash: args.attestationHash,
      anchor: {
        status: "skipped",
        reason: "backend-signer-unavailable",
        args,
      },
    };
  }

  const txHash = await publishReportAnchor(
    publicClient,
    walletClient,
    registryAddress,
    args,
  );

  return {
    report,
    attestationHash: args.attestationHash,
    anchor: {
      status: "published",
      txHash,
      args,
    },
  };
}
