/** A value an answer can be compared against. */
export type Primitive = string | number | boolean | null;

/** Collected answers, keyed by step id. */
export type Answers = Record<string, unknown>;

/**
 * A JSON-serialisable condition. The first element of each tuple is a
 * reference: a step id (its answer) or the special `$score`.
 */
export type Condition =
  | { eq: [ref: string, value: Primitive] }
  | { neq: [ref: string, value: Primitive] }
  | { gt: [ref: string, value: number] }
  | { gte: [ref: string, value: number] }
  | { lt: [ref: string, value: number] }
  | { lte: [ref: string, value: number] }
  /** Answer is one of the listed values. */
  | { in: [ref: string, values: Primitive[]] }
  /** Answer is an array (multi-select) that contains the value. */
  | { includes: [ref: string, value: Primitive] }
  /** Answer has been given (not undefined / null / "" / []). */
  | { answered: string }
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition };

/** A possible next step. Transitions are checked in order; the first match wins. */
export interface Transition {
  if?: Condition;
  /** Target step id, or `END` ("$end") to finish the flow. */
  goto: string;
}

export interface Step<TMeta = unknown> {
  /**
   * Where to go after this step. A string is an unconditional jump.
   * Omit to make this a final step.
   */
  next?: string | Transition[];
  /** If true, `next()` is blocked until this step has an answer. */
  required?: boolean;
  /**
   * Points awarded for an answer, e.g. `{ yes: 2, no: 0 }`.
   * For multi-select answers, points for every selected value are summed.
   * Numeric answers can use `{ "*": 1 }` to add the answer itself × multiplier.
   */
  score?: Record<string, number>;
  /** Anything your UI needs: title, input type, options… */
  meta?: TMeta;
}

export interface Flow<TMeta = unknown> {
  start: string;
  steps: Record<string, Step<TMeta>>;
}

export interface FlowState {
  /** Visited step ids, current step last. */
  history: string[];
  answers: Answers;
  completed: boolean;
}

export interface ValidationIssue {
  type:
    | "missing-start"
    | "unknown-target"
    | "unreachable-step"
    | "no-fallback"
    | "unknown-reference";
  step?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
