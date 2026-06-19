import type { ServerConfig } from "../config.js";

export type BeDataLabel = "VERIFIED" | "COMPUTED" | "ESTIMATED" | "EMULATED" | "UNAVAILABLE";

export interface BeDataProvenance {
  label: BeDataLabel;
  source: string;
  degraded: boolean;
  warnings: string[];
  observedAt: number;
}

export interface BeDataResult<TData> {
  ok: boolean;
  data?: TData;
  provenance: BeDataProvenance;
}

export interface CorrelationResponse {
  matrix: Record<string, Record<string, number>>;
  tokens: string[];
  riskConcentration: number;
  provenance?: BeDataProvenance;
}

export interface OptimizeResponse {
  optimalWeights: Record<string, number>;
  actions: unknown[];
  expectedReturn: number;
  expectedRisk: number;
  provenance?: BeDataProvenance;
}

export interface SimulateResponse {
  results: unknown[];
  provenance?: BeDataProvenance;
}

export interface TeeSignResponse {
  signature: `0x${string}`;
  attestation: string;
  attestationHash: `0x${string}`;
  provider: "phala-tdx" | "phala" | "aws-nitro" | "developer-key" | "mock";
  provenance?: BeDataProvenance;
}

function unavailable(source: string, warning: string): BeDataProvenance {
  return {
    label: "UNAVAILABLE",
    source,
    degraded: true,
    warnings: [warning],
    observedAt: Date.now(),
  };
}

function computed(source: string): BeDataProvenance {
  return {
    label: "COMPUTED",
    source,
    degraded: false,
    warnings: [],
    observedAt: Date.now(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class BeDataClient {
  constructor(
    private readonly config: ServerConfig,
    private readonly timeoutMs = 800,
    // TEE attestation (TDX quote) routinely takes longer than the
    // 800ms compute budget, so signing gets its own generous timeout.
    private readonly teeTimeoutMs = 15_000,
  ) {}

  get configured(): boolean {
    return Boolean(this.config.beDataServiceUrl);
  }

  async computeCorrelation(input: {
    positions: unknown[];
    priceHistory: unknown[];
  }): Promise<BeDataResult<CorrelationResponse>> {
    return this.post<CorrelationResponse>("/compute/correlation", input);
  }

  async computeOptimize(input: {
    positions: unknown[];
    correlation: unknown;
    constraints: unknown;
    priceHistory?: unknown[];
  }): Promise<BeDataResult<OptimizeResponse>> {
    return this.post<OptimizeResponse>("/compute/optimize", input);
  }

  async computeSimulate(input: {
    positions: unknown[];
    scenarios: string[];
    priceHistory?: unknown[];
  }): Promise<BeDataResult<SimulateResponse>> {
    return this.post<SimulateResponse>("/compute/simulate", input);
  }

  async teeSign(input: {
    inputData: unknown;
    outputData: unknown;
    reportHash: `0x${string}`;
  }): Promise<BeDataResult<TeeSignResponse>> {
    return this.post<TeeSignResponse>("/tee/sign", input, this.teeTimeoutMs);
  }

  private async post<TData>(
    path: string,
    body: unknown,
    timeoutMs: number = this.timeoutMs,
  ): Promise<BeDataResult<TData>> {
    const baseUrl = this.config.beDataServiceUrl;
    if (!baseUrl) {
      return {
        ok: false,
        provenance: unavailable(
          "BE Data service",
          "BE_DATA_SERVICE_URL is not configured; BE Data computation was skipped.",
        ),
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (this.config.beDataAuthToken) {
        headers.authorization = `Bearer ${this.config.beDataAuthToken}`;
      }

      const response = await fetch(new URL(path, baseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          ok: false,
          provenance: unavailable(
            `BE Data ${path}`,
            `BE Data service returned HTTP ${response.status}.`,
          ),
        };
      }

      const data = await response.json() as TData;
      const provenance = isRecord(data) && isRecord(data.provenance)
        ? {
            ...computed(`BE Data ${path}`),
            ...data.provenance,
            observedAt: Date.now(),
          } as BeDataProvenance
        : computed(`BE Data ${path}`);

      return {
        ok: true,
        data,
        provenance,
      };
    } catch (error) {
      return {
        ok: false,
        provenance: unavailable(
          `BE Data ${path}`,
          error instanceof Error
            ? error.message
            : "BE Data request failed before a response was received.",
        ),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
