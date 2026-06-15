import { backendJson, unwrapApiResponse } from "./backend.js";
import {
  accessDeniedResult,
  accessSchemaProperties,
  evaluateMcpAccess,
} from "./access.js";
import type { ToolDefinition, ToolResult } from "./types.js";

type JsonObject = Record<string, unknown>;

const addressSchema = {
  type: "string",
  pattern: "^0x[a-fA-F0-9]{40}$",
  description: "EVM wallet address.",
};

const tokenIdSchema = {
  type: "string",
  pattern: "^\\d+$",
  description: "LP NFT token id as an unsigned integer string.",
};

const bytes32Schema = {
  type: "string",
  pattern: "^0x[a-fA-F0-9]{64}$",
  description: "Report root hash.",
};

const riskInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    totalPositions: { type: "string", pattern: "^\\d+$" },
    outOfRangePositions: { type: "string", pattern: "^\\d+$" },
    dustPositions: { type: "string", pattern: "^\\d+$" },
    correlatedExposureBps: { type: "string", pattern: "^\\d+$" },
    concentrationBps: { type: "string", pattern: "^\\d+$" },
  },
  required: [
    "totalPositions",
    "outOfRangePositions",
    "dustPositions",
    "correlatedExposureBps",
    "concentrationBps",
  ],
};

const riskInputSourceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    label: { type: "string", enum: ["VERIFIED", "COMPUTED", "EMULATED"] },
    notes: {
      type: "array",
      items: { type: "string" },
    },
  },
};

const portfolioDiagnosisProperties = {
  ...accessSchemaProperties(),
  walletAddress: addressSchema,
  tokenId: tokenIdSchema,
  subjectId: { type: "string", pattern: "^\\d+$" },
  riskInput: riskInputSchema,
  riskInputSource: riskInputSourceSchema,
  publishReport: { type: "boolean", default: false },
  requirePhala: { type: "boolean", default: false },
  phalaAttestationHash: {
    type: "string",
    pattern: "^0x[a-fA-F0-9]{64}$",
  },
};

const protectedToolNames = new Set([
  "portfolio_diagnose",
  "portfolio_simulate",
  "portfolio_optimize",
  "portfolio_execute",
  "portfolio_monitor",
  "lp_guardian_get_wallet_positions",
  "lp_guardian_validate_ownership",
  "lp_guardian_diagnose_portfolio",
  "lp_guardian_get_report",
]);

export const tools: ToolDefinition[] = [
  {
    name: "lp_guardian_ping",
    description: "Transport liveness check for the LP Guardian MCP server.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "portfolio_diagnose",
    description:
      "Run the Scan + Correlate portfolio diagnosis path for a wallet. If tokenId is supplied, ownership is validated before a real verdict is produced.",
    inputSchema: {
      type: "object",
      properties: portfolioDiagnosisProperties,
      required: ["walletAddress"],
      additionalProperties: false,
    },
  },
  {
    name: "portfolio_simulate",
    description:
      "Run the current deterministic simulation/risk pass for a wallet portfolio using the same backend service as portfolio_diagnose.",
    inputSchema: {
      type: "object",
      properties: {
        ...portfolioDiagnosisProperties,
        scenario: {
          type: "string",
          description:
            "Optional scenario label for the caller's audit trail. Current backend scoring is deterministic from wallet/risk inputs.",
        },
      },
      required: ["walletAddress"],
      additionalProperties: false,
    },
  },
  {
    name: "portfolio_optimize",
    description:
      "Return the portfolio-level recommended action from the risk engine. This is a recommendation path, not transaction submission.",
    inputSchema: {
      type: "object",
      properties: portfolioDiagnosisProperties,
      required: ["walletAddress"],
      additionalProperties: false,
    },
  },
  {
    name: "portfolio_execute",
    description:
      "Prepare an execution preview for a selected LP NFT. Transaction submission is disabled in this build unless a future execution backend is added.",
    inputSchema: {
      type: "object",
      properties: {
        ...portfolioDiagnosisProperties,
        dryRun: { type: "boolean", default: true },
        userApproved: { type: "boolean", default: false },
      },
      required: ["walletAddress", "tokenId"],
      additionalProperties: false,
    },
  },
  {
    name: "portfolio_monitor",
    description:
      "Fetch the autonomous Monitor Agent state, including last scan status, issues, and alert correlation metadata.",
    inputSchema: {
      type: "object",
      properties: {
        ...accessSchemaProperties(),
        walletAddress: addressSchema,
      },
      required: ["walletAddress"],
      additionalProperties: false,
    },
  },
];

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function requireString(args: JsonObject, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function optionalString(args: JsonObject, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalBoolean(args: JsonObject, key: string, fallback: boolean): boolean {
  const value = args[key];
  return typeof value === "boolean" ? value : fallback;
}

function resultText(value: unknown, isError = false): ToolResult {
  return {
    isError,
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function provenanceEnvelope(data: unknown, extras: JsonObject = {}): JsonObject {
  return {
    label: extras.label ?? "VERIFIED",
    chainId: extras.chainId,
    mockUsed: false,
    degraded: Boolean(extras.degraded),
    access: extras.access,
    warnings: extras.warnings ?? [],
    data,
  };
}

async function callBackendTool(
  path: string,
  init?: RequestInit,
  extras: JsonObject = {},
): Promise<ToolResult> {
  const response = await backendJson(path, init);
  const data = unwrapApiResponse(response.body);
  const isError = response.status >= 400;

  return resultText(
    {
      ok: !isError,
      httpStatus: response.status,
      ...(
        isError
          ? {
              label: "EMULATED",
              degraded: true,
              warnings: [
                "Backend returned an error; no verified recommendation was produced.",
                ...((extras.warnings as string[] | undefined) ?? []),
              ],
              error: data,
            }
          : {
              ...provenanceEnvelope(data, extras),
            }
      ),
    },
    isError,
  );
}

function portfolioDiagnosisBody(args: JsonObject): JsonObject {
  const walletAddress = requireString(args, "walletAddress");

  return {
    walletAddress,
    tokenId: optionalString(args, "tokenId"),
    subjectId: optionalString(args, "subjectId"),
    riskInput: args.riskInput,
    riskInputSource: args.riskInputSource,
    publishReport: optionalBoolean(args, "publishReport", false),
    requirePhala: optionalBoolean(args, "requirePhala", false),
    phalaAttestationHash: optionalString(args, "phalaAttestationHash"),
  };
}

function callPortfolioDiagnose(
  args: JsonObject,
  extras: JsonObject = {},
): Promise<ToolResult> {
  return callBackendTool("/api/portfolio/diagnose", {
    method: "POST",
    body: JSON.stringify(portfolioDiagnosisBody(args)),
  }, extras);
}

function callAgentRun(
  args: JsonObject,
  targetAgent: "correlate" | "simulate" | "optimize" | "execute" | "monitor",
  extras: JsonObject = {},
): Promise<ToolResult> {
  const walletAddress = requireString(args, "walletAddress");
  return callBackendTool("/agent/orchestration/run", {
    method: "POST",
    body: JSON.stringify({
      ...portfolioDiagnosisBody(args),
      walletAddress,
      targetAgent,
      scenario: optionalString(args, "scenario"),
      dryRun: optionalBoolean(args, "dryRun", true),
      userApproved: optionalBoolean(args, "userApproved", false),
    }),
  }, extras);
}

function executionDisabledResult(): ToolResult {
  return resultText(
    {
      ok: false,
      label: "EMULATED",
      mockUsed: false,
      degraded: true,
      warnings: [
        "portfolio_execute only supports dryRun previews in this MCP build.",
        "No transaction bundle was submitted.",
      ],
      error: {
        code: "EXECUTION_SUBMISSION_DISABLED",
        message:
          "Set dryRun=true or add a real execution backend before enabling transaction submission.",
      },
    },
    true,
  );
}

export async function callTool(name: string, rawArgs: unknown): Promise<ToolResult> {
  const args = asObject(rawArgs);
  const accessDecision = protectedToolNames.has(name)
    ? evaluateMcpAccess(args)
    : undefined;
  if (accessDecision && !accessDecision.ok) {
    return accessDeniedResult(accessDecision);
  }
  const accessExtras = accessDecision
    ? {
        access: {
          mode: accessDecision.mode,
          allowed: true,
        },
        warnings: accessDecision.warnings,
      }
    : {};

  switch (name) {
    case "lp_guardian_ping":
      return resultText({
        ok: true,
        label: "VERIFIED",
        mockUsed: false,
        degraded: false,
        warnings: [],
        service: "lp-guardian-mcp",
      });

    case "portfolio_diagnose":
      return callAgentRun(args, "correlate", accessExtras);

    case "portfolio_simulate":
      return callAgentRun(args, "simulate", {
        ...accessExtras,
        warnings: [
          ...(accessDecision?.warnings ?? []),
          "Scenario labels are accepted by MCP for traceability; current backend scoring is deterministic from wallet/risk inputs.",
        ],
      });

    case "portfolio_optimize":
      return callAgentRun(args, "optimize", {
        ...accessExtras,
        warnings: [
          ...(accessDecision?.warnings ?? []),
          "Optimization currently returns the risk-engine suggested action; no transaction route is executed.",
        ],
      });

    case "portfolio_execute": {
      requireString(args, "tokenId");
      if (!optionalBoolean(args, "dryRun", true)) return executionDisabledResult();

      return callAgentRun(args, "execute", {
        ...accessExtras,
        degraded: true,
        warnings: [
          ...(accessDecision?.warnings ?? []),
          "Execution preview only. No Permit2 signature, swap, mint, burn, or transaction submission was performed.",
        ],
      });
    }

    case "portfolio_monitor": {
      return callAgentRun(args, "monitor", accessExtras);
    }

    case "lp_guardian_get_wallet_positions": {
      const walletAddress = requireString(args, "walletAddress");
      return callBackendTool(`/api/portfolio/${walletAddress}/positions`, undefined, accessExtras);
    }

    case "lp_guardian_validate_ownership": {
      const walletAddress = requireString(args, "walletAddress");
      const tokenId = requireString(args, "tokenId");
      return callBackendTool("/api/portfolio/validate-ownership", {
        method: "POST",
        body: JSON.stringify({ walletAddress, tokenId }),
      }, accessExtras);
    }

    case "lp_guardian_diagnose_portfolio":
      return callPortfolioDiagnose(args, accessExtras);

    case "lp_guardian_get_report": {
      const rootHash = requireString(args, "rootHash");
      return callBackendTool(`/api/report/${rootHash}`, undefined, accessExtras);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
