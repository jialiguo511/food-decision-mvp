import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTERPRET_MAX_CHARS } from "@/lib/interpret/schema";
import { interpretErrorCopy, interpretText } from "./interpretClient";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("interpretText", () => {
  it("over-long text never leaves the browser", async () => {
    expect(await interpretText("a".repeat(INTERPRET_MAX_CHARS + 1))).toEqual({ ok: false, error: "too_long" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the record on success", async () => {
    fetchMock.mockResolvedValue(Response.json({ interpretation: { mode: "cook" } }));
    expect(await interpretText("hi")).toEqual({ ok: true, interpretation: { mode: "cook" } });
  });

  it("maps the server's code, a missing body, and a dropped connection", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "nothing_found" }, { status: 422 }));
    expect(await interpretText("zz")).toEqual({ ok: false, error: "nothing_found" });
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502 }));
    expect(await interpretText("zz")).toEqual({ ok: false, error: "unavailable" });
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await interpretText("zz")).toEqual({ ok: false, error: "network" });
  });
});

describe("interpretErrorCopy", () => {
  it("every failure keeps the text and points at step by step, except the ones where that is not the fix", () => {
    for (const code of ["nothing_found", "limit_reached", "unavailable", "network", "timeout", "not_configured"] as const) {
      expect(interpretErrorCopy(code)).toMatch(/step by step|still here/i);
    }
    expect(interpretErrorCopy("empty")).toMatch(/few words/i);
  });
});
