import { AlertCircle, Inbox, RefreshCcw } from "lucide-react";
import { useQuarantine } from "@/features/quarantine/index";
import { QuarantineItem } from "@/features/quarantine/index";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Button } from "@/shared/components/ui/button";

export function QuarantineList() {
  const {
    data: response,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuarantine();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border h-[240px] flex flex-col sm:flex-row overflow-hidden shadow-sm"
            >
              <Skeleton className="w-full sm:w-32 h-48 sm:h-full shrink-0" />
              <div className="p-4 flex flex-col flex-1 gap-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-16 w-full" />
                <div className="mt-auto flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border bg-destructive/5 border-destructive/10">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold">
          Échec du chargement de la zone de quarantaine
        </h3>
        <p className="text-muted-foreground max-w-sm mb-6">
          {error instanceof Error
            ? error.message
            : "An unexpected error occurred while fetching items."}
        </p>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <RefreshCcw className="h-4 w-4" />
          Réessayer
        </Button>
      </div>
    );
  }

  const items = response?.data || [];
  const total = response?.meta?.total || items.length;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center rounded-2xl border-2 border-dashed bg-muted/30">
        <div className="bg-primary/10 p-4 rounded-full mb-4">
          <Inbox className="h-10 w-10 text-primary opacity-60" />
        </div>
        <h3 className="text-xl font-bold">Aucun élément en quarantaine</h3>
        <p className="text-muted-foreground mt-2">
          Tout le contenu est enrichi ! Tout fonctionne parfaitement.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Quarantaine</h2>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "livre" : "livres"} nécessitent une
            intervention
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item) => (
          <QuarantineItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
