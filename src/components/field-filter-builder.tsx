"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";
import { CatalogColumnDefinition, CatalogFilterCondition } from "@/types/catalog";

interface FieldFilterBuilderProps {
  conditions: CatalogFilterCondition[];
  onConditionsChange: (conditions: CatalogFilterCondition[]) => void;
  catalogColumns: CatalogColumnDefinition[];
  parentFields: string[];
}

export function FieldFilterBuilder({
  conditions,
  onConditionsChange,
  catalogColumns,
  parentFields,
}: FieldFilterBuilderProps) {
  const [isEnabled, setIsEnabled] = useState(conditions.length > 0);

  const handleAddCondition = useCallback(() => {
    const newCondition: CatalogFilterCondition = {
      catalogColumn: catalogColumns[0]?.key || "",
      parentField: parentFields[0] || "",
      operator: "equals",
    };
    onConditionsChange([...conditions, newCondition]);
  }, [conditions, catalogColumns, parentFields, onConditionsChange]);

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
                  {catalogColumns.map((col) => (
                    <SelectItem key={col.key} value={col.key}>
                      {col.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="text-xs text-gray-400">equals</span>

              <Select value={condition.parentField} onValueChange={(val) => handleConditionChange(index, "parentField", val)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Parent field..." />
                </SelectTrigger>
                <SelectContent>
                  {parentFields.map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
