import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signAppToken } from "@/app/api/_lib/jwt";
import { checkRateLimit, rateLimitHeaders } from "@/app/api/_lib/rate-limit";
import { createHash } from "crypto";

/**
 * POST /api/auth/token
 *
 * Exchange app credentials for a short-lived JWT.
 *
 * Body: { "app_id": "pb_app_...", "app_secret": "pb_sec_..." }
 * Returns: { "access_token": "eyJ...", "token_type": "Bearer", "expires_in": 3600 }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { app_id, app_secret } = body as { app_id?: string; app_secret?: string };

    if (!app_id || !app_secret) {
      return Response.json(
        { error: "Missing app_id or app_secret" },
        { status: 400 }
      );
    }

    // Rate-limit by app_id
    const rl = checkRateLimit(`app:${app_id}`);
    if (!rl.ok) {
      return Response.json(
        { error: "Too many requests — slow down" },
        { status: 429, headers: rateLimitHeaders(rl.remaining, rl.resetAt) }
      );
    }

    const db = createAdminClient();

    // Look up the app
    const { data: app, error } = await db
      .from("tenant_apps")
      .select("id, tenant_id, app_secret_hash, is_active, expires_at")
      .eq("app_id", app_id)
      .maybeSingle();

    if (error || !app) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (!app.is_active) {
      return Response.json({ error: "App is deactivated" }, { status: 401 });
    }

    if (app.expires_at && new Date(app.expires_at) < new Date()) {
      return Response.json({ error: "App credentials have expired" }, { status: 401 });
    }

    // Verify secret (SHA-256 hash comparison)
    const hash = createHash("sha256").update(app_secret).digest("hex");
    if (hash !== app.app_secret_hash) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Update last_used_at
    await db
      .from("tenant_apps")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", app.id);

    // Sign JWT
    const accessToken = await signAppToken(app.tenant_id, app_id);

    return Response.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
    });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
