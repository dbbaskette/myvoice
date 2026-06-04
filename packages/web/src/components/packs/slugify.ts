/** Derive a URL/folder-safe pack id from a display name.
 *
 * Lowercases, turns runs of non-alphanumerics into single hyphens, and forces
 * the result to start with a letter (matching the backend slug pattern
 * `^[a-z][a-z0-9\-_]*$`). Returns "" when no valid slug can be formed — e.g. a
 * name with no letters ("123") — so callers can block submission.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+$/g, "");
}
