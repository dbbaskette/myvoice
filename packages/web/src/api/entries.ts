import { apiFetch } from "./client";

export interface CreateFormatRequest {
  name: string;
  description?: string;
  content?: string;
}

export interface CreateBioRequest {
  name: string;
  description?: string;
  max_chars?: number;
  target_words?: number;
  third_person?: boolean;
  content?: string;
}

export interface CreateSampleRequest {
  excerpt: string;
  source_url?: string;
  note?: string;
}

export type EntryKind = "formats" | "samples" | "bios";

export async function createFormat(
  slug: string,
  req: CreateFormatRequest,
): Promise<{ name: string; file: string }> {
  return apiFetch(`/api/packs/${encodeURIComponent(slug)}/formats`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function createBio(
  slug: string,
  req: CreateBioRequest,
): Promise<{ name: string; file: string }> {
  return apiFetch(`/api/packs/${encodeURIComponent(slug)}/bios`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// createSample re-uses the existing /api/packs/{slug}/samples endpoint from Phase 4.
// Re-exported here for one-stop entry creation.
export async function createSample(
  slug: string,
  req: CreateSampleRequest,
): Promise<{ id: string; file: string }> {
  return apiFetch(`/api/packs/${encodeURIComponent(slug)}/samples`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function deleteEntry(slug: string, kind: EntryKind, ident: string): Promise<void> {
  const res = await fetch(
    `/api/packs/${encodeURIComponent(slug)}/${kind}/${encodeURIComponent(ident)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`HTTP ${res.status} deleting ${kind}/${ident}`);
  }
}
