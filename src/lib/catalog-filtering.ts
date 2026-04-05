import { CatalogItem, CatalogFilterCondition } from "@/types/catalog";

/**
 * Filter catalog items based on static literal values.
 * All conditions must match (AND logic).
 *
 * @param items - All catalog items
 * @param _parentRecord - Unused; kept for backward compatibility with call sites
 * @param conditions - Filter conditions to apply (each specifies catalogColumn and staticValue)
 * @returns Filtered items matching all conditions
 */
export function filterCatalogItems(
  items: CatalogItem[],
  _parentRecord: Record<string, unknown> | undefined,
  conditions: CatalogFilterCondition[]
): CatalogItem[] {
  if (!conditions || conditions.length === 0) {
    return items;
  }

  return items.filter((item) => {
    // All conditions must match
    for (const condition of conditions) {
      // Get value from item data or built-in columns (label, value)
      const catalogValue = item.data?.[condition.catalogColumn] ?? item[condition.catalogColumn as keyof CatalogItem];

      // For equals operator, string-coerce to handle JSONB types
      if (String(catalogValue) !== String(condition.staticValue)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Format a catalog item for display with selected columns.
 *
 * @param item - Catalog item to display
 * @param displayColumns - Which columns to show (e.g., ["label", "category"])
 * @returns Formatted string like "Hire (New Hire)"
 */
export function formatItemDisplay(
  item: CatalogItem,
  displayColumns: string[] = ["label", "value"]
): string {
  if (displayColumns.length === 0 || !displayColumns.includes("label")) {
    displayColumns = ["label"];
  }

  const parts: string[] = [];

  // Label is always shown first as the main text
  const label = item.label;
  parts.push(label);

  // Other selected columns shown in parentheses
  const otherCols = displayColumns.filter((col) => col !== "label");
  if (otherCols.length > 0) {
    const extras = otherCols
      .map((col) => {
        const val = item.data?.[col] ?? item[col as keyof CatalogItem];
        return val ? `${col}: ${val}` : null;
      })
      .filter(Boolean);

    if (extras.length > 0) {
      parts.push(`(${extras.join(", ")})`);
    }
  }

  return parts.join(" ");
}
