import type { Address, Hex, PublicClient, WalletClient } from "viem";
import type { ServerConfig } from "../../config.js";
import { validateNfpmTokenOwnership, type OwnershipValidationResult } from "../ownership.js";
import {
  createRobinhoodPublicClient,
  createRobinhoodWalletClient
} from "../robinhood/client.js";
import { getChainClients } from "../../chain/clients.js";
import {
  buildWalletRiskInputFromRobinhood,
  type WalletRiskInputResult
} from "./walletRiskInput.js";
import { buildWalletRiskInputFromMerchantMoe } from "../merchantMoe/scout.js";
import {
  runAggregateRiskPipeline,
  type AggregateRiskPipelineResult
} from "./aggregateRiskPipeline.js";
import type { PortfolioRiskInput } from "../robinhood/riskEngine.js";
import type { PortfolioReportSource } from "./report.js";

export interface PortfolioDiagnoseInput {
  walletAddress: Address;
  tokenId?: string;
  subjectId?: string;
  riskInput?: PortfolioRiskInput;
  riskInputSource?: {
    name?: string;
    label?: "VERIFIED" | "COMPUTED" | "EMULATED";
    notes?: string[];
  };
  publishReport?: boolean;
  requirePhala?: boolean;
  requireTee?: boolean;
  phalaAttestationHash?: Hex;
  teeAttestationHash?: Hex;
}

export class PortfolioService {
  constructor(private readonly config: ServerConfig) {}

  async getWalletPositions(walletAddress: Address) {
    if (this.config.chainMode === "mantle") {
      return buildWalletRiskInputFromMerchantMoe(this.config, walletAddress);
    }

    const publicClient = createRobinhoodPublicClient(this.config);
    return buildWalletRiskInputFromRobinhood(
      this.config,
      publicClient,
      walletAddress,
    );
  }

  async validateOwnership(walletAddress: Address, tokenId: string) {
    const isMantle = this.config.chainMode === "mantle";
    const publicClient = isMantle
      ? getChainClients(this.config).mantle
      : createRobinhoodPublicClient(this.config);
    const chainId = isMantle ? this.config.mantleChainId : this.config.robinhoodChainId;
    const nfpmAddress = isMantle
      ? (this.config.mantleNfpmAddress as Address | undefined)
      : (this.config.robinhoodNfpmAddress as Address | undefined);
    const latestBlock = await publicClient.getBlockNumber();

    return validateNfpmTokenOwnership({
      client: publicClient,
      chainId,
      nfpmAddress,
      walletAddress,
      tokenId,
      blockNumber: latestBlock,
    });
  }

  async diagnose(input: PortfolioDiagnoseInput): Promise<AggregateRiskPipelineResult> {
    const isMantle = this.config.chainMode === "mantle";
    const publicClient = isMantle ? undefined : createRobinhoodPublicClient(this.config);
    const walletClient =
      !isMantle && input.publishReport && this.config.walletBackendPrivateKey
        ? createRobinhoodWalletClient(this.config)
        : undefined;
    const latestBlock = publicClient
      ? await publicClient.getBlockNumber()
      : undefined;

    // 1. Validate ownership if tokenId is provided
    let ownership: OwnershipValidationResult | undefined;
    if (input.tokenId && !isMantle) {
      ownership = await this.validateOwnership(input.walletAddress, input.tokenId);
      if (ownership.status === "mismatch") {
        throw new Error(`OWNERSHIP_MISMATCH: Token ${input.tokenId} is owned by ${ownership.ownerAddress}, not ${input.walletAddress}.`);
      }
    }

    // 2. Resolve risk input (either from client or from wallet scan)
    let walletRisk: WalletRiskInputResult | undefined;
    if (!input.riskInput) {
      walletRisk = await this.getWalletPositions(input.walletAddress);
      if (walletRisk.scan.currentlyOwnedTokenIds.length === 0) {
        const chainLabel = isMantle ? "Merchant Moe" : "Robinhood NFPM";
        throw new Error(`NO_POSITIONS: No currently owned ${chainLabel} positions were found for this wallet.`);
      }
    }

    // 3. Assemble sources
    const sources: PortfolioReportSource[] = [];
    if (ownership) {
      sources.push({
        name: isMantle ? "Mantle NFPM ownerOf (Agni)" : "Robinhood NFPM ownerOf",
        label: ownership.label,
        chainId: ownership.chainId,
        blockNumber: ownership.blockNumber,
        contractAddress: ownership.contractAddress,
        notes: ownership.status === "unavailable" && ownership.reason ? [ownership.reason] : undefined,
      });
    }

    if (input.tokenId && isMantle) {
      sources.push({
        name: "Mantle LP token ownership validation",
        label: "UNAVAILABLE",
        chainId: this.config.mantleChainId,
        notes: [
          "Mantle diagnosis is wallet-first; token ownership validation is pending Merchant Moe/RPC position-manager integration.",
        ],
      });
    }

    if (walletRisk) {
      sources.push(...walletRisk.sources);
    }

    if (input.riskInput) {
      sources.push({
        name: input.riskInputSource?.name ?? "Client supplied aggregate risk input",
        label: input.riskInputSource?.label ?? "EMULATED",
        notes: input.riskInputSource?.notes ?? ["Backend did not derive this riskInput from wallet positions for this request."],
      });
    }

    sources.push({
      name: isMantle
        ? "PortfolioRiskEngine.computeRisk off-chain mirror"
        : "PortfolioRiskEngine.computeRisk",
      label: isMantle ? "COMPUTED" : "VERIFIED",
      chainId: isMantle ? this.config.mantleChainId : this.config.robinhoodChainId!,
      blockNumber: latestBlock,
      contractAddress: isMantle
        ? undefined
        : this.config.lpGuardianRiskEngineContract as Address,
      notes: isMantle
        ? [
            "Mantle mode uses the deterministic TypeScript mirror because the Robinhood Stylus risk engine is legacy-only.",
          ]
        : undefined,
    });

    // 4. Run pipeline
    const subjectId = input.subjectId
      ? BigInt(input.subjectId)
      : (input.tokenId ? BigInt(input.tokenId) : BigInt(input.walletAddress));

    return runAggregateRiskPipeline(
      this.config,
      publicClient,
      walletClient,
      {
        walletAddress: input.walletAddress,
        subjectId,
        riskInput: input.riskInput ?? walletRisk!.riskInput,
        sources,
        ownership,
        phalaAttestation: (input.teeAttestationHash ?? input.phalaAttestationHash)
          ? {
              attestationHash: (input.teeAttestationHash ?? input.phalaAttestationHash)!,
              verifier: this.config.phalaAttestationVerifier,
              agentContract: this.config.phalaAgentContract,
            }
          : undefined,
        requirePhala: !!(input.requireTee || input.requirePhala),
        publishReport: !!input.publishReport,
      }
    );
  }
}
