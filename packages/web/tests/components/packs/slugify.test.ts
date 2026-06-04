import { describe, expect, it } from "vitest";

import { slugify } from "../../../src/components/packs/slugify";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Alice Chen")).toBe("alice-chen");
  });

  it("collapses runs of non-alphanumerics into one hyphen", () => {
    expect(slugify("The  Builder — Who Gets It")).toBe("the-builder-who-gets-it");
  });

  it("strips leading non-letters so the slug starts with a letter", () => {
    expect(slugify("123 Co")).toBe("co");
    expect(slugify("_private")).toBe("private");
  });

  it("trims trailing hyphens", () => {
    expect(slugify("Hello!!!")).toBe("hello");
    expect(slugify("  spaced  ")).toBe("spaced");
  });

  it("returns empty string when no valid slug can be formed", () => {
    expect(slugify("")).toBe("");
    expect(slugify("123")).toBe("");
    expect(slugify("---")).toBe("");
  });
});
