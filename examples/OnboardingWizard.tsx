/**
 * Example 1 — SaaS onboarding wizard.
 * Developers get asked about their stack; teams of 50+ get routed to a
 * "talk to sales" step. Progress is saved so a refresh resumes where they left off.
 */
import { defineFlow, useFlow, type FlowState } from "react-skip-logic";

type Meta = {
  title: string;
  type: "choice" | "multi" | "number" | "text";
  options?: { value: string; label: string }[];
};

export const onboardingFlow = defineFlow<Meta>({
  start: "role",
  steps: {
    role: {
      required: true,
      meta: {
        title: "What best describes you?",
        type: "choice",
        options: [
          { value: "developer", label: "Developer" },
          { value: "designer", label: "Designer" },
          { value: "manager", label: "Manager" },
        ],
      },
      next: [{ if: { eq: ["role", "developer"] }, goto: "stack" }, { goto: "teamSize" }],
    },
    stack: {
      meta: {
        title: "Which tools do you use?",
        type: "multi",
        options: [
          { value: "react", label: "React" },
          { value: "vue", label: "Vue" },
          { value: "node", label: "Node.js" },
        ],
      },
      next: "teamSize",
    },
    teamSize: {
      required: true,
      meta: { title: "How many people are on your team?", type: "number" },
      next: [{ if: { gte: ["teamSize", 50] }, goto: "sales" }, { goto: "$end" }],
    },
    sales: {
      meta: { title: "Want a call with our team? Leave your work email.", type: "text" },
    },
  },
});

const STORAGE_KEY = "onboarding-progress";

function loadSaved(): Partial<FlowState> | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function OnboardingWizard() {
  const flow = useFlow(onboardingFlow, {
    initialState: loadSaved(),
    onChange: (state) => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)),
    onComplete: async ({ answers, path }) => {
      localStorage.removeItem(STORAGE_KEY);
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, path }),
      });
    },
  });

  if (flow.isComplete) return <p>Thanks, you're all set.</p>;

  const { meta, answer, setAnswer } = flow;
  if (!meta) return null;

  return (
    <div className="wizard">
      <progress value={flow.progress} max={1} />
      <h2>{meta.title}</h2>

      {meta.type === "choice" &&
        meta.options!.map((o) => (
          <label key={o.value}>
            <input type="radio" checked={answer === o.value} onChange={() => setAnswer(o.value)} />
            {o.label}
          </label>
        ))}

      {meta.type === "multi" &&
        meta.options!.map((o) => {
          const selected = (answer as string[] | undefined) ?? [];
          return (
            <label key={o.value}>
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={(e) =>
                  setAnswer(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))
                }
              />
              {o.label}
            </label>
          );
        })}

      {meta.type === "number" && (
        <input type="number" value={(answer as number) ?? ""} onChange={(e) => setAnswer(e.target.valueAsNumber)} />
      )}

      {meta.type === "text" && (
        <input type="email" value={(answer as string) ?? ""} onChange={(e) => setAnswer(e.target.value)} />
      )}

      <div className="actions">
        <button onClick={flow.back} disabled={!flow.canGoBack}>Back</button>
        <button onClick={flow.next} disabled={!flow.canGoNext}>
          {flow.isLastStep ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}
