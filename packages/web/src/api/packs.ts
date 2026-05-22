import { apiFetch } from "./client";

export interface PackSummary {
  slug: string;
  name: string;
  version: string;
  valid: boolean;
  error_count: number;
}

export interface PackDetail extends PackSummary {
  root_path: string;
  errors: { path: string; message: string }[];
  author?: string;
  description?: string | null;
  persona?: { identity: string; one_line: string };
  counts?: {
    banished_words: number;
    banished_phrases: number;
    permitted_exceptions: number;
    formats: number;
    samples: number;
    bios: number;
  };
}

export async function listPacks(init?: RequestInit): Promise<PackSummary[]> {
  return apiFetch<PackSummary[]>("/api/packs", init);
}

export async function getPack(slug: string, init?: RequestInit): Promise<PackDetail> {
  return apiFetch<PackDetail>(`/api/packs/${encodeURIComponent(slug)}`, init);
}

export async function getManifest(
  slug: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(`/api/packs/${encodeURIComponent(slug)}/manifest`, init);
}

export async function getPackFile(slug: string, path: string, init?: RequestInit): Promise<string> {
  // Bypass apiFetch's JSON expectation — file endpoint returns text/plain.
  const response = await fetch(`/api/packs/${encodeURIComponent(slug)}/files/${path}`, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on file ${path}`);
  }
  return response.text();
}
