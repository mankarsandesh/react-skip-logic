import { defineFlow } from "../src";

export const onboarding = defineFlow({
  start: "role",
  steps: {
    role: {
      required: true,
      next: [
        { if: { eq: ["role", "developer"] }, goto: "stack" },
        { goto: "teamSize" },
      ],
    },
    stack: { next: "teamSize" },
    teamSize: {
      next: [
        { if: { gte: ["teamSize", 50] }, goto: "enterprise" },
        { goto: "$end" },
      ],
    },
    enterprise: {},
  },
});

export const quiz = defineFlow({
  start: "q1",
  steps: {
    q1: { score: { a: 1, b: 0 }, next: "q2" },
    q2: { score: { a: 1, b: 0 }, next: "q3" },
    q3: { score: { a: 0, b: 1, c: 1 }, next: [{ if: { gte: ["$score", 2] }, goto: "pass" }, { goto: "fail" }] },
    pass: {},
    fail: {},
  },
});
