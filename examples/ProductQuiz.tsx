/**
 * Example 2 — Scored quiz / product recommender.
 * Each answer adds points; the final step depends on the total ($score).
 */
import { defineFlow, useFlow } from "react-skip-logic";

type Meta = { question: string; options?: { value: string; label: string }[]; result?: string };

const quiz = defineFlow<Meta>({
  start: "frequency",
  steps: {
    frequency: {
      meta: {
        question: "How often do you send surveys?",
        options: [
          { value: "rarely", label: "A few times a year" },
          { value: "monthly", label: "Monthly" },
          { value: "weekly", label: "Every week" },
        ],
      },
      score: { rarely: 0, monthly: 1, weekly: 2 },
      next: "audience",
    },
    audience: {
      meta: {
        question: "Who answers them?",
        options: [
          { value: "team", label: "My team" },
          { value: "customers", label: "Customers" },
          { value: "both", label: "Both" },
        ],
      },
      score: { team: 0, customers: 1, both: 2 },
      next: [
        { if: { gte: ["$score", 3] }, goto: "pro" },
        { if: { gte: ["$score", 1] }, goto: "starter" },
        { goto: "free" },
      ],
    },
    free: { meta: { question: "", result: "The Free plan covers you." } },
    starter: { meta: { question: "", result: "Starter is the best fit." } },
    pro: { meta: { question: "", result: "Go with Pro — you'll want automation and branching." } },
  },
});

export function ProductQuiz() {
  const q = useFlow(quiz);
  const meta = q.meta!;

  if (meta.result) {
    return (
      <div>
        <h2>{meta.result}</h2>
        <p>Your score: {q.score}</p>
        <button onClick={q.reset}>Start over</button>
      </div>
    );
  }

  return (
    <div>
      <h2>{meta.question}</h2>
      {meta.options!.map((o) => (
        // submit() saves the answer and moves on in one click
        <button key={o.value} onClick={() => q.submit(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
