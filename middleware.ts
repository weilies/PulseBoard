import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_ROUTES, TENANT_COOKIE, LANG_COOKIE } from "@/lib/constants";

// Map route prefixes to required page slugs
const ROUTE_PAGE_MAP: Array<[string, string]> = [
  ["/dashboard/tenants", "tenants"],
  ["/dashboard/users", "users"],
  ["/dashboard/apps", "apps"],
  ["/dashboard/roles", "roles"],
  ["/dashboard/nav", "roles"],
  ["/dashboard/studio/content-catalog", "studio.content-catalog"],
  ["/dashboard/studio/system-collections", "studio.system-collections"],
  ["/dashboard/studio/tenant-collections", "studio.tenant-collections"],
  ["/dashboard/studio", "studio.system-collections"], // fallback for /dashboard/studio redirect
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes and all API routes (API routes handle their own Bearer-token auth)
  if (pathname.startsWith("/api/") || PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check user has at least one active tenant membership
  const { data: activeMembership } = await supabase
    .from("tenant_users")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!activeMembership) {
    // User exists but has no active membership — sign them out and redirect
    await supabase.auth.signOut();
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "account_suspended");
    return NextResponse.redirect(loginUrl);
  }

  // Language preference: ensure pb-lang cookie is set
  if (!request.cookies.get(LANG_COOKIE)?.value) {
    response.cookies.set(LANG_COOKIE, "en", {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  // Tenant resolution: ensure pb-tenant cookie is set
  const tenantCookie = request.cookies.get(TENANT_COOKIE)?.value;

  if (!tenantCookie) {
    const { data: rows } = await supabase
      .from("tenant_users")
      .select("tenant_id, is_default")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("is_default", { ascending: false })
      .limit(5);

    const resolved = rows?.find((r) => r.is_default) ?? rows?.[0];
    if (resolved?.tenant_id) {
      response.cookies.set(TENANT_COOKIE, resolved.tenant_id, {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
  }

  // Policy-based route guard: find the most specific matching route
  const matchedRoute = ROUTE_PAGE_MAP.find(([prefix]) => pathname.startsWith(prefix));

  if (matchedRoute) {
    const [, pageSlug] = matchedRoute;
    const { data: hasAccess } = await supabase.rpc("has_page_access", { p_page_slug: pageSlug });

    if (!hasAccess) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Collection direct pages: /dashboard/c/[slug] — check collection read permission
  const collectionMatch = pathname.match(/^\/dashboard\/c\/([^/]+)/);
  if (collectionMatch) {
    // We need the collection ID from slug — do a quick lookup
    const collectionSlug = collectionMatch[1];
    const { data: col } = await supabase
      .from("collections")
      .select("id")
      .eq("slug", collectionSlug)
      .maybeSingle();

    if (col) {
      const { data: hasAccess } = await supabase.rpc("has_permission", {
        p_resource_type: "collection",
        p_resource_id: col.id,
        p_permission: "read",
      });
      if (!hasAccess) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
