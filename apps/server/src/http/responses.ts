export interface ApiSuccess<TData> {
  status: "ok";
  data: TData;
}

export interface ApiError {
  status: "error";
  error: {
    code: string;
    message: string;
    issues?: unknown;
    requestId?: string;
  };
}

export function ok<TData>(data: TData): ApiSuccess<TData> {
  return {
    status: "ok",
    data,
  };
}

export function fail(
  code: string,
  message: string,
  issues?: unknown,
  requestId?: string,
): ApiError {
  return {
    status: "error",
    error: {
      code,
      message,
      issues,
      requestId,
    },
  };
}
