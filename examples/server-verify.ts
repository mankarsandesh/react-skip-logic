/**
 * Example 3 — Verify a submission on the server (Node / Next.js route / Express).
 * Never trust the path the browser sends: replay the answers through the same
 * flow definition to get the real path, the score, and only the answers that
 * belong to that path.
 */
import { walk, validateFlow } from "react-skip-logic/core"; // no React import
import { onboardingFlow } from "./OnboardingWizard";

// e.g. app/api/onboarding/route.ts in Next.js
export async function POST(req: Request) {
  const { answers } = await req.json();

  const result = walk(onboardingFlow, answers);
  if (!result.completed) {
    return Response.json({ error: "Incomplete submission", stoppedAt: result.path.at(-1) }, { status: 400 });
  }

  // result.answers has answers from abandoned branches stripped out
  // await db.insert("onboarding", { answers: result.answers, path: result.path });
  return Response.json({ ok: true, path: result.path });
}

// In a CMS / admin panel where people edit flows as JSON, check before saving:
export function canSave(flowJson: unknown) {
  const { valid, errors, warnings } = validateFlow(flowJson as never);
  return { valid, problems: [...errors, ...warnings].map((i) => i.message) };
}
