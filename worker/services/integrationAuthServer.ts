// worker/services/integrationAuthServer.ts

export interface IntegrationApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes_json: string;
  allowed_project_ids_json?: string;
  allowed_ips_json?: string;
  is_active: number;
  expires_at?: string;
  last_used_at?: string;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
  revoked_at?: string;
}

export async function hashApiSecretToken(rawToken: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateIntegrationApiKey(
  db: any,
  name: string,
  scopes: string[],
  createdById: string,
  createdByName: string,
  expiresInDays?: number
): Promise<{ record: IntegrationApiKeyRecord; raw_secret_once: string }> {
  // 256-bit CSPRNG Entropy
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const hexString = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const keyPrefix = 'sched_live_';
  const rawSecret = `${keyPrefix}${hexString}`;
  const keyHash = await hashApiSecretToken(rawSecret);

  const id = `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const scopesJson = JSON.stringify(scopes);

  let expiresAtStr: string | null = null;
  if (expiresInDays && expiresInDays > 0) {
    const expDate = new Date(Date.now() + expiresInDays * 86400000);
    expiresAtStr = expDate.toISOString();
  }

  await db
    .prepare(
      `INSERT INTO integration_api_keys (
        id, name, key_prefix, key_hash, scopes_json, created_by_id, created_by_name, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, name, keyPrefix, keyHash, scopesJson, createdById, createdByName, expiresAtStr)
    .run();

  const record = await db.prepare(`SELECT * FROM integration_api_keys WHERE id = ?`).bind(id).first();
  return { record, raw_secret_once: rawSecret };
}

export async function authenticateIntegrationKey(
  db: any,
  request: Request,
  requiredScope?: string
): Promise<{ allowed: boolean; apiKey?: IntegrationApiKeyRecord; errorCode?: string; errorMessage?: string }> {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return {
      allowed: false,
      errorCode: 'UNAUTHORIZED_MISSING_BEARER',
      errorMessage: 'Authorization header with Bearer token is required.',
    };
  }

  const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!rawToken) {
    return {
      allowed: false,
      errorCode: 'UNAUTHORIZED_EMPTY_TOKEN',
      errorMessage: 'Bearer token cannot be empty.',
    };
  }

  const tokenHash = await hashApiSecretToken(rawToken);

  const apiKey: IntegrationApiKeyRecord = await db
    .prepare(`SELECT * FROM integration_api_keys WHERE key_hash = ? AND is_active = 1`)
    .bind(tokenHash)
    .first();

  if (!apiKey) {
    return {
      allowed: false,
      errorCode: 'UNAUTHORIZED_INVALID_KEY',
      errorMessage: 'Invalid or inactive integration API key.',
    };
  }

  if (apiKey.expires_at) {
    const expTime = new Date(apiKey.expires_at).getTime();
    if (Date.now() > expTime) {
      return {
        allowed: false,
        errorCode: 'UNAUTHORIZED_KEY_EXPIRED',
        errorMessage: 'Integration API key has expired.',
      };
    }
  }

  if (requiredScope) {
    const scopes: string[] = JSON.parse(apiKey.scopes_json || '[]');
    if (!scopes.includes(requiredScope) && !scopes.includes('*') && !scopes.includes('admin')) {
      return {
        allowed: false,
        errorCode: 'FORBIDDEN_SCOPE_INSUFFICIENT',
        errorMessage: `API key lacks required scope '${requiredScope}'.`,
      };
    }
  }

  // Update last_used_at asynchronously
  db.prepare(`UPDATE integration_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(apiKey.id)
    .run()
    .catch(() => {});

  return { allowed: true, apiKey };
}

export async function checkAndEnforceRateLimit(
  db: any,
  apiKeyId: string,
  limitPerMinute: number = 120
): Promise<{ allowed: boolean; requestCount: number }> {
  const windowStart = Math.floor(Date.now() / 60000); // 1-minute window

  try {
    const res = await db
      .prepare(
        `INSERT INTO integration_rate_limits (api_key_id, window_start, request_count)
         VALUES (?, ?, 1)
         ON CONFLICT(api_key_id, window_start) DO UPDATE SET
           request_count = request_count + 1
         RETURNING request_count`
      )
      .bind(apiKeyId, windowStart)
      .first();

    const requestCount = res ? Number(res.request_count) : 1;
    if (requestCount > limitPerMinute) {
      return { allowed: false, requestCount };
    }
    return { allowed: true, requestCount };
  } catch {
    // Fallback if RETURNING unsupported
    await db
      .prepare(
        `INSERT INTO integration_rate_limits (api_key_id, window_start, request_count)
         VALUES (?, ?, 1)
         ON CONFLICT(api_key_id, window_start) DO UPDATE SET
           request_count = request_count + 1`
      )
      .bind(apiKeyId, windowStart)
      .run();

    const row = await db
      .prepare(`SELECT request_count FROM integration_rate_limits WHERE api_key_id = ? AND window_start = ?`)
      .bind(apiKeyId, windowStart)
      .first();

    const requestCount = row ? Number(row.request_count) : 1;
    if (requestCount > limitPerMinute) {
      return { allowed: false, requestCount };
    }
    return { allowed: true, requestCount };
  }
}

export async function logIntegrationApiRequest(
  db: any,
  requestId: string,
  apiKeyId: string,
  method: string,
  route: string,
  httpStatus: number,
  source?: string,
  externalId?: string,
  entityType?: string,
  internalId?: string,
  errorCode?: string,
  clientIp?: string
): Promise<void> {
  const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await db
    .prepare(
      `INSERT INTO integration_api_logs (
        id, request_id, api_key_id, method, route, source, external_id, entity_type, internal_id, http_status, error_code, client_ip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      requestId,
      apiKeyId,
      method,
      route,
      source || null,
      externalId || null,
      entityType || null,
      internalId || null,
      httpStatus,
      errorCode || null,
      clientIp || null
    )
    .run()
    .catch(() => {});
}
