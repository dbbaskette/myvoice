import { apiFetch } from "./client";

export async function startRewrite(req: {
  pack: string;
  format?: string;
  samples?: string[];
  draft: string;
  provider: string;
  model: string;
}): Promise<{ job_id: string }> {
  return apiFetch("/api/rewrite", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
