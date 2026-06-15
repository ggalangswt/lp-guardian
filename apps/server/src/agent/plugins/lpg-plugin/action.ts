import type { Action } from "@elizaos/core";

export const SUMMARIZE_LP_RISK_ACTION = "SUMMARIZE_LP_RISK";

type Recommendation = "hold" | "rebalance" | "migrate" | "monitor";
type Scenario = "basic" | "dust-and-correlation" | "tee-unavailable";

export const summarizeLpRiskAction: Action = {
  name: SUMMARIZE_LP_RISK_ACTION,
  similes: ["LP_RISK_SUMMARY", "PORTFOLIO_RISK_SUMMARY"],
  description:
    "Summarize LP Guardian risk findings into a concise recommendation with provenance labels.",
  validate: async () => true,
  handler: async (_runtime, message, _state, _options, callback) => {
    const scenario = readScenario(message.content.scenario);
    const walletAddress = readString(message.content.walletAddress);
    const deterministic = buildDeterministicSummary({
      scenario,
      walletAddress,
    });
    const gemini = await generateGeminiSummary({
      scenario,
      walletAddress,
      fallback: deterministic,
    });
    const summary = gemini ?? deterministic;

    if (callback) {
      await callback(
        {
          text: summary.text,
          actions: [SUMMARIZE_LP_RISK_ACTION],
        },
        SUMMARIZE_LP_RISK_ACTION,
      );
    }

    return {
      text: summary.text,
      values: {
        recommendation: summary.recommendation,
        confidence: summary.confidence,
        attestationLabel: "EMULATED",
        sourceAction: SUMMARIZE_LP_RISK_ACTION,
        modelProvider: summary.modelProvider,
        modelName: summary.modelName,
        modelBacked: summary.modelBacked,
      },
      data: {
        walletAddress,
        scenario,
        recommendation: summary.recommendation,
        source: summary.modelBacked ? "eliza-gemini-action" : "eliza-action",
      },
      success: true,
    };
  },
};

interface SummaryInput {
  scenario: Scenario;
  walletAddress?: string;
}

interface SummaryResult {
  recommendation: Recommendation;
  confidence: number;
  text: string;
  modelProvider: "gemini" | "deterministic";
  modelName: string;
  modelBacked: boolean;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readScenario(value: unknown): Scenario {
  return value === "dust-and-correlation" || value === "tee-unavailable"
    ? value
    : "basic";
}

function recommendationForScenario(scenario: Scenario): Recommendation {
  if (scenario === "dust-and-correlation") return "migrate";
  if (scenario === "tee-unavailable") return "monitor";
  return "monitor";
}

function buildDeterministicSummary(input: SummaryInput): SummaryResult {
  const recommendation = recommendationForScenario(input.scenario);
  return {
    recommendation,
    confidence: input.scenario === "basic" ? 0.64 : 0.76,
    text: summarizeRecommendation({
      ...input,
      recommendation,
    }),
    modelProvider: "deterministic",
    modelName: "lp-guardian-deterministic-eliza-action",
    modelBacked: false,
  };
}

function summarizeRecommendation(
  input: SummaryInput & { recommendation: Recommendation },
): string {
  const wallet = input.walletAddress
    ? ` for wallet ${input.walletAddress}`
    : "";

  if (input.scenario === "dust-and-correlation") {
    return `ElizaOS LP Guardian action recommends ${input.recommendation}${wallet}: dust and correlation risks are present, so migration preview is the safest next step until verified live inputs say otherwise.`;
  }

  if (input.scenario === "tee-unavailable") {
    return `ElizaOS LP Guardian action recommends ${input.recommendation}${wallet}: TEE attestation is unavailable, so keep the result EMULATED and avoid execution guidance.`;
  }

  return `ElizaOS LP Guardian action recommends ${input.recommendation}${wallet}: continue monitoring while wallet ownership, price, IL, risk engine, and Phala provenance remain explicit.`;
}

async function generateGeminiSummary(input: {
  scenario: Scenario;
  walletAddress?: string;
  fallback: SummaryResult;
}): Promise<SummaryResult | null> {
  const apiKey = readString(process.env.GEMINI_API_KEY);
  if (!apiKey) return null;

  const modelName = readString(process.env.GEMINI_MODEL) ?? "gemini-1.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  "Return compact JSON only for LP Guardian strategist advice.",
                  `scenario=${input.scenario}`,
                  `wallet=${input.walletAddress ?? "unknown"}`,
                  `fallbackRecommendation=${input.fallback.recommendation}`,
                  "Schema: {\"recommendation\":\"hold|rebalance|migrate|monitor\",\"confidence\":0.0-1.0,\"rationale\":\"one concise sentence\"}",
                  "Preserve honest provenance and keep attestation EMULATED unless verified TEE evidence is supplied.",
                ].join("\n"),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    },
  );

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) return null;

  const parsed = JSON.parse(raw) as {
    recommendation?: unknown;
    confidence?: unknown;
    rationale?: unknown;
  };
  const recommendation = readRecommendation(parsed.recommendation);
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : input.fallback.confidence;
  const rationale =
    typeof parsed.rationale === "string" && parsed.rationale.trim().length > 0
      ? parsed.rationale.trim()
      : input.fallback.text;

  return {
    recommendation,
    confidence,
    text: `Gemini strategist recommends ${recommendation}: ${rationale}`,
    modelProvider: "gemini",
    modelName,
    modelBacked: true,
  };
}

function readRecommendation(value: unknown): Recommendation {
  return value === "hold" ||
    value === "rebalance" ||
    value === "migrate" ||
    value === "monitor"
    ? value
    : "monitor";
}
