import { describe, expect, it } from "vitest";
import { evaluate, resolveNext, stepScore, validateFlow, walk, predictRemaining, defineFlow } from "../src/core";
import { onboarding, quiz } from "./fixtures";

const ctx = (answers: Record<string, unknown>, score = 0) => ({ answers, score });

describe("evaluate", () => {
  it("handles comparison operators", () => {
    expect(evaluate({ eq: ["a", 1] }, ctx({ a: 1 }))).toBe(true);
    expect(evaluate({ neq: ["a", 1] }, ctx({ a: 2 }))).toBe(true);
    expect(evaluate({ gt: ["a", 5] }, ctx({ a: "10" }))).toBe(true);
    expect(evaluate({ lte: ["a", 5] }, ctx({}))).toBe(false);
    expect(evaluate({ in: ["a", ["x", "y"]] }, ctx({ a: "y" }))).toBe(true);
    expect(evaluate({ includes: ["a", "x"] }, ctx({ a: ["x", "z"] }))).toBe(true);
    expect(evaluate({ includes: ["a", "x"] }, ctx({ a: "x" }))).toBe(false);
    expect(evaluate({ answered: "a" }, ctx({ a: "  " }))).toBe(false);
    expect(evaluate({ gte: ["$score", 3] }, ctx({}, 3))).toBe(true);
  });

  it("handles boolean logic", () => {
    const c = { and: [{ eq: ["a", 1] }, { or: [{ eq: ["b", 1] }, { not: { answered: "c" } }] }] } as const;
    expect(evaluate(c as never, ctx({ a: 1, b: 0 }))).toBe(true);
    expect(evaluate(c as never, ctx({ a: 1, b: 0, c: "x" }))).toBe(false);
  });

  it("throws on unknown operators", () => {
    expect(() => evaluate({ nope: 1 } as never, ctx({}))).toThrow(/unknown condition/);
  });
});

describe("resolveNext", () => {
  it("follows first matching transition", () => {
    expect(resolveNext(onboarding, "role", { role: "developer" })).toBe("stack");
    expect(resolveNext(onboarding, "role", { role: "designer" })).toBe("teamSize");
  });
  it("returns null at the end", () => {
    expect(resolveNext(onboarding, "teamSize", { teamSize: 5 })).toBeNull();
    expect(resolveNext(onboarding, "enterprise", {})).toBeNull();
  });
});

describe("scoring", () => {
  it("sums multi-select and wildcard scores", () => {
    expect(stepScore({ score: { a: 2, b: 3 } }, ["a", "b"])).toBe(5);
    expect(stepScore({ score: { "*": 2 } }, 4)).toBe(8);
    expect(stepScore({ score: { a: 1 } }, undefined)).toBe(0);
  });
  it("branches on $score", () => {
    expect(walk(quiz, { q1: "a", q2: "a", q3: "a" }).path.at(-1)).toBe("pass");
    expect(walk(quiz, { q1: "a", q2: "b", q3: "a" }).path.at(-1)).toBe("fail");
    expect(walk(quiz, { q1: "a", q2: "b", q3: "c" }).score).toBe(2);
  });
});

describe("walk", () => {
  it("replays a submission and drops answers from other branches", () => {
    const r = walk(onboarding, { role: "designer", stack: "vue", teamSize: 80 });
    expect(r.path).toEqual(["role", "teamSize", "enterprise"]);
    expect(r.completed).toBe(true);
    expect(r.answers).toEqual({ role: "designer", teamSize: 80 });
  });
  it("stops at a missing required answer", () => {
    expect(walk(onboarding, {})).toMatchObject({ path: ["role"], completed: false });
  });
  it("detects cycles", () => {
    const loop = defineFlow({ start: "a", steps: { a: { next: "b" }, b: { next: "a" } } });
    expect(() => walk(loop, {})).toThrow(/cycle/);
  });
});

describe("predictRemaining", () => {
  it("predicts the default path", () => {
    expect(predictRemaining(onboarding, ["role"], {})).toEqual(["teamSize"]);
    expect(predictRemaining(onboarding, ["role"], { role: "developer" })).toEqual(["stack", "teamSize"]);
  });
});

describe("validateFlow", () => {
  it("accepts a good flow", () => {
    expect(validateFlow(onboarding)).toMatchObject({ valid: true, errors: [], warnings: [] });
  });
  it("reports errors and warnings", () => {
    const bad = defineFlow({
      start: "missing",
      steps: {
        a: { next: [{ if: { eq: ["ghost", 1] }, goto: "nowhere" }] },
        orphan: {},
      },
    });
    const r = validateFlow(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.type).sort()).toEqual(["missing-start", "unknown-reference", "unknown-target"]);
    expect(r.warnings.map((w) => w.type)).toContain("no-fallback");
    expect(r.warnings.filter((w) => w.type === "unreachable-step")).toHaveLength(2);
  });
});
