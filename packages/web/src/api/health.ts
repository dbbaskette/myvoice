import { apiFetch } from "./client";

export interface Health {
  status: "ok";
  version: string;
}

export async function getHealth(): Promise<Health> {
  return apiFetch<Health>("/api/health");
}
