// EnrichmentProgressTracker - Story 3.14
// Fixed-position panel showing active enrichment progress

import {
  useEnrichmentProgress,
  type EnrichmentStatus,
} from "@/shared/providers/EnrichmentProgressContext";
import { getStepLabel } from "@/shared/utils/enrichmentSteps";
import { cn } from "@/shared/lib/utils";

function EnrichmentItem({ enrichment }: { enrichment: EnrichmentStatus }) {
  const stepLabel = getStepLabel(enrichment.currentStep);
  const isCompleted = enrichment.status === "completed";
  const isFailed = enrichment.status === "failed";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 text-sm transition-all",
        isCompleted &&
          "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950",
        isFailed &&
          "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950",
        !isCompleted &&
          !isFailed &&
          "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950",
      )}
    >
      {/* Status icon */}
      <div className="flex-shrink-0">
        {isCompleted && <span className="text-green-600">&#10003;</span>}
        {isFailed && <span className="text-red-600">&#10007;</span>}
        {!isCompleted && !isFailed && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">Book #{enrichment.bookId}</p>
        <p className="truncate text-muted-foreground">
          {stepLabel}
          {enrichment.source && ` (${enrichment.source})`}
          {enrichment.reason && `: ${enrichment.reason}`}
        </p>
      </div>
    </div>
  );
}

export function EnrichmentProgressTracker() {
  const { activeEnrichments, hasActiveEnrichments } = useEnrichmentProgress();

  if (!hasActiveEnrichments) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 space-y-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Enrichment Progress
      </h3>
      {activeEnrichments.map((enrichment) => (
        <EnrichmentItem key={enrichment.bookId} enrichment={enrichment} />
      ))}
    </div>
  );
}
