import type { PackSummary } from "./packs";

export function exportPackUrl(slug: string): string {
  return `/api/packs/${encodeURIComponent(slug)}/export`;
}

export async function importPack(file: File): Promise<PackSummary> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/packs/import", { method: "POST", body: form });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.detail?.error?.message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json() as Promise<PackSummary>;
}
