# react-skip-logic

Headless branching ("skip logic") for multi-step forms, surveys, quizzes and onboarding flows in React.

Describe the flow as **plain JSON**, get a hook that tells you which step to render. Bring your own UI — shadcn, MUI, Tailwind, React Hook Form, anything.

- ~3.5 kB gzipped, zero dependencies (React is a peer dependency)
- Flows are JSON, so you can store them in a database and let non-developers edit them
- Conditions: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `includes`, `answered`, `and`, `or`, `not`
- Scoring with `$score` for quizzes and recommenders
- Back button that remembers answers, and drops answers from abandoned branches on submit
- Progress that adapts to the path the user is actually on
- Save and resume (`initialState` + `onChange`)
- A React-free `core` entry for verifying submissions on the server
- `validateFlow()` finds broken links, unreachable steps and dead ends

## Install

```bash
npm install react-skip-logic
```

## Quick start

```tsx
import { defineFlow, useFlow } from "react-skip-logic";

const flow = defineFlow({
  start: "role",
  steps: {
    role: {
      required: true,
      next: [
        { if: { eq: ["role", "developer"] }, goto: "stack" },
        { goto: "teamSize" },               // fallback
      ],
    },
    stack: { next: "teamSize" },
    teamSize: {
      next: [
        { if: { gte: ["teamSize", 50] }, goto: "sales" },
        { goto: "$end" },
      ],
    },
    sales: {},                               // no `next` = final step
  },
});

function Onboarding() {
  const { stepId, answer, setAnswer, next, back, canGoNext, canGoBack, progress, isComplete } =
    useFlow(flow, { onComplete: ({ answers }) => save(answers) });

  if (isComplete) return <p>Done!</p>;

  return (
    <>
      <progress value={progress} max={1} />
      {stepId === "role" && <RolePicker value={answer} onChange={setAnswer} />}
      {/* ...render other steps... */}
      <button onClick={back} disabled={!canGoBack}>Back</button>
      <button onClick={next} disabled={!canGoNext}>Next</button>
    </>
  );
}
```

Put labels, input types and options in each step's `meta` and render generically — see [`examples/OnboardingWizard.tsx`](examples/OnboardingWizard.tsx).

## Flow format

```ts
interface Flow<TMeta> {
  start: string;
  steps: Record<string, {
    next?: string | { if?: Condition; goto: string }[]; // first match wins; "$end" finishes
    required?: boolean;
    score?: Record<string, number>;                      // e.g. { yes: 2, no: 0 }, or { "*": 1 } for numbers
    meta?: TMeta;                                        // anything your UI needs
  }>;
}
```

The answer for a step is stored under the step's id, and conditions refer to answers by step id.

### Conditions

| Condition | True when |
|---|---|
| `{ eq: ["q1", "yes"] }` | answer equals value |
| `{ neq: ["q1", "yes"] }` | answer does not equal value |
| `{ gt / gte / lt / lte: ["age", 18] }` | numeric comparison (numeric strings work) |
| `{ in: ["country", ["UK", "IE"]] }` | answer is one of the values |
| `{ includes: ["tools", "react"] }` | multi-select answer contains value |
| `{ answered: "email" }` | answer is not empty |
| `{ and: [...] }`, `{ or: [...] }`, `{ not: {...} }` | combine conditions |

Use `"$score"` as the reference to branch on the running total: `{ gte: ["$score", 10] }`.

## `useFlow(flow, options?)`

Options: `initialState`, `onChange(state)`, `onComplete({ answers, path, score })`.

| Returns | |
|---|---|
| `stepId`, `step`, `meta` | the current step |
| `answer`, `setAnswer(v)` | current step's answer |
| `answers`, `setAnswerFor(id, v)` | all answers |
| `next()` | go forward (returns `false` if a required step is empty) |
| `submit(v)` | answer and go forward in one call — for one-click questions |
| `back()`, `reset()` | |
| `canGoNext`, `canGoBack`, `isLastStep`, `isComplete` | for buttons |
| `progress` | 0–1, adapts to the branch taken |
| `score`, `history`, `state` | `state` is serialisable for save/resume |

### Save and resume

```tsx
useFlow(flow, {
  initialState: JSON.parse(localStorage.getItem("progress") ?? "null") ?? undefined,
  onChange: (state) => localStorage.setItem("progress", JSON.stringify(state)),
});
```

## Server-side and tooling (`react-skip-logic/core`)

No React import, so it runs in Node, edge functions and workers.

```ts
import { walk, validateFlow } from "react-skip-logic/core";

// Replay a submission to get the real path, score and cleaned answers
const { completed, path, score, answers } = walk(flow, req.body.answers);

// Check a flow someone edited in your admin panel
const { valid, errors, warnings } = validateFlow(flowJson);
```

Also exported: `evaluate`, `resolveNext`, `predictRemaining`, `stepScore`, `END`, `SCORE`.

## Examples

- [`OnboardingWizard.tsx`](examples/OnboardingWizard.tsx) — SaaS onboarding with branching, multi-select and save/resume
- [`ProductQuiz.tsx`](examples/ProductQuiz.tsx) — scored quiz that recommends a plan
- [`server-verify.ts`](examples/server-verify.ts) — verify a submission in a Next.js route

## License

MIT
