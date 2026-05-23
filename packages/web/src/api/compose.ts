import { apiFetch } from "./client";

export interface LintHit {
  start: number;
  end: number;
  kind: "banished_word" | "banished_phrase" | "rule" | "positive_hit";
  rule_id: string;
  message: string;
}

export async function composePrompt(req: {
  pack: string;
  format?: string;
  samples?: string[];
  draft?: string;
}): Promise<{ prompt: string; char_count: number; samples_used: string[] }> {
  return apiFetch("/api/compose", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function lintText(req: {
  pack: string;
  text: string;
}): Promise<{ violations: LintHit[]; hits: LintHit[] }> {
  return apiFetch("/api/lint", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
