export type ParentRecordElement = {
  type: "field";
  fieldSlug: string;
  width: "1" | "2" | "3"; // 1 of 3, 2 of 3, full (3 of 3)
};

export type ParentRecordLayout = {
  elements: ParentRecordElement[];
};
