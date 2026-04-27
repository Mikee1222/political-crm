import { describe, it, expect } from "vitest";
import { isPortalUserFromServiceReads } from "./portal-user-status";
import { representativeCrmApiPathsBlockedForPortal } from "./crm-portal-blocklist";

describe("isPortalUserFromServiceReads (service-role semantics)", () => {
  it("treats profile is_portal true as portal", () => {
    expect(isPortalUserFromServiceReads({ is_portal: true }, false)).toBe(true);
  });
  it("treats profile is_portal false as CRM, ignoring portal_users row for consistency", () => {
    expect(isPortalUserFromServiceReads({ is_portal: false }, true)).toBe(false);
  });
  it("with no profile row, falls back to portal_users presence", () => {
    expect(isPortalUserFromServiceReads(null, true)).toBe(true);
    expect(isPortalUserFromServiceReads(null, false)).toBe(false);
  });
});

/**
 * These paths must be denied for portal users (document for regression; middleware + checkCRMAccess enforce).
 * Live 403/redirect tests need a real portal session cookie; run against staging or a dedicated E2E user.
 */
describe("CRM API blocklist (representative samples)", () => {
  it("includes core CRM endpoints", () => {
    expect(representativeCrmApiPathsBlockedForPortal).toEqual(
      expect.arrayContaining([
        "/api/contacts",
        "/api/requests",
        "/api/campaigns",
        "/api/dashboard",
      ]),
    );
  });
});
