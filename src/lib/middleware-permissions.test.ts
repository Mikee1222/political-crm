import { describe, expect, it } from "vitest";
import {
  pathAllowedByPermissions,
  requiredPermissionForPath,
} from "@/lib/middleware-permissions";

describe("middleware-permissions", () => {
  it("maps CRM routes to permission keys", () => {
    expect(requiredPermissionForPath("/contacts")).toBe("contacts_view");
    expect(requiredPermissionForPath("/contacts/abc")).toBe("contacts_view");
    expect(requiredPermissionForPath("/dashboard")).toBe("analytics_view");
    expect(requiredPermissionForPath("/data-tools/duplicates")).toBe("data_tools_view");
    expect(requiredPermissionForPath("/alexandra")).toBeNull();
  });

  it("uses matrix when loaded", () => {
    const keys = new Set(["contacts_view"]);
    expect(pathAllowedByPermissions("/contacts", keys, true)).toBe(true);
    expect(pathAllowedByPermissions("/requests", keys, true)).toBe(false);
  });

  it("falls back to legacy caller block when matrix unavailable", () => {
    expect(pathAllowedByPermissions("/dashboard", null, true)).toBe(false);
    expect(pathAllowedByPermissions("/dashboard", null, false)).toBe(true);
    expect(pathAllowedByPermissions("/contacts", null, true)).toBe(false);
  });
});
