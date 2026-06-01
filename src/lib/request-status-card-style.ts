import { getRequestStatusCardStyle, type RequestStatusColorsMap } from "@/lib/request-status-colors";
import { getCanonicalRequestStatus } from "@/lib/request-statuses";

export function requestCardStatusStyle(
  status: string | null | undefined,
  colors: RequestStatusColorsMap,
) {
  return getRequestStatusCardStyle(status, colors, getCanonicalRequestStatus);
}
