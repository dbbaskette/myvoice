import { apiFetch } from "./client";

/** The shared AI-tells layer — universal rules merged into every pack. */
export interface AiTells {
  words: string[];
  phrases: string[];
  sentence_starters: string[];
  patterns: string;
}

export async function getAiTells(init?: RequestInit): Promise<AiTells> {
  return apiFetch<AiTells>("/api/ai-tells", init);
}
