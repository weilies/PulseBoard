/**
 * JWT helpers for app-credential auth.
 *
 * Uses the `jose` library (Edge-compatible, no native deps).
 * Signs with HMAC-SHA256 using the Supabase service-role key as the secret.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface AppTokenPayload extends JWTPayload {
  tenant_id: string;
  app_id: string;
  mode: "app"; // Distinguishes from Supabase user tokens
}

function getSecret() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for JWT signing");
  return new TextEncoder().encode(key);
}

const TOKEN_EXPIRY = "1h";

/**
 * Sign a short-lived JWT for an authenticated app.
 */
export async function signAppToken(tenantId: string, appId: string): Promise<string> {
  return new SignJWT({ tenant_id: tenantId, app_id: appId, mode: "app" } satisfies AppTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .setIssuer("pulseboard")
    .sign(getSecret());
}

/**
 * Verify and decode an app JWT. Returns null if invalid/expired.
 */
export async function verifyAppToken(token: string): Promise<AppTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: "pulseboard" });
    if (payload.mode !== "app" || !payload.tenant_id || !payload.app_id) return null;
    return payload as AppTokenPayload;
  } catch {
    return null;
  }
}
