import type { CalendarEventType } from "@/lib/calendar-event-types";

export type EventCategoryRow = {
  type_key: CalendarEventType;
  name: string;
  color: string;
  updated_at: string;
};
