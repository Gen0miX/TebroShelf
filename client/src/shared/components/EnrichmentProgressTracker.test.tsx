import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EnrichmentProgressTracker } from "./EnrichmentProgressTracker";

// Mock the useEnrichmentProgress hook
vi.mock("@/shared/providers/EnrichmentProgressContext", () => ({
  useEnrichmentProgress: vi.fn(),
}));

// Import after mocking
import { useEnrichmentProgress } from "@/shared/providers/EnrichmentProgressContext";

const mockUseEnrichmentProgress = vi.mocked(useEnrichmentProgress);

describe("EnrichmentProgressTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render nothing when no active enrichments", () => {
    mockUseEnrichmentProgress.mockReturnValue({
      activeEnrichments: [],
      hasActiveEnrichments: false,
      updateEnrichment: vi.fn(),
      removeEnrichment: vi.fn(),
    });

    const { container } = render(<EnrichmentProgressTracker />);
    expect(container.firstChild).toBeNull();
  });

  it("should render enrichment items when active", () => {
    mockUseEnrichmentProgress.mockReturnValue({
      activeEnrichments: [
        {
          bookId: 1,
          currentStep: "openlibrary-search-started",
          status: "in-progress",
          startedAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:01Z",
        },
      ],
      hasActiveEnrichments: true,
      updateEnrichment: vi.fn(),
      removeEnrichment: vi.fn(),
    });

    render(<EnrichmentProgressTracker />);

    expect(screen.getByText("Enrichment Progress")).toBeInTheDocument();
    expect(screen.getByText("Book #1")).toBeInTheDocument();
    expect(screen.getByText("Searching OpenLibrary...")).toBeInTheDocument();
  });

  it("should show spinner for in-progress enrichments", () => {
    mockUseEnrichmentProgress.mockReturnValue({
      activeEnrichments: [
        {
          bookId: 1,
          currentStep: "started",
          status: "in-progress",
          startedAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:01Z",
        },
      ],
      hasActiveEnrichments: true,
      updateEnrichment: vi.fn(),
      removeEnrichment: vi.fn(),
    });

    render(<EnrichmentProgressTracker />);

    // Check for spinner animation class
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("should show checkmark for completed enrichments", () => {
    mockUseEnrichmentProgress.mockReturnValue({
      activeEnrichments: [
        {
          bookId: 1,
          currentStep: "completed",
          status: "completed",
          source: "openlibrary",
          startedAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:05Z",
        },
      ],
      hasActiveEnrichments: true,
      updateEnrichment: vi.fn(),
      removeEnrichment: vi.fn(),
    });

    render(<EnrichmentProgressTracker />);

    // Checkmark character
    expect(screen.getByText("\u2713")).toBeInTheDocument();
    expect(screen.getByText(/openlibrary/)).toBeInTheDocument();
  });

  it("should show X for failed enrichments", () => {
    mockUseEnrichmentProgress.mockReturnValue({
      activeEnrichments: [
        {
          bookId: 1,
          currentStep: "enrichment-failed",
          status: "failed",
          reason: "No match found",
          startedAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:05Z",
        },
      ],
      hasActiveEnrichments: true,
      updateEnrichment: vi.fn(),
      removeEnrichment: vi.fn(),
    });

    render(<EnrichmentProgressTracker />);

    // X character
    expect(screen.getByText("\u2717")).toBeInTheDocument();
    expect(screen.getByText(/No match found/)).toBeInTheDocument();
  });

  it("should render multiple enrichments", () => {
    mockUseEnrichmentProgress.mockReturnValue({
      activeEnrichments: [
        {
          bookId: 1,
          currentStep: "openlibrary-search-started",
          status: "in-progress",
          startedAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:01Z",
        },
        {
          bookId: 2,
          currentStep: "googlebooks-match-found",
          status: "in-progress",
          startedAt: "2026-01-01T00:00:02Z",
          updatedAt: "2026-01-01T00:00:03Z",
        },
      ],
      hasActiveEnrichments: true,
      updateEnrichment: vi.fn(),
      removeEnrichment: vi.fn(),
    });

    render(<EnrichmentProgressTracker />);

    expect(screen.getByText("Book #1")).toBeInTheDocument();
    expect(screen.getByText("Book #2")).toBeInTheDocument();
    expect(screen.getByText("Searching OpenLibrary...")).toBeInTheDocument();
    expect(screen.getByText("Found match on Google Books")).toBeInTheDocument();
  });

  it("should display step labels from getStepLabel", () => {
    mockUseEnrichmentProgress.mockReturnValue({
      activeEnrichments: [
        {
          bookId: 1,
          currentStep: "metadata-extracted",
          status: "in-progress",
          startedAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:01Z",
        },
      ],
      hasActiveEnrichments: true,
      updateEnrichment: vi.fn(),
      removeEnrichment: vi.fn(),
    });

    render(<EnrichmentProgressTracker />);

    expect(screen.getByText("Metadata extracted")).toBeInTheDocument();
  });
});
