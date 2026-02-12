import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  EnrichmentProgressProvider,
  useEnrichmentProgress,
} from "./EnrichmentProgressContext";

describe("EnrichmentProgressContext", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <EnrichmentProgressProvider>{children}</EnrichmentProgressProvider>
  );

  describe("useEnrichmentProgress", () => {
    it("should throw error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => renderHook(() => useEnrichmentProgress())).toThrow(
        "useEnrichmentProgress must be used within EnrichmentProgressProvider",
      );

      consoleSpy.mockRestore();
    });

    it("should start with empty enrichments", () => {
      const { result } = renderHook(() => useEnrichmentProgress(), { wrapper });

      expect(result.current.activeEnrichments).toEqual([]);
      expect(result.current.hasActiveEnrichments).toBe(false);
    });

    it("should add new enrichment via updateEnrichment", () => {
      const { result } = renderHook(() => useEnrichmentProgress(), { wrapper });

      act(() => {
        result.current.updateEnrichment(1, {
          currentStep: "started",
          status: "in-progress",
        });
      });

      expect(result.current.activeEnrichments).toHaveLength(1);
      expect(result.current.hasActiveEnrichments).toBe(true);
      expect(result.current.activeEnrichments[0]).toMatchObject({
        bookId: 1,
        currentStep: "started",
        status: "in-progress",
      });
    });

    it("should update existing enrichment", () => {
      const { result } = renderHook(() => useEnrichmentProgress(), { wrapper });

      act(() => {
        result.current.updateEnrichment(1, {
          currentStep: "started",
          status: "in-progress",
        });
      });

      act(() => {
        result.current.updateEnrichment(1, {
          currentStep: "openlibrary-search-started",
        });
      });

      expect(result.current.activeEnrichments).toHaveLength(1);
      expect(result.current.activeEnrichments[0]).toMatchObject({
        bookId: 1,
        currentStep: "openlibrary-search-started",
        status: "in-progress",
      });
    });

    it("should track multiple books independently", () => {
      const { result } = renderHook(() => useEnrichmentProgress(), { wrapper });

      act(() => {
        result.current.updateEnrichment(1, {
          currentStep: "started",
          status: "in-progress",
        });
        result.current.updateEnrichment(2, {
          currentStep: "pipeline-started",
          status: "in-progress",
        });
      });

      expect(result.current.activeEnrichments).toHaveLength(2);
      expect(result.current.hasActiveEnrichments).toBe(true);

      const book1 = result.current.activeEnrichments.find(
        (e) => e.bookId === 1,
      );
      const book2 = result.current.activeEnrichments.find(
        (e) => e.bookId === 2,
      );

      expect(book1?.currentStep).toBe("started");
      expect(book2?.currentStep).toBe("pipeline-started");
    });

    it("should remove enrichment via removeEnrichment", () => {
      const { result } = renderHook(() => useEnrichmentProgress(), { wrapper });

      act(() => {
        result.current.updateEnrichment(1, {
          currentStep: "started",
          status: "in-progress",
        });
        result.current.updateEnrichment(2, {
          currentStep: "started",
          status: "in-progress",
        });
      });

      expect(result.current.activeEnrichments).toHaveLength(2);

      act(() => {
        result.current.removeEnrichment(1);
      });

      expect(result.current.activeEnrichments).toHaveLength(1);
      expect(result.current.activeEnrichments[0].bookId).toBe(2);
    });

    it("should handle remove of non-existent enrichment gracefully", () => {
      const { result } = renderHook(() => useEnrichmentProgress(), { wrapper });

      act(() => {
        result.current.removeEnrichment(999);
      });

      expect(result.current.activeEnrichments).toEqual([]);
    });

    it("should set hasActiveEnrichments false when all removed", () => {
      const { result } = renderHook(() => useEnrichmentProgress(), { wrapper });

      act(() => {
        result.current.updateEnrichment(1, {
          currentStep: "started",
          status: "in-progress",
        });
      });

      expect(result.current.hasActiveEnrichments).toBe(true);

      act(() => {
        result.current.removeEnrichment(1);
      });

      expect(result.current.hasActiveEnrichments).toBe(false);
    });

    it("should update status to completed with source", () => {
      const { result } = renderHook(() => useEnrichmentProgress(), { wrapper });

      act(() => {
        result.current.updateEnrichment(1, {
          currentStep: "started",
          status: "in-progress",
        });
      });

      act(() => {
        result.current.updateEnrichment(1, {
          currentStep: "completed",
          status: "completed",
          source: "openlibrary",
        });
      });

      expect(result.current.activeEnrichments[0]).toMatchObject({
        status: "completed",
        source: "openlibrary",
      });
    });

    it("should update status to failed with reason", () => {
      const { result } = renderHook(() => useEnrichmentProgress(), { wrapper });

      act(() => {
        result.current.updateEnrichment(1, {
          currentStep: "started",
          status: "in-progress",
        });
      });

      act(() => {
        result.current.updateEnrichment(1, {
          currentStep: "enrichment-failed",
          status: "failed",
          reason: "No match found",
        });
      });

      expect(result.current.activeEnrichments[0]).toMatchObject({
        status: "failed",
        reason: "No match found",
      });
    });
  });
});
