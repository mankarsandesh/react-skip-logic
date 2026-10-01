import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isAnswered,
  pickAnswers,
  predictRemaining,
  resolveNext,
  scoreFor,
  validateFlow,
} from "./engine";
import type { Answers, Flow, FlowState, Step } from "./types";

export interface FlowResult {
  /** Answers on the path actually taken (abandoned branches removed). */
  answers: Answers;
  /** Step ids in the order they were visited. */
  path: string[];
  score: number;
}

export interface UseFlowOptions {
  /** Resume a saved session (e.g. from localStorage or your API). */
  initialState?: Partial<FlowState>;
  /** Called once when the last step is passed. */
  onComplete?: (result: FlowResult) => void;
  /** Called on every state change; persist `state` here to support resume. */
  onChange?: (state: FlowState) => void;
}

export interface UseFlowReturn<M> {
  /** Id of the step to render. */
  stepId: string;
  step: Step<M>;
  /** Shortcut for `step.meta`. */
  meta: M | undefined;
  /** Answer for the current step. */
  answer: unknown;
  /** All answers, including ones from branches the user backed out of. */
  answers: Answers;
  /** Set the answer for the current step. */
  setAnswer: (value: unknown) => void;
  /** Set the answer for any step. */
  setAnswerFor: (stepId: string, value: unknown) => void;
  /** Move forward. Returns false if blocked by a required step. */
  next: () => boolean;
  /** Answer the current step and move forward in one go (one-click questions). */
  submit: (value: unknown) => boolean;
  back: () => void;
  reset: () => void;
  canGoBack: boolean;
  /** False when the current step is required and unanswered. */
  canGoNext: boolean;
  /** True when no further steps are predicted from current answers. */
  isLastStep: boolean;
  isComplete: boolean;
  /** 0 – 1, based on the path taken plus the predicted remaining steps. */
  progress: number;
  score: number;
  history: string[];
  /** Serialisable state for persistence. */
  state: FlowState;
}

const initial = <M,>(flow: Flow<M>, init?: Partial<FlowState>): FlowState => ({
  history: init?.history?.length ? init.history : [flow.start],
  answers: init?.answers ?? {},
  completed: init?.completed ?? false,
});

export function useFlow<M = unknown>(flow: Flow<M>, options: UseFlowOptions = {}): UseFlowReturn<M> {
  const [state, setState] = useState<FlowState>(() => initial(flow, options.initialState));
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useMemo(() => {
    const { errors } = validateFlow(flow);
    if (errors.length) {
      // eslint-disable-next-line no-console
      console.error("react-skip-logic: invalid flow\n" + errors.map((e) => " - " + e.message).join("\n"));
    }
  }, [flow]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    optionsRef.current.onChange?.(state);
  }, [state]);

  const { history, answers, completed } = state;
  const stepId = history[history.length - 1];
  const step = flow.steps[stepId];
  const scoped = useMemo(() => pickAnswers(history, answers), [history, answers]);
  const score = useMemo(() => scoreFor(flow, history, scoped), [flow, history, scoped]);
  const remaining = useMemo(
    () => (completed ? [] : predictRemaining(flow, history, answers)),
    [flow, history, answers, completed],
  );

  const canGoNext = !completed && !(step?.required && !isAnswered(answers[stepId]));

  const setAnswerFor = useCallback((id: string, value: unknown) => {
    setState((s) => ({ ...s, answers: { ...s.answers, [id]: value } }));
  }, []);

  const setAnswer = useCallback((value: unknown) => setAnswerFor(stepId, value), [setAnswerFor, stepId]);

  const advance = useCallback(
    (all: Answers): boolean => {
      if (completed || (step?.required && !isAnswered(all[stepId]))) return false;
      const pathAnswers = pickAnswers(history, all);
      const pathScore = scoreFor(flow, history, pathAnswers);
      const target = resolveNext(flow, stepId, pathAnswers, pathScore);
      if (target === null) {
        setState((s) => ({ ...s, answers: all, completed: true }));
        optionsRef.current.onComplete?.({ answers: pathAnswers, path: history, score: pathScore });
        return true;
      }
      setState((s) => ({ ...s, answers: all, history: [...s.history, target] }));
      return true;
    },
    [completed, step, stepId, history, flow],
  );

  const next = useCallback((): boolean => advance(answers), [advance, answers]);

  const submit = useCallback(
    (value: unknown): boolean => advance({ ...answers, [stepId]: value }),
    [advance, answers, stepId],
  );

  const back = useCallback(() => {
    setState((s) => {
      if (s.completed) return { ...s, completed: false };
      if (s.history.length <= 1) return s;
      return { ...s, history: s.history.slice(0, -1) };
    });
  }, []);

  const reset = useCallback(() => setState(initial(flow)), [flow]);

  return {
    stepId,
    step,
    meta: step?.meta,
    answer: answers[stepId],
    answers,
    setAnswer,
    setAnswerFor,
    next,
    submit,
    back,
    reset,
    canGoBack: completed || history.length > 1,
    canGoNext,
    isLastStep: remaining.length === 0,
    isComplete: completed,
    progress: completed ? 1 : (history.length - 1) / (history.length + remaining.length),
    score,
    history,
    state,
  };
}
