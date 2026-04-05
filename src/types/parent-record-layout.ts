export type ParentRecordFieldElement = {
  type: "field";
  fieldSlug: string;
  width?: "1" | "2" | "3"; // legacy — kept for backward-compat in renderer
};

export type ParentRecordColumnGroup = {
  type: "column-group";
  columns: 2 | 3;
  slots: { fieldSlug: string }[][];
};

export type ParentRecordElement = ParentRecordFieldElement | ParentRecordColumnGroup;

export type ParentRecordLayout = {
  elements: ParentRecordElement[];
};
