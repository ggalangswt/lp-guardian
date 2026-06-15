import type { ToolResult } from "./types.js";

type JsonObject = Record<string, unknown>;

type AccessMode = "open" | "token" | "license";

export interface McpAccessDecision {
  ok: boolean;
  mode: AccessMode;
  label: "VERIFIED" | "EMULATED";
  warnings: string[];
  error?: {
    code: string;
    message: string;
  };
}

function accessMode(): AccessMode {
  const raw = (
    process.env.LPGUARDIAN_MCP_ACCESS_MODE ??
    process.env.MCP_ACCESS_MODE ??
    "open"
  ).toLowerCase();

  if (raw === "token") return "token";
  if (raw === "license" || raw === "onchain") return "license";
  return "open";
}

function configuredToken(): string | undefined {
  const value =
    process.env.LPGUARDIAN_MCP_ACCESS_TOKEN ??
    process.env.MCP_ACCESS_TOKEN;
  return value && value.length > 0 ? value : undefined;
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

export function accessSchemaProperties(): JsonObject {
  return {
    accessToken: {
      type: "string",
      description:
        "Required when LPGUARDIAN_MCP_ACCESS_MODE=token. Never persisted by the MCP server.",
    },
    licenseWalletAddress: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$",
      description:
        "Reserved for on-chain MCP license gating once the license verifier contract is configured.",
    },
    licenseProof: {
      type: "string",
      description:
        "Reserved for future on-chain/license proof payloads.",
    },
  };
}

export function evaluateMcpAccess(args: JsonObject): McpAccessDecision {
  const mode = accessMode();
  if (mode === "open") {
    return {
      ok: true,
      mode,
      label: "VERIFIED",
      warnings: [],
    };
  }

  if (mode === "token") {
    const expected = configuredToken();
    if (!expected) {
      return {
        ok: false,
        mode,
        label: "EMULATED",
        warnings: [
          "MCP token access mode is enabled, but no LPGUARDIAN_MCP_ACCESS_TOKEN is configured.",
        ],
        error: {
          code: "MCP_ACCESS_TOKEN_NOT_CONFIGURED",
          message:
            "Configure LPGUARDIAN_MCP_ACCESS_TOKEN or set LPGUARDIAN_MCP_ACCESS_MODE=open for local development.",
        },
      };
    }

    if (args.accessToken !== expected) {
      return {
        ok: false,
        mode,
        label: "EMULATED",
        warnings: [
          "MCP access token was missing or invalid; backend portfolio tools were not called.",
        ],
        error: {
          code: "MCP_ACCESS_DENIED",
          message: "A valid MCP accessToken is required for this portfolio tool.",
        },
      };
    }

    return {
      ok: true,
      mode,
      label: "VERIFIED",
      warnings: ["MCP access token validated."],
    };
  }

  return {
    ok: false,
    mode,
    label: "EMULATED",
    warnings: [
      "On-chain MCP license gating is fail-closed until the license verifier contract and ABI are configured.",
    ],
    error: {
      code: "MCP_LICENSE_VERIFIER_NOT_CONFIGURED",
      message:
        "Provide the MCP license verifier contract details before enabling LPGUARDIAN_MCP_ACCESS_MODE=license.",
    },
  };
}

export function accessDeniedResult(decision: McpAccessDecision): ToolResult {
  return resultText(
    {
      ok: false,
      label: decision.label,
      mockUsed: false,
      degraded: true,
      access: {
        mode: decision.mode,
        allowed: false,
      },
      warnings: decision.warnings,
      error: decision.error,
    },
    true,
  );
}
