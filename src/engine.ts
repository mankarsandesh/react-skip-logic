import type {
  Answers,
  Condition,
  Flow,
  Step,
  Transition,
  ValidationIssue,
  ValidationResult,
} from "./types";

/** Use as a `goto` target to finish the flow. */
export const END = "$end";
/** Reference to the running score inside conditions. */
export const SCORE = "$score";

export interface EvalContext {
  answers: Answers;
  score: number;
}

const read = (ref: string, ctx: EvalContext): unknown =>
  ref === SCORE ? ctx.score : ctx.answers[ref];

const toNumber = (v: unknown): number | undefined => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return undefined;
};

/** True unless the value is undefined, null, a blank string or an empty array. */
export function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function compare(
  ref: string,
  target: number,
  ctx: EvalContext,
  op: (a: number, b: number) => boolean,
): boolean {
  const n = toNumber(read(ref, ctx));
  return n !== undefined && op(n, target);
}

/** Evaluate a condition against answers. Unknown operators throw. */
export function evaluate(cond: Condition, ctx: EvalContext): boolean {
  if ("and" in cond) return cond.and.every((c) => evaluate(c, ctx));
  if ("or" in cond) return cond.or.some((c) => evaluate(c, ctx));
  if ("not" in cond) return !evaluate(cond.not, ctx);
  if ("answered" in cond) return isAnswered(read(cond.answered, ctx));
  if ("eq" in cond) return read(cond.eq[0], ctx) === cond.eq[1];
  if ("neq" in cond) return read(cond.neq[0], ctx) !== cond.neq[1];
  if ("gt" in cond) return compare(cond.gt[0], cond.gt[1], ctx, (a, b) => a > b);
  if ("gte" in cond) return compare(cond.gte[0], cond.gte[1], ctx, (a, b) => a >= b);
  if ("lt" in cond) return compare(cond.lt[0], cond.lt[1], ctx, (a, b) => a < b);
  if ("lte" in cond) return compare(cond.lte[0], cond.lte[1], ctx, (a, b) => a <= b);
  if ("in" in cond) return cond.in[1].includes(read(cond.in[0], ctx) as never);
  if ("includes" in cond) {
    const v = read(cond.includes[0], ctx);
    return Array.isArray(v) && v.includes(cond.includes[1]);
  }
  throw new Error(`react-skip-logic: unknown condition ${JSON.stringify(cond)}`);
}

const transitionsOf = (step: Step<unknown>): Transition[] =>
  step.next === undefined ? [] : typeof step.next === "string" ? [{ goto: step.next }] : step.next;

/** Points a single step contributes for its answer. */
export function stepScore(step: Step<unknown>, answer: unknown): number {
  if (!step.score || !isAnswered(answer)) return 0;
  const values = Array.isArray(answer) ? answer : [answer];
  let total = 0;
  for (const v of values) {
    const key = String(v);
    if (key in step.score) total += step.score[key];
    else if ("*" in step.score) total += (toNumber(v) ?? 0) * step.score["*"];
  }
  return total;
}

/** Answers belonging only to the given path (drops answers from abandoned branches). */
export function pickAnswers(path: string[], answers: Answers): Answers {
  const out: Answers = {};
  for (const id of path) if (id in answers) out[id] = answers[id];
  return out;
}

/** Total score for the steps on a path. */
export function scoreFor<M>(flow: Flow<M>, path: string[], answers: Answers): number {
  return path.reduce(
    (sum, id) => sum + (flow.steps[id] ? stepScore(flow.steps[id], answers[id]) : 0),
    0,
  );
}

/**
 * Resolve the step after `stepId`. Returns `null` when the flow is finished
 * (explicit `$end`, no `next`, or no transition matched).
 */
export function resolveNext<M>(
  flow: Flow<M>,
  stepId: string,
  answers: Answers,
  score = 0,
): string | null {
  const step = flow.steps[stepId];
  if (!step) throw new Error(`react-skip-logic: unknown step "${stepId}"`);
  const ctx = { answers, score };
  for (const t of transitionsOf(step)) {
    if (!t.if || evaluate(t.if, ctx)) {
      if (t.goto === END) return null;
      if (!flow.steps[t.goto]) {
        throw new Error(`react-skip-logic: step "${stepId}" points to unknown step "${t.goto}"`);
      }
      return t.goto;
    }
  }
  return null;
}

/**
 * Replay a flow from the start with a set of answers, stopping at the first
 * unanswered required step. Use it on the server to verify a submission and
 * recover the exact path the respondent took.
 */
export function walk<M>(
  flow: Flow<M>,
  answers: Answers,
): { path: string[]; completed: boolean; score: number; answers: Answers } {
  const path: string[] = [];
  let current: string | null = flow.start;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) throw new Error(`react-skip-logic: cycle detected at "${current}"`);
    seen.add(current);
    path.push(current);
    const step: Step<M> = flow.steps[current];
    const scoped = pickAnswers(path, answers);
    if (step.required && !isAnswered(answers[current])) {
      return { path, completed: false, score: scoreFor(flow, path, scoped), answers: scoped };
    }
    current = resolveNext(flow, current, scoped, scoreFor(flow, path, scoped));
  }
  const scoped = pickAnswers(path, answers);
  return { path, completed: true, score: scoreFor(flow, path, scoped), answers: scoped };
}

/**
 * Predict the steps still ahead given current answers (unanswered steps
 * usually take their fallback transition). Used for progress estimates.
 */
export function predictRemaining<M>(flow: Flow<M>, history: string[], answers: Answers): string[] {
  const ahead: string[] = [];
  const seen = new Set(history);
  let path = [...history];
  let current = path[path.length - 1];
  try {
    for (;;) {
      const scoped = pickAnswers(path, answers);
      const next = resolveNext(flow, current, scoped, scoreFor(flow, path, scoped));
      if (!next || seen.has(next)) break;
      seen.add(next);
      ahead.push(next);
      path = [...path, next];
      current = next;
    }
  } catch {
    /* invalid flow: stop predicting */
  }
  return ahead;
}

function collectRefs(cond: Condition, out: string[]): void {
  if ("and" in cond) cond.and.forEach((c) => collectRefs(c, out));
  else if ("or" in cond) cond.or.forEach((c) => collectRefs(c, out));
  else if ("not" in cond) collectRefs(cond.not, out);
  else if ("answered" in cond) out.push(cond.answered);
  else out.push((Object.values(cond)[0] as [string])[0]);
}

/**
 * Static checks for a flow definition. Run it in unit tests, in a flow-builder
 * UI, or before saving a flow someone edited.
 */
export function validateFlow<M>(flow: Flow<M>): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const ids = Object.keys(flow.steps);

  if (!flow.steps[flow.start]) {
    errors.push({ type: "missing-start", message: `Start step "${flow.start}" does not exist.` });
  }

  for (const id of ids) {
    const transitions = transitionsOf(flow.steps[id]);
    for (const t of transitions) {
      if (t.goto !== END && !flow.steps[t.goto]) {
        errors.push({
          type: "unknown-target",
          step: id,
          message: `Step "${id}" points to unknown step "${t.goto}".`,
        });
      }
      if (t.if) {
        const refs: string[] = [];
        collectRefs(t.if, refs);
        for (const r of refs) {
          if (r !== SCORE && !flow.steps[r]) {
            errors.push({
              type: "unknown-reference",
              step: id,
              message: `Step "${id}" has a condition on unknown step "${r}".`,
            });
          }
        }
      }
    }
    if (transitions.length > 0 && transitions.every((t) => t.if)) {
      warnings.push({
        type: "no-fallback",
        step: id,
        message: `Step "${id}" has only conditional transitions; if none match, the flow ends here. Add a { goto } without "if" as a fallback.`,
      });
    }
  }

  // Reachability, ignoring conditions.
  const reachable = new Set<string>();
  const queue = flow.steps[flow.start] ? [flow.start] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const t of transitionsOf(flow.steps[id])) if (flow.steps[t.goto]) queue.push(t.goto);
  }
  for (const id of ids) {
    if (!reachable.has(id)) {
      warnings.push({ type: "unreachable-step", step: id, message: `Step "${id}" can never be reached.` });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Identity helper that gives you type-checking and autocomplete for flows. */
export function defineFlow<M = unknown>(flow: Flow<M>): Flow<M> {
  return flow;
}
