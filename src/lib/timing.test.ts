import { describe, expect, it, vi } from "vitest";
import { createTimer } from "./timing";

describe("createTimer", () => {
  const clock = () => {
    let t = 0;
    return { now: () => t, advance: (ms: number) => void (t += ms) };
  };

  it("records each stage, in order, and the wall-clock total", async () => {
    const c = clock();
    const timer = createTimer("Cook", c.now);
    await timer.stage("profile", async () => c.advance(140));
    timer.record("model", 5400);
    await timer.stage("persist", () => c.advance(90));
    expect(timer.stages()).toEqual({ profile: 140, model: 5400, persist: 90 });
    expect(timer.elapsed()).toBe(230); // wall clock, not the sum: stages may overlap
  });

  it("formats the table the way it is read in the terminal, and as a Server-Timing header", () => {
    const c = clock();
    const timer = createTimer("Cook", c.now);
    timer.record("model", 5400);
    c.advance(5500);
    expect(timer.format()).toContain("[Cook timing]");
    expect(timer.format()).toMatch(/model\s+5400 ms/);
    expect(timer.format()).toMatch(/TOTAL\s+5500 ms/);
    expect(timer.header()).toBe("model;dur=5400, total;dur=5500");
  });

  it("times a stage that throws, and rethrows", async () => {
    const c = clock();
    const timer = createTimer("x", c.now);
    await expect(timer.stage("boom", async () => { c.advance(7); throw new Error("no"); })).rejects.toThrow("no");
    expect(timer.stages().boom).toBe(7);
  });

  it("concurrent stages overlap: the total is shorter than their sum", async () => {
    const c = clock();
    const timer = createTimer("x", c.now);
    await Promise.all([timer.stage("a", async () => c.advance(100)), timer.stage("b", async () => {})]);
    expect(timer.elapsed()).toBeLessThanOrEqual(timer.stages().a + timer.stages().b);
  });

  it("tags the table with the browser's request id, so a tap can be followed end to end", () => {
    const c = clock();
    const timer = createTimer("Cook", c.now, "3f9a1c2e");
    expect(timer.format()).toContain("[Cook timing 3f9a1c2e]");
    timer.setRequestId(null);
    expect(timer.format()).toContain("[Cook timing]");
  });

  it("parallel reads are shown beside their stage but never added to the rows — wall clock, not a sum", async () => {
    const c = clock();
    const timer = createTimer("Cook", c.now);
    // Three reads inside one stage take 100, 60 and 80 ms but overlap: the stage is 100 ms.
    await timer.stage("preferences", async () => {
      await Promise.all([
        timer.part("preferences", "profile", async () => c.advance(100)),
        timer.part("preferences", "staples", async () => {}),
        timer.part("preferences", "hints", async () => {}),
      ]);
    });
    timer.record("model", 5000);
    c.advance(5000);
    expect(timer.stages().preferences).toBe(100);
    expect(timer.parts()).toMatchObject({ profile: 100 });
    const table = timer.format();
    expect(table).toMatch(/preferences\s+100 ms\s+\(in parallel: profile 100/);
    // The rows (preferences 100 + model 5000) plus `other` add up to TOTAL; the parts are not counted.
    expect(table).toMatch(/TOTAL\s+5100 ms/);
    expect(table).toMatch(/other\s+0 ms/);
    expect(timer.header()).toContain("profile;dur=100");
  });

  it("anything no stage covers shows up as `other`, so the rows always account for the total", () => {
    const c = clock();
    const timer = createTimer("Cook", c.now);
    timer.record("model", 6200);
    c.advance(6678);
    expect(timer.format()).toMatch(/other\s+478 ms/);
    expect(timer.format()).toMatch(/TOTAL\s+6678 ms/);
  });

  it("reports once, with the label set after the body was parsed", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const timer = createTimer("recommend");
    timer.setLabel("Snack");
    timer.report();
    timer.report();
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toContain("[Snack timing]");
    info.mockRestore();
  });
});
