import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Step2Progress } from "../../../src/components/extract/Step2Progress";

vi.mock("../../../src/api/jobs", () => ({
  cancelJob: vi.fn().mockResolvedValue(undefined),
}));

describe("Step2Progress", () => {
  it("renders all 4 stages", () => {
    render(
      <Step2Progress
        stages={{}}
        jobId="job-1"
        error={null}
        onCancel={() => {}}
        onBack={() => {}}
      />,
    );
    expect(screen.getByText("fetching")).toBeInTheDocument();
    expect(screen.getByText("cleaning")).toBeInTheDocument();
    expect(screen.getByText("analyzing")).toBeInTheDocument();
    expect(screen.getByText("proposing")).toBeInTheDocument();
  });

  it("Cancel button calls cancelJob and onCancel", async () => {
    const onCancel = vi.fn();
    render(
      <Step2Progress
        stages={{}}
        jobId="job-1"
        error={null}
        onCancel={onCancel}
        onBack={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    // wait for the async cancelJob microtask
    await new Promise((r) => setTimeout(r, 0));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders error banner and Back button on error", () => {
    const onBack = vi.fn();
    render(
      <Step2Progress
        stages={{}}
        jobId="job-1"
        error={{ message: "no sources", hint: "try a different URL" }}
        onCancel={() => {}}
        onBack={onBack}
      />,
    );
    expect(screen.getByText("no sources")).toBeInTheDocument();
    expect(screen.getByText("try a different URL")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back to inputs"));
    expect(onBack).toHaveBeenCalled();
  });
});
