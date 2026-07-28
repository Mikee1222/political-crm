import { describe, expect, it } from "vitest";
import {
  formatRetellAgentDisplay,
  truncateRetellAgentId,
} from "@/lib/campaign-retell-agent";

describe("truncateRetellAgentId", () => {
  it("truncates long ids", () => {
    expect(truncateRetellAgentId("agent_f2c346abcdef")).toBe("agent_f2...");
  });
  it("keeps short ids", () => {
    expect(truncateRetellAgentId("abc")).toBe("abc");
  });
});

describe("formatRetellAgentDisplay", () => {
  it("prefers catalog name", () => {
    expect(formatRetellAgentDisplay("agent_f2c346abcdef", "Πρωινός Agent")).toBe("Πρωινός Agent");
  });
  it("truncates when name missing or equals id", () => {
    expect(formatRetellAgentDisplay("agent_f2c346abcdef", null)).toBe("agent_f2...");
    expect(formatRetellAgentDisplay("agent_f2c346abcdef", "agent_f2c346abcdef")).toBe("agent_f2...");
  });
  it("returns null when empty", () => {
    expect(formatRetellAgentDisplay(null, null)).toBeNull();
  });
});
