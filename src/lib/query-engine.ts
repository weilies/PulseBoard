// =============================================================================
// Query Engine — Executes QueryDefinition against collection_items
// =============================================================================
// Fetches items from each referenced collection, then performs in-memory:
//   1. JOINs (inner, left, right, full)
//   2. Filtering (WHERE)
//   3. Aggregation (GROUP BY + aggregate functions)
//   4. Field selection
//   5. Sorting + limit
// =============================================================================

import type {
  QueryDefinition,
  QueryResult,
  QueryCollectionRef,
  QueryJoin,
  QueryFilter,
  QueryAggregation,
  QueryGroupBy,
  QuerySort,
} from "@/types/queries";

type AdminClient = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;
type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function executeQuery(
  db: AdminClient,
  definition: QueryDefinition,
  tenantId: string,
  accessibleCollectionIds: Set<string>
): Promise<QueryResult> {
  const start = performance.now();

  // 1. Validate all collections are accessible
  for (const col of definition.collections) {
    if (!accessibleCollectionIds.has(col.id)) {
      throw new Error(`Access denied to collection: ${col.slug}`);
    }
  }

  if (definition.collections.length === 0) {
    return { columns: [], rows: [], total: 0, execution_ms: 0 };
  }

  // 2. Fetch items from all collections in parallel
  const collectionData = await fetchAllCollections(db, definition.collections, tenantId);

  // 3. Perform joins
  let rows = performJoins(definition.collections, definition.joins, collectionData);

  // 4. Apply filters
  if (definition.filters.length > 0) {
    rows = applyFilters(rows, definition.filters);
  }

  // 5. Aggregation or field selection
  if (definition.aggregations.length > 0) {
    rows = applyAggregation(rows, definition.group_by, definition.aggregations);
  } else if (definition.fields.length > 0) {
    rows = selectFields(rows, definition.fields);
  }

  // 6. Sorting
  if (definition.sort.length > 0) {
    rows = applySort(rows, definition.sort);
  }

  // 7. Limit
  const limit = Math.min(definition.limit || 500, 5000);
  const total = rows.length;
  rows = rows.slice(0, limit);

  // 8. Derive columns from result
  const columns = rows.length > 0 ? Object.keys(rows[0]) : deriveColumns(definition);

  const execution_ms = Math.round(performance.now() - start);
  return { columns, rows, total, execution_ms };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchAllCollections(
  db: AdminClient,
  collections: QueryCollectionRef[],
  tenantId: string
): Promise<Map<string, Row[]>> {
  const map = new Map<string, Row[]>();

  const results = await Promise.all(
    collections.map(async (col) => {
      // First get collection metadata to determine type + field types for password masking
      const { data: colMeta } = await db
        .from("collections")
        .select("id, type, tenant_id, collection_fields(slug, field_type)")
        .eq("id", col.id)
        .single();

      if (!colMeta) return { alias: col.alias, rows: [] };

      // Tenant collections must belong to the current tenant.
      // This guards against a saved query referencing a collection from another tenant
      // (e.g. super_admin switches tenants but the query definition still has a foreign collection ID).
      if (colMeta.type === "tenant" && colMeta.tenant_id !== tenantId) {
        throw new Error(
          `Collection "${col.slug}" belongs to a different tenant and cannot be queried in this context`
        );
      }

      // Fetch items scoped to the current tenant.
      // System collections share schema but data is always tenant-isolated.
      const query = db
        .from("collection_items")
        .select("id, data, created_at, updated_at")
        .eq("collection_id", col.id)
        .eq("tenant_id", tenantId);

      const { data: items } = await query;

      // Build set of password field slugs for this collection
      const passwordSlugs = new Set(
        ((colMeta.collection_fields ?? []) as { slug: string; field_type: string }[])
          .filter((f) => f.field_type === "password")
          .map((f) => f.slug)
      );

      // Flatten: prefix each data field with alias; mask password fields
      const rows = (items ?? []).map((item) => {
        const row: Row = {};
        row[`${col.alias}._id`] = item.id;
        row[`${col.alias}._created_at`] = item.created_at;
        row[`${col.alias}._updated_at`] = item.updated_at;
        const data = (item.data ?? {}) as Record<string, unknown>;
        for (const [key, val] of Object.entries(data)) {
          row[`${col.alias}.${key}`] = passwordSlugs.has(key) ? "****" : val;
        }
        return row;
      });

      return { alias: col.alias, rows };
    })
  );

  for (const r of results) {
    map.set(r.alias, r.rows);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Joins
// ---------------------------------------------------------------------------

function performJoins(
  collections: QueryCollectionRef[],
  joins: QueryJoin[],
  data: Map<string, Row[]>
): Row[] {
  if (collections.length === 0) return [];
  if (collections.length === 1) return data.get(collections[0].alias) ?? [];

  // Start with first collection
  let result = data.get(collections[0].alias) ?? [];

  // Apply each join sequentially
  for (const join of joins) {
    const rightRows = data.get(join.right.alias) ?? [];
    const leftField = `${join.left.alias}.${join.left.field}`;
    const rightField = `${join.right.alias}.${join.right.field}`;

    result = joinRows(result, rightRows, leftField, rightField, join.type);
  }

  return result;
}

function joinRows(
  left: Row[],
  right: Row[],
  leftField: string,
  rightField: string,
  type: QueryJoin["type"]
): Row[] {
  // Build index on right side for O(n+m) performance
  const rightIndex = new Map<string, Row[]>();
  for (const row of right) {
    const key = String(row[rightField] ?? "__null__");
    if (!rightIndex.has(key)) rightIndex.set(key, []);
    rightIndex.get(key)!.push(row);
  }

  const results: Row[] = [];
  const matchedRightKeys = new Set<string>();

  for (const leftRow of left) {
    const key = String(leftRow[leftField] ?? "__null__");
    const matches = rightIndex.get(key);

    if (matches && matches.length > 0) {
      matchedRightKeys.add(key);
      for (const rightRow of matches) {
        results.push({ ...leftRow, ...rightRow });
      }
    } else if (type === "left" || type === "full") {
      // Left/full: keep left row with nulls for right fields
      const nullRight = buildNullRow(right[0]);
      results.push({ ...leftRow, ...nullRight });
    }
    // Inner join: skip if no match
  }

  // Right/full join: add unmatched right rows
  if (type === "right" || type === "full") {
    const nullLeft = left.length > 0 ? buildNullRow(left[0]) : {};
    for (const rightRow of right) {
      const key = String(rightRow[rightField] ?? "__null__");
      if (!matchedRightKeys.has(key)) {
        results.push({ ...nullLeft, ...rightRow });
      }
    }
  }

  return results;
}

function buildNullRow(sample: Row | undefined): Row {
  if (!sample) return {};
  const nullRow: Row = {};
  for (const key of Object.keys(sample)) {
    nullRow[key] = null;
  }
  return nullRow;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function applyFilters(rows: Row[], filters: QueryFilter[]): Row[] {
  return rows.filter((row) => {
    let result = evaluateFilter(row, filters[0]);

    for (let i = 1; i < filters.length; i++) {
      const prevLogic = filters[i - 1].logic ?? "and";
      const current = evaluateFilter(row, filters[i]);
      if (prevLogic === "and") {
        result = result && current;
      } else {
        result = result || current;
      }
    }

    return result;
  });
}

function evaluateFilter(row: Row, filter: QueryFilter): boolean {
  const key = `${filter.alias}.${filter.field}`;
  const val = row[key];
  const target = filter.value;

  switch (filter.operator) {
    case "=":
      return String(val) === String(target);
    case "!=":
      return String(val) !== String(target);
    case ">":
      return Number(val) > Number(target);
    case "<":
      return Number(val) < Number(target);
    case ">=":
      return Number(val) >= Number(target);
    case "<=":
      return Number(val) <= Number(target);
    case "contains":
      return String(val ?? "").toLowerCase().includes(String(target).toLowerCase());
    case "starts_with":
      return String(val ?? "").toLowerCase().startsWith(String(target).toLowerCase());
    case "ends_with":
      return String(val ?? "").toLowerCase().endsWith(String(target).toLowerCase());
    case "is_null":
      return val == null || val === "";
    case "is_not_null":
      return val != null && val !== "";
    case "in":
      return Array.isArray(target) && target.map(String).includes(String(val));
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function applyAggregation(
  rows: Row[],
  groupBy: QueryGroupBy[],
  aggregations: QueryAggregation[]
): Row[] {
  // Group rows
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = groupBy.map((g) => String(row[`${g.alias}.${g.field}`] ?? "")).join("|||");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  // Compute aggregates per group
  return Array.from(groups.entries()).map(([, groupRows]) => {
    const result: Row = {};

    // Add group-by values
    for (const g of groupBy) {
      const fieldKey = `${g.alias}.${g.field}`;
      result[fieldKey] = groupRows[0][fieldKey];
    }

    // Calculate each aggregation
    for (const agg of aggregations) {
      const fieldKey = agg.field === "*" ? null : `${agg.alias}.${agg.field}`;
      const values = fieldKey
        ? groupRows.map((r) => r[fieldKey]).filter((v) => v != null)
        : groupRows;

      switch (agg.function) {
        case "COUNT":
          result[agg.output_name] = fieldKey ? values.length : groupRows.length;
          break;
        case "SUM":
          result[agg.output_name] = (values as unknown[]).reduce(
            (a: number, b) => a + Number(b),
            0
          );
          break;
        case "AVG": {
          const nums = values as unknown[];
          const sum = nums.reduce((a: number, b) => a + Number(b), 0) as number;
          result[agg.output_name] = nums.length > 0 ? Math.round((sum / nums.length) * 100) / 100 : 0;
          break;
        }
        case "MIN":
          result[agg.output_name] = Math.min(...(values as unknown[]).map(Number));
          break;
        case "MAX":
          result[agg.output_name] = Math.max(...(values as unknown[]).map(Number));
          break;
      }
    }

    return result;
  });
}

// ---------------------------------------------------------------------------
// Field selection
// ---------------------------------------------------------------------------

function selectFields(rows: Row[], fields: { alias: string; field: string; display?: string }[]): Row[] {
  return rows.map((row) => {
    const result: Row = {};
    for (const f of fields) {
      const key = `${f.alias}.${f.field}`;
      const outKey = f.display || key;
      result[outKey] = row[key] ?? null;
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function applySort(rows: Row[], sort: QuerySort[]): Row[] {
  return [...rows].sort((a, b) => {
    for (const s of sort) {
      const key = `${s.alias}.${s.field}`;
      const aVal = a[key];
      const bVal = b[key];
      const cmp = compareValues(aVal, bVal);
      if (cmp !== 0) return s.direction === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveColumns(def: QueryDefinition): string[] {
  if (def.aggregations.length > 0) {
    return [
      ...def.group_by.map((g) => `${g.alias}.${g.field}`),
      ...def.aggregations.map((a) => a.output_name),
    ];
  }
  if (def.fields.length > 0) {
    return def.fields.map((f) => f.display || `${f.alias}.${f.field}`);
  }
  return def.collections.map((c) => `${c.alias}.*`);
}
