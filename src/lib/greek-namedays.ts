/** @deprecated Prefer `@/lib/namedays` — thin re-exports for existing imports. */
export type { NamedayMonthDay } from "./namedays";
export {
  GREEK_NAME_TO_NAMEDAY,
  getNamedayMonthDayForFirstName as getNameday,
  nameDayDateStringFromFirstName,
} from "./namedays";
