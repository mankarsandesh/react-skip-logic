import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFlow } from "../src";
import { onboarding, quiz } from "./fixtures";

describe("useFlow", () => {
  it("walks a branching flow forward and back", () => {
    const { result } = renderHook(() => useFlow(onboarding));
    expect(result.current.stepId).toBe("role");
    expect(result.current.canGoNext).toBe(false); // required

    act(() => { expect(result.current.next()).toBe(false); });
    act(() => result.current.setAnswer("developer"));
    act(() => { result.current.next(); });
    expect(result.current.stepId).toBe("stack");
    expect(result.current.progress).toBeCloseTo(1 / 3);

    act(() => result.current.back());
    act(() => result.current.setAnswer("designer"));
    act(() => { result.current.next(); });
    expect(result.current.stepId).toBe("teamSize");
    expect(result.current.history).toEqual(["role", "teamSize"]);
  });

  it("completes and reports only path answers", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useFlow(onboarding, { onComplete }));
    act(() => result.current.setAnswer("developer"));
    act(() => { result.current.next(); });
    act(() => result.current.setAnswer("react"));
    act(() => { result.current.next(); });
    act(() => result.current.setAnswer(10));
    expect(result.current.isLastStep).toBe(true);
    act(() => { result.current.next(); });

    expect(result.current.isComplete).toBe(true);
    expect(result.current.progress).toBe(1);
    expect(onComplete).toHaveBeenCalledWith({
      answers: { role: "developer", stack: "react", teamSize: 10 },
      path: ["role", "stack", "teamSize"],
      score: 0,
    });

    act(() => result.current.back());
    expect(result.current.isComplete).toBe(false);
    expect(result.current.stepId).toBe("teamSize");
  });

  it("tracks score and resumes from saved state", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useFlow(quiz, { initialState: { history: ["q1", "q2"], answers: { q1: "a" } }, onChange }),
    );
    expect(result.current.stepId).toBe("q2");
    expect(result.current.score).toBe(1);
    act(() => result.current.setAnswer("a"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(result.current.score).toBe(2);

    act(() => result.current.reset());
    expect(result.current.history).toEqual(["q1"]);
  });
});

describe("submit", () => {
  it("answers and advances in one call, using the new answer for branching", () => {
    const { result } = renderHook(() => useFlow(quiz));
    act(() => { result.current.submit("a"); });
    act(() => { result.current.submit("a"); });
    act(() => { result.current.submit("b"); });
    expect(result.current.stepId).toBe("pass");
    expect(result.current.score).toBe(3);
  });
});
