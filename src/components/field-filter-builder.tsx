"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { CatalogColumnDefinition, CatalogFilterCondition } from "@/types/catalog";

interface FieldFilterBuilderProps {
  conditions: CatalogFilterCondition[];
  onConditionsChange: (conditions: CatalogFilterCondition[]) => void;
  catalogColumns: CatalogColumnDefinition[];
}

export function FieldFilterBuilder({
  conditions,
  onConditionsChange,
  catalogColumns,
}: FieldFilterBuilderProps) {
  const [isEnabled, setIsEnabled] = useState(conditions.length > 0);

  // Sync checkbox when parent conditions change (e.g. dialog opens with saved conditions)
  useEffect(() => {
    if (conditions.length > 0) setIsEnabled(true);
  }, [conditions.length]);

  // Always include label and value columns alongside extras
  const allColumns = [
    { key: "label", label: "Label", type: "text" as const },
    { key: "value", label: "Value", type: "text" as const },
    ...catalogColumns.filter((col) => col.key !== "label" && col.key !== "value"),
  ];

  const handleAddCondition = useCallback(() => {
    const newCondition: CatalogFilterCondition = {
      catalogColumn: allColumns[0]?.key || "",
      staticValue: "",
      operator: "equals",
    };
    onConditionsChange([...conditions, newCondition]);
  }, [conditions, allColumns, onConditionsChange]);

  const handleRemoveCondition = useCallback(
    (index: number) => {
      const updated = conditions.filter((_, i) => i !== index);
      onConditionsChange(updated);
      if (updated.length === 0) setIsEnabled(false);
    },
    [conditions, onConditionsChange]
  );

  const handleConditionChange = useCallback(
    (index: number, field: keyof CatalogFilterCondition, value: string | null) => {
      const updated = [...conditions];
      updated[index] = { ...updated[index], [field]: value ?? "" };
      onConditionsChange(updated);
    },
    [conditions, onConditionsChange]
  );

  const handleToggleEnabled = useCallback(
    (enabled: boolean) => {
      setIsEnabled(enabled);
      if (!enabled) {
        onConditionsChange([]);
      }
    },
    [onConditionsChange]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => handleToggleEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        <label className="text-sm font-medium text-gray-300">Filter items from this catalog</label>
      </div>

      {isEnabled && (
        <div className="space-y-3 ml-6 border-l border-gray-600 pl-4">
          {conditions.map((condition, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Where</span>

              <Select value={condition.catalogColumn} onValueChange={(val) => handleConditionChange(index, "catalogColumn", val)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allColumns.map((col) => (
                    <SelectItem key={col.key} value={col.key}>
                      {col.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="text-xs text-gray-400">equals</span>

              <Input
                placeholder="e.g. JOB"
                value={condition.staticValue}
                onChange={(e) => handleConditionChange(index, "staticValue", e.target.value)}
                className="flex-1 bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />

              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleRemoveCondition(index)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            onClick={handleAddCondition}
            className="text-xs"
          >
            + Add another condition
          </Button>
        </div>
      )}
    </div>
  );
}
