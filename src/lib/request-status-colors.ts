import { getContrastColor, normalizeHexColor } from "@/lib/color-utils";
import {
  REQUEST_STATUSES,
  REQUEST_STATUS_BADGE_LIGHT,
  type RequestStatus,
} from "@/lib/request-statuses";

export const CRM_SETTINGS_KEY_REQUEST_STATUS_COLORS = "request_status_colors";

export type RequestStatusColorsMap = Record<RequestStatus, string>;

export function getDefaultRequestStatusColors(): RequestStatusColorsMap {
  return Object.fromEntries(
    REQUEST_STATUSES.map((s) => [s, REQUEST_STATUS_BADGE_LIGHT[s].backgroundColor]),
  ) as RequestStatusColorsMap;
}

export function parseRequestStatusColorsValue(raw: string | null | undefined): RequestStatusColorsMap {
  const defaults = getDefaultRequestStatusColors();
  if (!raw?.trim()) return defaults;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return mergeRequestStatusColors(parsed, defaults);
  } catch {
    return defaults;
  }
}

export function mergeRequestStatusColors(
  input: unknown,
  base: RequestStatusColorsMap = getDefaultRequestStatusColors(),
): RequestStatusColorsMap {
  const next = { ...base };
  if (!input || typeof input !== "object") return next;
  const obj = input as Record<string, unknown>;
  const source =
    obj.request_status_colors && typeof obj.request_status_colors === "object"
      ? (obj.request_status_colors as Record<string, unknown>)
      : obj;
  for (const status of REQUEST_STATUSES) {
    const v = source[status];
    if (typeof v === "string") {
      const hex = normalizeHexColor(v);
      if (hex) next[status] = hex;
    }
  }
  return next;
}

export function serializeRequestStatusColors(map: RequestStatusColorsMap): string {
  return JSON.stringify(map);
}

export type RequestStatusCardStyle = {
  backgroundColor: string;
  borderLeftColor: string;
  color: string;
};

export function getRequestStatusCardStyle(
  status: string | null | undefined,
  colors: RequestStatusColorsMap,
  getCanonical: (s: string | null | undefined) => RequestStatus,
): RequestStatusCardStyle {
  const key = getCanonical(status);
  const backgroundColor = colors[key] ?? getDefaultRequestStatusColors()[key];
  return {
    backgroundColor,
    borderLeftColor: backgroundColor,
    color: getContrastColor(backgroundColor),
  };
}
