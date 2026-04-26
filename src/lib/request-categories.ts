export type RequestCategoryRow = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  /** Present when selected from /api/request-categories (SLA window in days). */
  sla_days?: number | null;
};
