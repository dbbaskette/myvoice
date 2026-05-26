import { apiFetch } from "./client";
import type { PackSummary } from "./packs";

export interface ProposedSample {
  excerpt: string;
  source_location: string;
  why: string;
  rank: number;
}

export interface BanishedWord {
  word: string;
  frequency: number;
}
export interface BanishedPhrase {
  phrase: string;
  frequency: number;
}
export interface PermittedExceptionProposal {
  term: string;
  reason: string;
}

export interface AnalysisResult {
  persona_identity: string;
  persona_one_line: string;
  banished_words: BanishedWord[];
  banished_phrases: BanishedPhrase[];
  permitted_exceptions: PermittedExceptionProposal[];
  style_guide_markdown: string;
  samples: ProposedSample[];
  pop_culture_allowed: string[];
  pop_culture_banned: string[];
}

export interface ExtractSource {
  kind: "url" | "file";
  location: string;
  bytes: number;
  word_count: number;
  succeeded: boolean;
  error: string | null;
}

export interface PackProposal {
  analysis: AnalysisResult;
  sources: ExtractSource[];
  model: string;
  provider: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  elapsed_seconds: number;
}

export interface UploadFile {
  name: string;
  content_b64: string;
  mime: string;
}

export interface ExtractRequest {
  urls: string[];
  files: UploadFile[];
  pack_meta: { slug?: string; name?: string; author?: string };
  provider: "anthropic" | "openai" | "google";
  model: string;
}

export async function startExtract(req: ExtractRequest): Promise<{ job_id: string }> {
  return apiFetch("/api/extract", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export interface FromAnalysisRequest {
  slug: string;
  name: string;
  author: string;
  persona_identity: string;
  persona_one_line: string;
  version?: string;
  description?: string;
  proposal: AnalysisResult;
  selected_sample_indexes: number[];
}

export async function saveFromAnalysis(req: FromAnalysisRequest): Promise<PackSummary> {
  return apiFetch("/api/packs/from-analysis", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
