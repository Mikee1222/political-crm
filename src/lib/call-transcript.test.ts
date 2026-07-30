import { describe, expect, it } from "vitest";
import { hasCallTranscript, parseCallTranscript } from "@/lib/call-transcript";

describe("parseCallTranscript", () => {
  it("returns empty for null/blank", () => {
    expect(parseCallTranscript(null)).toEqual([]);
    expect(parseCallTranscript("")).toEqual([]);
    expect(parseCallTranscript("   ")).toEqual([]);
    expect(hasCallTranscript(null)).toBe(false);
  });

  it("splits newline agent/user turns", () => {
    const raw = "agent: Καλησπέρα\nuser: Γεια σας\nagent: Πώς είστε;";
    expect(parseCallTranscript(raw)).toEqual([
      { role: "agent", text: "Καλησπέρα" },
      { role: "user", text: "Γεια σας" },
      { role: "agent", text: "Πώς είστε;" },
    ]);
  });

  it("splits same-line agent/user markers", () => {
    const raw = "agent: hello there user: hi agent: bye";
    expect(parseCallTranscript(raw)).toEqual([
      { role: "agent", text: "hello there" },
      { role: "user", text: "hi" },
      { role: "agent", text: "bye" },
    ]);
  });

  it("is case-insensitive on markers", () => {
    expect(parseCallTranscript("Agent: Hi\nUser: Hello")).toEqual([
      { role: "agent", text: "Hi" },
      { role: "user", text: "Hello" },
    ]);
  });

  it("falls back to other when no markers", () => {
    expect(parseCallTranscript("Σύντομη σύνοψη κλήσης")).toEqual([
      { role: "other", text: "Σύντομη σύνοψη κλήσης" },
    ]);
    expect(hasCallTranscript("Σύντομη σύνοψη κλήσης")).toBe(true);
  });
});
