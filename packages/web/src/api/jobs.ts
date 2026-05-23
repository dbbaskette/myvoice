import { apiFetch } from "./client";

export async function cancelJob(jobId: string): Promise<void> {
  await apiFetch(`/api/jobs/${jobId}`, { method: "DELETE" });
}

export function jobEventsUrl(jobId: string): string {
  return `/api/jobs/${jobId}/events`;
}
