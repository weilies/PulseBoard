/**
 * Column definition in a catalog's schema.
 * Defines what data each catalog item can store.
 */
export interface CatalogColumnDefinition {
  key: string;          // e.g., "category", "requires_approval"
  type: "text" | "number" | "boolean" | "date" | "datetime";
  required?: boolean;
  unique?: boolean;
  description?: string;
}

/**
 * Schema metadata for a catalog.
 * Stored in content_catalogs.columns JSONB.
 */
export interface CatalogSchema {
  columns: CatalogColumnDefinition[];
}

/**
 * Filter condition linking a catalog column to a parent record field.
 * Multiple conditions use AND logic.
 */
export interface CatalogFilterCondition {
  catalogColumn: string;     // e.g., "employment_type"
  parentField: string;       // e.g., "employment_type"
  operator: "equals";        // MVP: only equals
}

/**
 * Options for a select/multiselect field using a catalog.
 * Stored in collection_fields.options JSONB.
 */
export interface CatalogFieldOptions {
  catalog_slug: string;
  filter_conditions?: CatalogFilterCondition[];
  display_columns?: string[];  // Default: ["label", "value"]
}

/**
 * Catalog item with data columns (client-side representation).
 */
export interface CatalogItem {
  id: string;
  catalog_id: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  data?: Record<string, unknown>;  // Extra fields from schema
}

/**
 * Catalog with schema (client-side representation).
 */
export interface Catalog {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  columns: CatalogSchema | null;  // null = use default [label, value]
}
