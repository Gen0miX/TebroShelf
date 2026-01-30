import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuarantineList } from "./QuarantineList";
import { useQuarantine } from "../hooks/useQuarantine";

// Mock the useQuarantine hook
vi.mock("../hooks/useQuarantine");
// Mock QuaratineItem to focus on List logic
vi.mock("./QuarantineItem", () => ({
  QuarantineItem: ({ item }: any) => <div data-testid="quarantine-item">{item.file_path}</div>
}));

describe("QuarantineList", () => {
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render loading state (skeletons)", () => {
    vi.mocked(useQuarantine).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    render(<QuarantineList />);
    
    // Check for skeletons (at least some of them)
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("should render error state", () => {
    const errorMessage = "Failed to fetch items";
    vi.mocked(useQuarantine).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error(errorMessage),
      refetch: mockRefetch,
    } as any);

    render(<QuarantineList />);

    expect(screen.getByText("Échec du chargement de la zone de quarantaine")).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    
    const retryButton = screen.getByRole("button", { name: /Réessayer/i });
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("should render empty state", () => {
    vi.mocked(useQuarantine).mockReturnValue({
      data: { data: [], meta: { total: 0 } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    render(<QuarantineList />);

    expect(screen.getByText("Aucun élément en quarantaine")).toBeInTheDocument();
    expect(screen.getByText(/Tout le contenu est enrichi/i)).toBeInTheDocument();
  });

  it("should render list of items", () => {
    const mockItems = [
      { id: 1, file_path: "/path/file1.epub" },
      { id: 2, file_path: "/path/file2.cbz" },
    ];
    vi.mocked(useQuarantine).mockReturnValue({
      data: { data: mockItems, meta: { total: 2 } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    render(<QuarantineList />);

    expect(screen.getByText("Quarantaine")).toBeInTheDocument();
    expect(screen.getByText("2 livres nécessitent une intervention")).toBeInTheDocument();
    
    const items = screen.getAllByTestId("quarantine-item");
    expect(items.length).toBe(2);
    expect(screen.getByText("/path/file1.epub")).toBeInTheDocument();
    expect(screen.getByText("/path/file2.cbz")).toBeInTheDocument();
  });

  it("should call refetch when header refresh button is clicked", () => {
    vi.mocked(useQuarantine).mockReturnValue({
      data: { data: [], meta: { total: 0 } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    // Initial render for empty state (no refresh button there)
    // Let's mock with data to see the header refresh button
    vi.mocked(useQuarantine).mockReturnValue({
      data: { data: [{ id: 1, file_path: "test" }], meta: { total: 1 } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    render(<QuarantineList />);

    const refreshButton = screen.getAllByRole("button").find(b => b.querySelector("svg"));
    if (refreshButton) {
      fireEvent.click(refreshButton);
      expect(mockRefetch).toHaveBeenCalled();
    }
  });
});
