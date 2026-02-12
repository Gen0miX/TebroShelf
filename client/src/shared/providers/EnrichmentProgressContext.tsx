// EnrichmentProgressContext - Story 3.14
// Context-based state management for tracking enrichment progress (Option C)

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface EnrichmentStatus {
  bookId: number;
  currentStep: string;
  status: "in-progress" | "completed" | "failed";
  source?: string;
  reason?: string;
  startedAt: string;
  updatedAt: string;
}

interface EnrichmentProgressContextValue {
  activeEnrichments: EnrichmentStatus[];
  hasActiveEnrichments: boolean;
  updateEnrichment: (bookId: number, update: Partial<EnrichmentStatus>) => void;
  removeEnrichment: (bookId: number) => void;
}

const EnrichmentProgressContext =
  createContext<EnrichmentProgressContextValue | null>(null);

export function EnrichmentProgressProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [enrichments, setEnrichments] = useState<Map<number, EnrichmentStatus>>(
    new Map(),
  );

  const updateEnrichment = useCallback(
    (bookId: number, update: Partial<EnrichmentStatus>) => {
      setEnrichments((prev) => {
        const next = new Map(prev);
        const existing = next.get(bookId);
        const now = new Date().toISOString();

        // Build merged object, ensuring updatedAt is always current
        const { updatedAt: _existingUpdatedAt, ...existingRest } = existing ?? {
          bookId,
          currentStep: "started",
          status: "in-progress" as const,
          startedAt: now,
        };
        const { updatedAt: _updateUpdatedAt, ...updateRest } = update;

        next.set(bookId, {
          bookId,
          currentStep: "started",
          status: "in-progress",
          startedAt: now,
          ...existingRest,
          ...updateRest,
          updatedAt: now,
        });

        return next;
      });
    },
    [],
  );

  const removeEnrichment = useCallback((bookId: number) => {
    setEnrichments((prev) => {
      const next = new Map(prev);
      next.delete(bookId);
      return next;
    });
  }, []);

  return (
    <EnrichmentProgressContext.Provider
      value={{
        activeEnrichments: Array.from(enrichments.values()),
        hasActiveEnrichments: enrichments.size > 0,
        updateEnrichment,
        removeEnrichment,
      }}
    >
      {children}
    </EnrichmentProgressContext.Provider>
  );
}

/**
 * Hook to access enrichment progress state.
 * Must be used within EnrichmentProgressProvider.
 */
export function useEnrichmentProgress() {
  const context = useContext(EnrichmentProgressContext);
  if (!context) {
    throw new Error(
      "useEnrichmentProgress must be used within EnrichmentProgressProvider",
    );
  }
  return context;
}
