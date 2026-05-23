import type { PackSummary } from "./packs";

export interface PermittedException {
  term: string;
  reason: string;
}

export interface Banished {
  words: string[];
  phrases: string[];
  permitted_exceptions: PermittedException[];
}

export interface Rules {
  no_em_dashes: boolean;
  no_ascii_double_hyphen_between_letters: boolean;
  no_sentence_starters: string[];
}

export interface PopCulture {
  allowed: string[];
  banned: string[];
}

export interface FormatEntry {
  name: string;
  file: string;
  description?: string | null;
}

export interface SampleEntry {
  id: string;
  file: string;
  description?: string | null;
}

export interface BioEntry {
  name: string;
  file: string;
  max_chars?: number | null;
  target_words?: number | null;
  third_person?: boolean;
  description?: string | null;
}

export interface PackInfo {
  slug: string;
  name: string;
  version: string;
  author: string;
  description?: string | null;
  homepage?: string | null;
}

export interface Persona {
  identity: string;
  one_line: string;
}

export interface Manifest {
  spec_version: "1.0";
  pack: PackInfo;
  persona: Persona;
  banished: Banished;
  rules: Rules;
  pop_culture: PopCulture;
  formats: FormatEntry[];
  samples: SampleEntry[];
  bios: BioEntry[];
}

export class ManifestValidationError extends Error {
  constructor(
    public readonly fieldErrors: Record<string, string>,
    message: string,
  ) {
    super(message);
    this.name = "ManifestValidationError";
  }
}

export async function putManifest(slug: string, manifest: Manifest): Promise<PackSummary> {
  const response = await fetch(`/api/packs/${encodeURIComponent(slug)}/manifest`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(manifest),
  });

  if (response.status === 422) {
    const body = (await response.json()) as {
      detail?: { errors?: Array<{ path: string; message: string }> };
    };
    const errList = body?.detail?.errors;
    if (errList) {
      const fieldErrors: Record<string, string> = {};
      for (const e of errList) fieldErrors[e.path] = e.message;
      throw new ManifestValidationError(
        fieldErrors,
        `Validation failed: ${errList.length} error(s).`,
      );
    }
    throw new Error(`HTTP 422 on /api/packs/${slug}/manifest`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on /api/packs/${slug}/manifest`);
  }

  return (await response.json()) as PackSummary;
}
