import { apiFetch } from "./client";

export async function saveSample(
  slug: string,
  body: { excerpt: string; source_url?: string; note?: string },
): Promise<{ id: string; file: string }> {
  return apiFetch(`/api/packs/${slug}/samples`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
