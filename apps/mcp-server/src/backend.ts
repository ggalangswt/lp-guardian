const DEFAULT_API_URL = "http://localhost:3001";

export interface BackendResult<T = unknown> {
  status: number;
  body: T;
}

export function backendBaseUrl(): string {
  const raw =
    process.env.LPGUARDIAN_API_URL ??
    process.env.LP_GUARDIAN_API_URL ??
    process.env.VITE_LPGUARDIAN_API_URL ??
    process.env.VITE_API_URL ??
    DEFAULT_API_URL;

  return raw.replace(/\/+$/, "");
}

export async function backendJson<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<BackendResult<T>> {
  const response = await fetch(`${backendBaseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) as T : null as T;

  return {
    status: response.status,
    body,
  };
}

export function unwrapApiResponse(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "status" in value &&
    (value as { status?: unknown }).status === "ok" &&
    "data" in value
  ) {
    return (value as { data: unknown }).data;
  }

  return value;
}
