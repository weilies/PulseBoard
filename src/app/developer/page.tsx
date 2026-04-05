import Link from "next/link";
import { APP_NAME } from "@/lib/constants";


const NAV_ITEMS = [
 { id: "auth-app", label: "App Credentials" },
 { id: "auth-user", label: "User Token" },
 { id: "endpoints", label: "Endpoint Reference" },
 { id: "headers", label: "Required Headers" },
 { id: "i18n", label: "Multi-Language" },
 { id: "examples", label: "Examples" },
 { id: "parent-child", label: "Parent-Child Items" },
 { id: "date-formats", label: "Date Formats" },
 { id: "webhooks", label: "Webhooks & Events" },
 { id: "rate-limits",label: "Rate Limits" },
 { id: "errors", label: "Error Codes" },
 { id: "privacy", label: "Privacy & Isolation" },
];

// ---------------------------------------------------------------------------
// Code block component
// ---------------------------------------------------------------------------
function Code({ children }: { children: string }) {
 return (
 <pre className="overflow-x-auto rounded-lg border border-blue-500/25 bg-white dark:bg-gray-900 p-4 text-xs leading-relaxed text-[#a8c4ff] font-mono whitespace-pre">
 {children}
 </pre>
 );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
 return (
 <section id={id} className="space-y-3 scroll-mt-20">
 <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2"
 style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 {title}
 </h2>
 {children}
 </section>
 );
}

function Badge({ children, color = "cyan" }: { children: string; color?: "cyan" | "purple" | "green" | "yellow" | "red" }) {
 const colors = {
 cyan: "bg-blue-50 dark:bg-blue-950/15 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600",
 purple: "bg-purple-500/15 text-purple-400 border-gray-300 dark:border-gray-600",
 green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
 yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
 red: "bg-red-500/15 text-red-400 border-red-500/30",
 };
 return (
 <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-mono font-bold ${colors[color]}`}>
 {children}
 </span>
 );
}

function EndpointRow({ method, path, desc, href }: { method: string; color?: string; path: string; desc: string; href?: string }) {
 const methodColor: Record<string, string> = {
 GET: "text-emerald-400",
 POST: "text-blue-600 dark:text-blue-400",
 PUT: "text-yellow-400",
 PATCH: "text-orange-400",
 DELETE: "text-red-400",
 };
 const content = (
 <div className="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
 <span className={`w-14 shrink-0 text-xs font-bold font-mono ${methodColor[method] ?? "text-gray-900 dark:text-gray-100"}`}>
 {method}
 </span>
 <span className="font-mono text-xs text-gray-900 dark:text-gray-100 min-w-0 break-all">{path}</span>
 <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto shrink-0 hidden sm:block">{desc}</span>
 </div>
 );

 if (href) {
 return <a href={href} className="hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors block">{content}</a>;
 }
 return content;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DeveloperPage() {
 return (
 <div className="min-h-screen bg-white dark:bg-gray-900">
 {/* Header */}
 <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
 <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Link href="/login" className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 transition-colors">
 ← Back to login
 </Link>
 <span className="text-blue-500 dark:text-blue-400/30">|</span>
 <span className="text-sm font-bold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 {APP_NAME} API
 </span>
 </div>
 <span className="rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-mono text-blue-600 dark:text-blue-400">
 v1
 </span>
 </div>
 </div>

 <div className="mx-auto max-w-5xl px-6 py-10 flex gap-10">

 {/* Sticky left nav */}
 <nav className="hidden lg:block w-44 shrink-0">
 <div className="sticky top-20 space-y-0.5">
 <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">On this page</p>
 {NAV_ITEMS.map(item => (
 <a
 key={item.id}
 href={`#${item.id}`}
 className="block text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 py-1.5 border-l-2 border-transparent hover:border-blue-500 pl-3 transition-colors"
 >
 {item.label}
 </a>
 ))}
 </div>
 </nav>

 {/* Main content */}
 <div className="flex-1 min-w-0 space-y-10">

 {/* Intro */}
 <div className="space-y-2">
 <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 Developer Docs
 </h1>
 <p className="text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
 {APP_NAME} exposes a REST API for reading and writing tenant-scoped collection data.
 Two authentication methods are supported: <strong className="text-gray-900 dark:text-gray-100">App Credentials</strong> for
 server-to-server integrations, and <strong className="text-gray-900 dark:text-gray-100">User Tokens</strong> for user-facing apps.
 </p>
 <div className="flex flex-wrap gap-2 pt-1">
 <Badge color="cyan">Bearer Token Auth</Badge>
 <Badge color="purple">Tenant-Isolated</Badge>
 <Badge color="green">100 req / min</Badge>
 </div>
 </div>

 {/* Auth Method A — App Credentials (recommended) */}
 <Section id="auth-app" title="Auth Method A — App Credentials (Recommended)">
 <p className="text-sm text-gray-500 dark:text-gray-400">
 Best for <strong className="text-gray-900 dark:text-gray-100">server-to-server integrations</strong>, cron jobs, ETL pipelines, and
 any automated system. Tenant is embedded in the token — no <code className="text-blue-600 dark:text-blue-400 font-mono text-xs">X-Tenant-Id</code> header needed.
 </p>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-1">1. Create an App</p>
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-xs text-gray-500 dark:text-gray-400 space-y-1">
 <p>
 Go to <strong className="text-gray-900 dark:text-gray-100">Integration → Applications</strong> in the {APP_NAME} dashboard.
 Click <strong className="text-gray-900 dark:text-gray-100">Create App</strong> and copy the <code className="text-blue-600 dark:text-blue-400 font-mono">app_id</code> and <code className="text-blue-600 dark:text-blue-400 font-mono">app_secret</code>.
 </p>
 <p className="text-yellow-600">
 The secret is only shown once — store it securely.
 </p>
 </div>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">2. Exchange for a Token</p>
 <Code>{`curl -X POST "https://your-domain.com/api/auth/token" \\
 -H "Content-Type: application/json" \\
 -d '{"app_id":"pb_app_a1b2c3d4e5f6g7h8","app_secret":"pb_sec_..."}'

# Response:
# { "access_token": "eyJ...", "token_type": "Bearer", "expires_in": 3600 }`}</Code>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">3. Use the Token</p>
 <Code>{`TOKEN="eyJ..." # access_token from step 2

# No X-Tenant-Id needed — tenant is embedded in the token
curl "https://your-domain.com/api/collections?type=all" \\
 -H "Authorization: Bearer $TOKEN"`}</Code>

 <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 space-y-1">
 <p><strong>Security benefits:</strong></p>
 <ul className="list-disc list-inside space-y-0.5">
 <li>Tenant ID is never exposed to integrators</li>
 <li>Secrets can be rotated instantly via the dashboard</li>
 <li>Apps can be deactivated or deleted to revoke access</li>
 <li>Optional expiry date for time-limited integrations</li>
 </ul>
 </div>
 </Section>

 {/* Auth Method B — User Token */}
 <Section id="auth-user" title="Auth Method B — User Token">
 <p className="text-sm text-gray-500 dark:text-gray-400">
 Best for <strong className="text-gray-900 dark:text-gray-100">mobile apps, employee portals</strong>, and user-facing features
 where individual identity and per-user permissions matter.
 </p>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-1">1. Get an Access Token</p>
 <Code>{`curl -s -X POST "https://your-domain.com/api/auth/user-token" \\
 -H "Content-Type: application/json" \\
 -d '{"email":"you@company.com","password":"••••••••"}' \\
 | jq -r '.access_token'`}</Code>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">2. List Your Authorized Tenants</p>
 <Code>{`TOKEN="eyJ..." # access_token from step 1

curl "https://your-domain.com/api/auth/me/tenants" \\
 -H "Authorization: Bearer $TOKEN" \\
 | jq '.tenants[] | {id, name, slug, role}'`}</Code>
 <p className="text-xs text-gray-500 dark:text-gray-400">
 Response includes all tenants you can access and your role in each.
 </p>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">3. Use the Token with a Tenant</p>
 <Code>{`TOKEN="eyJ..." # access_token from step 1
TENANT="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" # from step 2 tenants list

# User tokens require X-Tenant-Id header
curl "https://your-domain.com/api/collections?type=all" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"`}</Code>
 </Section>

 {/* Endpoint reference */}
 <Section id="endpoints" title="Endpoint Reference">
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-0.5">
 <EndpointRow method="POST" path="/api/auth/token" desc="Exchange app credentials for JWT" />
 <EndpointRow method="POST" path="/api/auth/user-token" desc="Exchange user email/password for token" />
 <EndpointRow method="GET" path="/api/auth/me/tenants" desc="List authorized tenants for user" />
 <div className="border-b border-gray-200 dark:border-gray-700 my-1" />
 <EndpointRow method="GET" path="/api/collections" desc="List collections" href="#ex-list-collections" />
 <EndpointRow method="POST" path="/api/collections" desc="Create collection" />
 <EndpointRow method="GET" path="/api/collections/:slug" desc="Get schema + fields" href="#ex-get-schema" />
 <EndpointRow method="PUT" path="/api/collections/:slug" desc="Update collection" />
 <EndpointRow method="DELETE" path="/api/collections/:slug" desc="Delete collection" />
 <EndpointRow method="GET" path="/api/collections/:slug/items" desc="List items (paginated)" href="#ex-list-items-pagination" />
 <EndpointRow method="POST" path="/api/collections/:slug/items" desc="Create item" href="#ex-create-item" />
 <EndpointRow method="GET" path="/api/collections/:slug/items/:id" desc="Get single item" />
 <EndpointRow method="PUT" path="/api/collections/:slug/items/:id" desc="Update item" href="#ex-update-item" />
 <EndpointRow method="DELETE" path="/api/collections/:slug/items/:id" desc="Delete item" href="#ex-delete-item" />
 <EndpointRow method="GET" path="/api/collections/:slug/items/:id/translations" desc="Get item translations" href="#ex-get-translations" />
 <EndpointRow method="PATCH" path="/api/collections/:slug/items/:id/translations" desc="Upsert translations" href="#ex-upsert-translations" />
 <EndpointRow method="DELETE" path="/api/collections/:slug/items/:id/translations" desc="Delete translations" href="#ex-delete-translations" />
 <EndpointRow method="GET" path="/api/collections/:slug/export" desc="Export CSV / JSON" href="#ex-export" />
 <EndpointRow method="POST" path="/api/collections/:slug/import" desc="Bulk import" href="#ex-import" />
 <EndpointRow method="GET" path="/api/content-catalogs" desc="List catalogs" href="#ex-content-catalogs" />
 <EndpointRow method="GET" path="/api/content-catalogs/:slug" desc="Catalog items" href="#ex-content-catalogs" />
 </div>
 </Section>

 {/* Required headers */}
 <Section id="headers" title="Required Headers">
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3 text-sm">
 <div className="flex gap-4">
 <code className="w-56 shrink-0 text-xs font-mono text-blue-600 dark:text-blue-400">Authorization</code>
 <span className="text-xs text-gray-500 dark:text-gray-400">
 <code className="text-gray-900 dark:text-gray-100">Bearer &lt;access_token&gt;</code> — from app credentials or user login
 </span>
 </div>
 <div className="flex gap-4">
 <code className="w-56 shrink-0 text-xs font-mono text-blue-600 dark:text-blue-400">X-Tenant-Id</code>
 <span className="text-xs text-gray-500 dark:text-gray-400">
 <code className="text-gray-900 dark:text-gray-100">&lt;tenant-uuid&gt;</code> — <strong className="text-gray-700">only required for user-token auth</strong> (not needed with app credentials)
 </span>
 </div>
 <div className="flex gap-4">
 <code className="w-56 shrink-0 text-xs font-mono text-blue-600 dark:text-blue-400">Content-Type</code>
 <span className="text-xs text-gray-500 dark:text-gray-400">
 <code className="text-gray-900 dark:text-gray-100">application/json</code> — required for POST / PUT / PATCH
 </span>
 </div>
 </div>
 </Section>

 {/* Multi-language */}
 <Section id="i18n" title="Multi-Language (i18n)">
 <p className="text-sm text-gray-500 dark:text-gray-400">
 Fields marked as <code className="text-blue-600 dark:text-blue-400 font-mono text-xs">translatable</code> in the schema
 can store per-locale values. Canonical data lives in the item&apos;s <code className="text-blue-600 dark:text-blue-400 font-mono text-xs">data</code> column (default language);
 translations are stored separately and resolved via a fallback chain.
 </p>
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3 text-xs">
 <div className="flex gap-4">
 <code className="w-56 shrink-0 font-mono text-blue-600 dark:text-blue-400">?locale=zh-CN</code>
 <span className="text-gray-500 dark:text-gray-400">
 Merge translated values into <code className="text-gray-900 dark:text-gray-100">data</code>. Fallback: <code className="text-gray-900 dark:text-gray-100">zh-CN → zh → canonical</code>
 </span>
 </div>
 <div className="flex gap-4">
 <code className="w-56 shrink-0 font-mono text-blue-600 dark:text-blue-400">?locale=*</code>
 <span className="text-gray-500 dark:text-gray-400">
 Attach <code className="text-gray-900 dark:text-gray-100">_translations</code> object with all locale values to each item
 </span>
 </div>
 <div className="flex gap-4">
 <code className="w-56 shrink-0 font-mono text-blue-600 dark:text-blue-400">(omitted)</code>
 <span className="text-gray-500 dark:text-gray-400">
 Returns canonical data only — backwards compatible
 </span>
 </div>
 </div>
 <p className="text-xs text-gray-500 dark:text-gray-400">
 The <code className="text-blue-600 dark:text-blue-400 font-mono">locale</code> param works on both list and single-item GET endpoints.
 To write translations, use the <code className="text-blue-600 dark:text-blue-400 font-mono">translations</code> field on POST/PUT
 or the dedicated <code className="text-blue-600 dark:text-blue-400 font-mono">PATCH .../translations</code> endpoint.
 </p>
 </Section>

 {/* Curl examples */}
 <Section id="examples" title="Examples">

 <div id="ex-list-collections">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">List collections</p>
 <Code>{`curl "https://your-domain.com/api/collections?type=all" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"`}</Code>
 </div>

 <div id="ex-get-schema">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Get collection schema</p>
 <Code>{`curl "https://your-domain.com/api/collections/{collection-slug}" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"`}</Code>
 </div>

 <div id="ex-list-items-pagination">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">List items — with pagination</p>
 <Code>{`curl "https://your-domain.com/api/collections/{collection-slug}/items?page=1&limit=20&sort=created_at&order=desc" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"`}</Code>
 <p className="text-xs text-gray-500 dark:text-gray-400">
 Response includes <code className="text-blue-600 dark:text-blue-400 font-mono">meta.total</code>,{""}
 <code className="text-blue-600 dark:text-blue-400 font-mono">meta.totalPages</code>, and the{""}
 <code className="text-blue-600 dark:text-blue-400 font-mono">data</code> array.
 </p>
 </div>

 <div id="ex-list-items-locale">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">List items — translated (single locale)</p>
 <Code>{`# Translated values merged into data (fallback: zh-CN → zh → default)
curl "https://your-domain.com/api/collections/{collection-slug}/items?locale=zh-CN" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"

# Response:
# { "data": [{ "id":"...", "data": {"code":"HR", "name":"人力资源"} }],
# "meta": { "locale":"zh-CN", "page":1, "total":5, ... } }`}</Code>
 </div>

 <div id="ex-list-items-all-translations">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">List items — all translations</p>
 <Code>{`# Attach _translations object to each item
curl "https://your-domain.com/api/collections/{collection-slug}/items?locale=*" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"

# Response:
# { "data": [{ "id":"...", "data":{"code":"HR","name":"Human Resources"},
# "_translations": {"zh-CN":{"name":"人力资源"}, "ms":{"name":"Sumber Manusia"}} }] }`}</Code>
 </div>

 <div id="ex-create-item">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Create an item</p>
 <Code>{`curl -X POST "https://your-domain.com/api/collections/{collection-slug}/items" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT" \\
 -H "Content-Type: application/json" \\
 -d '{"data":{"field_slug":"value","another_field":"value"}}'`}</Code>
 <p className="text-xs text-gray-500 dark:text-gray-400">
 Replace <code className="text-blue-600 dark:text-blue-400 font-mono">field_slug</code> with your collection&apos;s actual field slugs —
 visible in the schema endpoint or the Studio UI.
 </p>
 </div>

 <div id="ex-create-item-translations">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Create an item — with translations</p>
 <Code>{`curl -X POST "https://your-domain.com/api/collections/{collection-slug}/items" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT" \\
 -H "Content-Type: application/json" \\
 -d '{
 "data": {"code": "HR", "name": "Human Resources"},
 "translations": {
 "zh-CN": {"name": "人力资源"},
 "ms": {"name": "Sumber Manusia"}
 }
 }'`}</Code>
 <p className="text-xs text-gray-500 dark:text-gray-400">
 The <code className="text-blue-600 dark:text-blue-400 font-mono">translations</code> field is optional. Only fields marked
 as <code className="text-blue-600 dark:text-blue-400 font-mono">translatable</code> in the schema can be translated.
 </p>
 </div>

 <div id="ex-update-item">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Update an item</p>
 <Code>{`curl -X PUT "https://your-domain.com/api/collections/{collection-slug}/items/{item-id}" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT" \\
 -H "Content-Type: application/json" \\
 -d '{"data":{"field_slug":"updated-value"}}'`}</Code>
 </div>

 <div id="ex-delete-item">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Delete an item</p>
 <Code>{`curl -X DELETE "https://your-domain.com/api/collections/{collection-slug}/items/{item-id}" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"`}</Code>
 <p className="text-xs text-gray-500 dark:text-gray-400">Returns <code className="text-blue-600 dark:text-blue-400 font-mono">204 No Content</code> on success.</p>
 </div>

 <div id="ex-export">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Export as CSV</p>
 <Code>{`curl "https://your-domain.com/api/collections/{collection-slug}/export?format=csv" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT" \\
 -o export.csv`}</Code>
 </div>

 <div id="ex-import">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Bulk import</p>
 <Code>{`curl -X POST "https://your-domain.com/api/collections/{collection-slug}/import" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT" \\
 -H "Content-Type: application/json" \\
 -d '{
 "rows": [
 {"Name": "Alice", "Department": "Engineering"},
 {"Name": "Bob", "Department": "Design"}
 ],
 "fieldMapping": {
 "Name": "name",
 "Department": "department"
 }
 }'`}</Code>
 <p className="text-xs text-gray-500 dark:text-gray-400">
 <code className="text-blue-600 dark:text-blue-400 font-mono">fieldMapping</code> maps your CSV column names to collection field slugs.
 On validation failure the response is <code className="text-blue-600 dark:text-blue-400 font-mono">422</code> with a
 per-row <code className="text-blue-600 dark:text-blue-400 font-mono">validationErrors</code> array.
 </p>
 </div>

 <div id="ex-upsert-translations">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Upsert translations (PATCH)</p>
 <Code>{`# Update translations without touching canonical data
curl -X PATCH "https://your-domain.com/api/collections/{collection-slug}/items/{item-id}/translations" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT" \\
 -H "Content-Type: application/json" \\
 -d '{
 "zh-CN": {"name": "人力资源部"},
 "th": {"name": "ทรัพยากรบุคคล"}
 }'`}</Code>
 <p className="text-xs text-gray-500 dark:text-gray-400">
 Returns <code className="text-blue-600 dark:text-blue-400 font-mono">422</code> if you attempt to translate non-translatable fields.
 </p>
 </div>

 <div id="ex-get-translations">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Get translations for an item</p>
 <Code>{`curl "https://your-domain.com/api/collections/{collection-slug}/items/{item-id}/translations" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"

# Response:
# { "data": { "zh-CN": {"name":"人力资源"}, "ms": {"name":"Sumber Manusia"} } }`}</Code>
 </div>

 <div id="ex-delete-translations">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Delete translations</p>
 <Code>{`# Delete ALL translations for an item
curl -X DELETE "https://your-domain.com/api/collections/{collection-slug}/items/{item-id}/translations" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"

# Delete only a specific locale
curl -X DELETE "https://your-domain.com/api/collections/{collection-slug}/items/{item-id}/translations?locale=zh-CN" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"`}</Code>
 </div>

 <div id="ex-content-catalogs">
 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">List content catalogs</p>
 <Code>{`curl "https://your-domain.com/api/content-catalogs" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"

# Get items for a specific catalog (e.g. gender, country, marital-status)
curl "https://your-domain.com/api/content-catalogs/{catalog-slug}" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"`}</Code>
 </div>
 </Section>

 {/* Parent-Child Items */}
 <Section id="parent-child" title="Parent-Child Items">
 <p className="text-sm text-gray-500 dark:text-gray-400">
 Collections can have <strong className="text-gray-900 dark:text-gray-100">parent-child relationships</strong> (e.g. Employees → Employments, Employees → Identities).
 A child collection has a <code className="text-blue-600 dark:text-blue-400 font-mono text-xs">relation</code> field with{" "}
 <code className="text-blue-600 dark:text-blue-400 font-mono text-xs">relationship_style: &quot;child_of&quot;</code> pointing to the parent collection.
 </p>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-1">How it works</p>
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-2 text-xs text-gray-500 dark:text-gray-400">
 <p>The parent reference is stored as a field in the child item&apos;s <code className="text-blue-600 dark:text-blue-400 font-mono">data</code> object.
 For example, an Employment item stores <code className="text-blue-600 dark:text-blue-400 font-mono">employee_id</code> pointing to the parent Employee&apos;s item ID.</p>
 <p><strong className="text-gray-900 dark:text-gray-100">Validation:</strong> When creating or updating a child item, the API verifies that the
 referenced parent item <strong className="text-gray-900 dark:text-gray-100">actually exists</strong> in the related collection.
 If the parent ID is invalid or the parent was deleted, the request is rejected with <code className="text-red-400 font-mono">422</code>.</p>
 </div>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">List child items of a parent</p>
 <Code>{`# List all Employments for a specific Employee
curl "https://YOUR-DOMAIN/api/collections/employments/items?parent_id={employee-item-id}" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"

# The parent_field is auto-detected from the schema.
# To specify manually:
# ?parent_id={id}&parent_field=employee_id`}</Code>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Create a child item</p>
 <Code>{`# Create an Employment under an existing Employee
curl -X POST "https://YOUR-DOMAIN/api/collections/employments/items" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT" \\
 -H "Content-Type: application/json" \\
 -d '{
 "data": {
   "employee_id": "a1b2c3d4-...",
   "effective_date": "2026-01-15",
   "location": "Singapore",
   "position": "Software Engineer"
 }
}'

# Success -> 201
# {
#   "data": {
#     "id": "new-uuid",
#     "data": { "employee_id": "a1b2c3d4-...", ... },
#     "created_at": "2026-03-28T..."
#   }
# }

# If employee_id does not exist -> 422
# {
#   "errors": [{
#     "field": "employee_id",
#     "message": "Employee references a parent record that does not exist"
#   }]
# }`}</Code>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Get parent item with nested records (depth)</p>
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-2 text-xs mb-3">
 {[
  ["depth=0", "cyan", "Default — return only the item itself (no children)"],
  ["depth=1", "green", "Include direct children in _children object"],
  ["depth=2", "purple", "Recurse one more level — each child item gains its own _children"],
 ].map(([param, color, desc]) => (
  <div key={param} className="flex items-start gap-3">
  <Badge color={color as "cyan" | "green" | "purple"}>{param}</Badge>
  <span className="text-gray-500 dark:text-gray-400">{desc}</span>
  </div>
 ))}
 </div>
 <Code>{`# depth=1 — fetch Employee with child collections
curl "https://YOUR-DOMAIN/api/collections/employees/items/{item-id}?depth=1" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"

# Response:
# {
#   "data": { "id": "...", "data": { "name": "Alice", ... } },
#   "_children": {
#     "employments": { "items": [...], "total": 3 },
#     "identities":  { "items": [...], "total": 1 }
#   }
# }

# depth=2 — each child item gets its own _children (same key, recursive)
curl "https://YOUR-DOMAIN/api/collections/employees/items/{item-id}?depth=2" \\
 -H "Authorization: Bearer $TOKEN" \\
 -H "X-Tenant-Id: $TENANT"

# Response: _children is used at every level uniformly
# {
#   "data": { ... },
#   "_children": {
#     "employments": {
#       "items": [
#         {
#           "id": "...", "data": { ... },
#           "_children": {
#             "bios": { "items": [...], "total": 1 }
#           }
#         }
#       ],
#       "total": 1
#     }
#   }
# }`}</Code>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Delete behavior (cascade rules)</p>
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-2 text-xs">
 {[
 ["restrict", "yellow", "Block delete if child records exist (default) — returns 409"],
 ["cascade", "red", "Delete all child records when parent is deleted"],
 ["nullify", "purple", "Remove parent reference from children (orphan them intentionally)"],
 ].map(([rule, color, desc]) => (
 <div key={rule} className="flex items-start gap-3">
 <Badge color={color as "yellow" | "red" | "purple"}>{rule}</Badge>
 <span className="text-gray-500 dark:text-gray-400">{desc}</span>
 </div>
 ))}
 <p className="text-gray-500 dark:text-gray-400 pt-1">
 Set in collection metadata: <code className="text-blue-600 dark:text-blue-400 font-mono">{`{"cascade_rules": {"on_parent_delete": "restrict"}}`}</code>
 </p>
 </div>
 </Section>

 {/* Date & Time Formats */}
 <Section id="date-formats" title="Date &amp; Time Formats">
 <p className="text-sm text-gray-500 dark:text-gray-400">
 All date and datetime values follow <strong className="text-gray-900 dark:text-gray-100">ISO 8601</strong>.
 The system stores dates in UTC — always include a timezone offset for datetime fields to avoid ambiguity.
 </p>

 <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4 text-xs">
 <div>
  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
   <code className="text-blue-600 dark:text-blue-400 font-mono">date</code> field — date only, no time
  </p>
  <div className="space-y-1">
   {[
    ["2026-01-15", "2026-01-15", "green", "Recommended — YYYY-MM-DD"],
    ["2026/01/15", "2026-01-15", "yellow", "Also accepted — parsed by JS Date()"],
    ["15-01-2026", "—", "red", "Avoid — ambiguous, may fail in some locales"],
    ["Jan 15 2026", "2026-01-15", "yellow", "Accepted but not recommended"],
   ].map(([input, stored, color, note]) => (
    <div key={input} className="grid grid-cols-[auto_auto_1fr] gap-3 items-center">
     <code className="text-gray-900 dark:text-gray-100 font-mono w-32 shrink-0">{input}</code>
     <span className="text-gray-400">→</span>
     <span className="text-gray-500 dark:text-gray-400">{stored} &nbsp;<span className={color === "green" ? "text-emerald-500" : color === "yellow" ? "text-yellow-500" : "text-red-400"}>{note}</span></span>
    </div>
   ))}
  </div>
 </div>

 <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
   <code className="text-blue-600 dark:text-blue-400 font-mono">datetime</code> field — always normalized to UTC ISO 8601
  </p>
  <div className="space-y-1">
   {[
    ["2026-01-15T09:00:00Z", "2026-01-15T09:00:00Z", "green", "UTC explicit — preferred"],
    ["2026-01-15T09:00:00+08:00", "2026-01-15T01:00:00.000Z", "green", "Offset provided — converted to UTC"],
    ["2026-01-15T09:00", "2026-01-15T09:00:00.000Z", "yellow", "No timezone — treated as UTC"],
    ["2026-01-15T09:00:00", "2026-01-15T09:00:00.000Z", "yellow", "No timezone — treated as UTC"],
    ["2026-01-15", "2026-01-15T00:00:00.000Z", "yellow", "Date only — midnight UTC assumed"],
   ].map(([input, stored, color, note]) => (
    <div key={input} className="grid grid-cols-[auto_auto_1fr] gap-3 items-center">
     <code className="text-gray-900 dark:text-gray-100 font-mono w-48 shrink-0 text-[11px]">{input}</code>
     <span className="text-gray-400">→</span>
     <span className="text-gray-500 dark:text-gray-400 text-[11px]">{stored} &nbsp;<span className={color === "green" ? "text-emerald-500" : "text-yellow-500"}>{note}</span></span>
    </div>
   ))}
  </div>
 </div>
 </div>

 <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
  <p><strong>Rule of thumb:</strong></p>
  <ul className="list-disc list-inside space-y-0.5 text-blue-600 dark:text-blue-400">
   <li><code className="font-mono">date</code> fields → send <code className="font-mono">YYYY-MM-DD</code></li>
   <li><code className="font-mono">datetime</code> fields → send <code className="font-mono">YYYY-MM-DDTHH:mm:ssZ</code> with explicit UTC offset</li>
   <li>If you omit the timezone on a datetime, the system treats it as UTC</li>
   <li>Never send <code className="font-mono">DD-MM-YYYY</code> or <code className="font-mono">MM/DD/YYYY</code> — ambiguous and unreliable</li>
  </ul>
 </div>
 </Section>

 {/* Webhooks & Events */}
 <Section id="webhooks" title="Webhooks & Events">
 <p className="text-sm text-gray-500 dark:text-gray-400">
 PulseBox fires outbound HTTP webhooks after item mutations, and supports two additional
 server-side hook points: <strong className="text-gray-900 dark:text-gray-100">onPreSave</strong> (blocking — can reject writes)
 and per-field <strong className="text-gray-900 dark:text-gray-100">validation hooks</strong> (server-side — works without JS).
 All hooks are configured in Studio → Collection → <code className="text-blue-600 dark:text-blue-400 font-mono text-xs">Webhooks</code>.
 </p>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-1">Event Types</p>
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-2 text-xs">
 {[
 ["item.created", "green", "Fired after POST /items — item successfully inserted"],
 ["item.updated", "yellow", "Fired after PUT /items/:id — item data updated"],
 ["item.deleted", "red", "Fired after DELETE /items/:id — item removed"],
 ["item.pre_save","purple", "onPreSave hook — fired before insert/update, can block"],
 ].map(([ev, color, desc]) => (
 <div key={ev} className="flex items-start gap-3">
 <Badge color={color as "green" | "yellow" | "red" | "purple"}>{ev}</Badge>
 <span className="text-gray-500 dark:text-gray-400">{desc}</span>
 </div>
 ))}
 </div>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Webhook Payload</p>
 <Code>{`// POST to your endpoint
// Headers:
// Content-Type: application/json
// X-PulseBox-Event: item.created
// X-PulseBox-Collection: employees
// X-PulseBox-Signature: sha256=<hmac-sha256-hex> (if secret configured)
// User-Agent: PulseBox-Webhooks/1.0

{
 "event": "item.created",
 "collection": "employees",
 "tenant_id": "uuid",
 "timestamp": "2026-03-20T10:30:00.000Z",
 "data": {
 "id": "uuid",
 "data": { "name": "Alice", "department": "Engineering" },
 "created_at": "2026-03-20T10:30:00.000Z",
 "updated_at": "2026-03-20T10:30:00.000Z"
 }
}`}</Code>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Signature Verification</p>
 <Code>{`// Node.js example
const crypto = require("crypto");

function verifySignature(secret, rawBody, signatureHeader) {
 const expected = "sha256=" + crypto
 .createHmac("sha256", secret)
 .update(rawBody)
 .digest("hex");
 return crypto.timingSafeEqual(
 Buffer.from(expected),
 Buffer.from(signatureHeader)
 );
}

// Express example
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
 const sig = req.headers["x-pulsebox-signature"];
 if (!verifySignature(process.env.WEBHOOK_SECRET, req.body, sig)) {
 return res.status(401).send("Invalid signature");
 }
 const event = JSON.parse(req.body);
 // handle event...
 res.status(200).send("ok");
});`}</Code>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">onPreSave Hook</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">
 Configured in Studio. Called before every item insert or update.
 Return <code className="text-blue-600 dark:text-blue-400 font-mono">2xx</code> to allow,
 or <code className="text-red-400 font-mono">4xx</code> to block with a custom error.
 The error message or <code className="text-blue-600 dark:text-blue-400 font-mono">errors</code> array from your response
 is forwarded to the caller as a <code className="text-blue-600 dark:text-blue-400 font-mono">422</code>.
 </p>
 <Code>{`// Your onPreSave endpoint receives:
{
 "event": "item.pre_save",
 "collection": "employees",
 "tenant_id": "uuid",
 "action": "create", // "create" | "update"
 "data": { "name": "Alice", ... },
 "item_id": "uuid" // only on "update"
}

// To allow: return 200
// To block with message:
{ "message": "Employee name already exists in payroll system" }

// To block with field-level errors (shown inline in the form):
{
 "errors": [
 { "field": "employee_id", "message": "ID already registered" },
 { "field": "start_date", "message": "Cannot backdate more than 90 days" }
 ]
}`}</Code>

 <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider pt-2">Field-Level Validation Rules</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">
 Add a <code className="text-blue-600 dark:text-blue-400 font-mono">validation</code> key to any field&apos;s{""}
 <code className="text-blue-600 dark:text-blue-400 font-mono">options</code> JSONB in the schema.
 Evaluated server-side before every write — no JavaScript required.
 </p>
 <Code>{`// collection_fields.options (per field, set via Studio or API)
{
 // Built-in rules (evaluated by PulseBox):
 "validation": {
 "min": 0, // number fields
 "max": 100, // number fields
 "pattern": "^[A-Z]{3}$", // text fields (regex)
 "error_message": "Must be 3 uppercase letters",

 // External validation webhook (per field, fail-open by default):
 "webhook_url": "https://your-api.com/validate/employee-id",
 "webhook_timeout_ms": 3000
 }
}

// Your field webhook_url receives:
{ "field": "employee_id", "value": "EMP001", "data": { ...full item data... } }

// Return 200 to pass, 4xx to fail:
{ "message": "Employee ID already exists" }`}</Code>

 <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 p-3 text-xs text-blue-700 space-y-1">
 <p><strong>Delivery guarantees:</strong></p>
 <ul className="list-disc list-inside space-y-0.5">
 <li>Outbound webhooks fire after the response is sent (non-blocking)</li>
 <li>Delivery attempts are logged — view in Studio → Collection → Webhooks</li>
 <li>No automatic retry (planned for a future release)</li>
 <li>Timeout: 8 seconds per webhook endpoint</li>
 <li>onPreSave hooks timeout at your configured value (default: 5 seconds), fail-open unless <code className="font-mono">fail_strict: true</code></li>
 </ul>
 </div>
 </Section>

 {/* Rate limits */}
 <Section id="rate-limits" title="Rate Limits">
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm space-y-2">
 <p className="text-gray-500 dark:text-gray-400 text-xs">100 requests per 60 seconds per access token. Response headers:</p>
 <Code>{`X-RateLimit-Limit: 100
X-RateLimit-Remaining: 97
X-RateLimit-Reset: 1710000000 # Unix timestamp`}</Code>
 <p className="text-xs text-gray-500 dark:text-gray-400">
 Exceeding the limit returns <code className="text-red-400 font-mono">429 Too Many Requests</code>.
 Wait until <code className="text-blue-600 dark:text-blue-400 font-mono">X-RateLimit-Reset</code> before retrying.
 </p>
 </div>
 </Section>

 {/* Error codes */}
 <Section id="errors" title="Error Codes">
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-2 text-xs">
 {[
 ["400", "yellow", "Bad request — missing or invalid parameters"],
 ["401", "red", "Missing, invalid, or expired access token"],
 ["403", "red", "Token is valid but user is not a member of the requested tenant"],
 ["404", "yellow", "Collection or item not found (also returned for tenant isolation mismatches)"],
 ["422", "yellow", "Validation failed — errors array (field-level) or import validationErrors"],
 ["429", "red", "Rate limit exceeded"],
 ["500", "red", "Internal server error — check the message field"],
 ].map(([code, color, desc]) => (
 <div key={code} className="flex items-start gap-3">
 <Badge color={color as "yellow" | "red"}>{code}</Badge>
 <span className="text-gray-500 dark:text-gray-400">{desc}</span>
 </div>
 ))}
 </div>
 </Section>

 {/* Privacy note */}
 <Section id="privacy" title="Privacy & Tenant Isolation">
 <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4 text-xs text-gray-500 dark:text-gray-400 space-y-2">
 <p>
 All tenant collection data is strictly isolated. A valid token will never return data
 belonging to another tenant — even if the resource ID is guessed correctly.
 </p>
 <p>
 System collections (maintained by the platform) are read-accessible to all authenticated tenants.
 Write access to system collections requires super-admin role.
 </p>
 <p className="text-yellow-600">
 Keep your <code className="font-mono">app_secret</code> and <code className="font-mono">access_token</code> confidential.
 Tokens expire after 1 hour. If an app secret is compromised, rotate it immediately
 from <strong>Integration → Applications</strong>.
 </p>
 </div>
 </Section>

 {/* Footer */}
 <div className="border-t border-gray-200 dark:border-gray-700 pt-6 text-center text-xs text-gray-500 dark:text-gray-400">
 <p>
 {APP_NAME} Platform API · Questions? Contact your platform administrator.
 </p>
 <Link href="/login" className="mt-2 inline-block text-blue-400 dark:text-blue-300 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 transition-colors">
 ← Back to {APP_NAME}
 </Link>
 </div>

 </div>
 </div>
 </div>
 );
}