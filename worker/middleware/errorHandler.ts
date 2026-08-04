// worker/middleware/errorHandler.ts
import { Response } from '@cloudflare/workers-types';

export function createErrorResponse(code: string, message: string, status: number = 400): globalThis.Response {
  return new globalThis.Response(
    JSON.stringify({
      success: false,
      error: {
        code,
        message,
      },
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

export function createSuccessResponse<T>(data: T, status: number = 200): globalThis.Response {
  return new globalThis.Response(
    JSON.stringify({
      success: true,
      data,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
