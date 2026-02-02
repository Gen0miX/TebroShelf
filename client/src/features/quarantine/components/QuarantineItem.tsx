import { useState } from "react";
import {
  FileText,
  BookOpen,
  Clock,
  AlertCircle,
  Book,
  BookImage,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type {
  MetadataSearchResult,
  QuarantineItemType,
  ApplyMetadataRequest,
} from "@/features/quarantine/index";
import { Card } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import { MetadataSearchPanel } from "./MetadataSearchPanel";
import { MetadataPreviewPanel } from "./MetadataPreviewPanel";
import { useApplyMetadata } from "../hooks/useApplyMetadata";
import { useToast } from "@/shared/hooks/use-toast";
import { ToastAction } from "@/shared/components/ui/toast";

interface QuarantineItemProps {
  item: QuarantineItemType;
}

type MetadataPanelState =
  | { type: "search" }
  | { type: "preview"; result: MetadataSearchResult };

// Map MetadataSearchResult to ApplyMetadataRequest
function mapResultToApplyRequest(
  result: MetadataSearchResult,
): ApplyMetadataRequest {
  return {
    title: result.title,
    author: result.author ?? undefined,
    description: result.description ?? undefined,
    genres: result.genres.length > 0 ? result.genres : undefined,
    publicationDate: result.publicationDate ?? undefined,
    publisher: result.publisher ?? undefined,
    isbn: result.isbn ?? undefined,
    language: result.language ?? undefined,
    series: result.series ?? undefined,
    volume: result.volume ?? undefined,
    coverUrl: result.coverUrl ?? undefined,
    source: result.source,
    externalId: result.externalId,
  };
}

export function QuarantineItem({ item }: QuarantineItemProps) {
  const { toast } = useToast();
  const { mutate: applyMetadata, isPending: isApplying } = useApplyMetadata();

  // Extract filename from file_path
  const filename = item.file_path.split(/[\\/]/).pop() || item.file_path;

  // Format date
  const dateAdded = format(new Date(item.created_at), "PPP", { locale: fr });

  // Build cover URL using API base URL + static path
  const coverUrl = item.cover_path
    ? `${import.meta.env.VITE_API_URL}/static/${item.cover_path}`
    : null;

  const [panelState, setPanelState] = useState<MetadataPanelState>({
    type: "search",
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleApplyMetadata = (result: MetadataSearchResult) => {
    const metadata = mapResultToApplyRequest(result);
    applyMetadata(
      { bookId: item.id, metadata },
      {
        onSuccess: () => {
          toast({
            title: "Métadonnées appliquées",
            description: `Les métadonnées ont été appliquées à "${item.title}".`,
          });
          setSheetOpen(false);
          setPanelState({ type: "search" });
        },
        onError: (error) => {
          toast({
            title: "Erreur",
            description:
              error instanceof Error
                ? error.message
                : "Impossible d'appliquer les métadonnées.",
            variant: "destructive",
            action: (
              <ToastAction
                altText="Réessayer"
                onClick={() => handleApplyMetadata(result)}
              >
                Réessayer
              </ToastAction>
            ),
          });
        },
      },
    );
  };

  const sheetConfig = (() => {
    switch (panelState.type) {
      case "search":
        return {
          title: "Recherche de métadonnées",
          description: (
            <>
              Recherchez des métadonnées pour enrichir{" "}
              <strong>{item.title}</strong>. Sélectionnez un résultat pour
              l’aperçu.
            </>
          ),
          content: (
            <MetadataSearchPanel
              bookId={item.id}
              initialQuery={item.title}
              contentType={item.content_type}
              onResultSelect={(result) =>
                setPanelState({ type: "preview", result })
              }
            />
          ),
        };

      case "preview":
        return {
          title: "Aperçu des métadonnées",
          description: (
            <>
              Vérifiez les informations avant de les appliquer à{" "}
              <strong>{item.title}</strong>.
            </>
          ),
          content: (
            <MetadataPreviewPanel
              result={panelState.result}
              currentBook={{
                title: item.title,
                author: item.author,
                description: item.description,
                genres: item.genres,
                coverPath: item.cover_path,
                contentType: item.content_type,
                publisher: item.publisher,
                publicationDate: item.publication_date,
                isbn: item.isbn,
                language: item.language,
                series: item.series,
                volume: item.volume,
              }}
              onBack={() => setPanelState({ type: "search" })}
              onApply={handleApplyMetadata}
              isApplying={isApplying}
            />
          ),
        };
    }
  })();

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div className="flex flex-col sm:flex-row h-full">
        {/* Cover Section */}
        <div className="relative w-full sm:w-32 h-48 sm:h-auto bg-muted flex items-center justify-center shrink-0">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={filename}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <BookOpen className="h-8 w-8 opacity-20" />
              <span className="text-[10px] uppercase tracking-wider font-medium opacity-50">
                Pas de couverture
              </span>
            </div>
          )}

          <div className="absolute bottom-2 right-2"></div>
        </div>

        {/* Info Section */}
        <div className="flex flex-col flex-1 p-4 gap-3">
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-1">
              <h3
                className="font-semibold text-lg leading-tight line-clamp-1"
                title={item.title}
              >
                {item.title}
              </h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Book className="h-3 w-3" />
                {filename}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Ajouté le {dateAdded}</span>
              </div>
              <Badge
                variant={item.content_type === "manga" ? "accent" : "default"}
                className="capitalize text-[10px] px-1.5 py-0 h-5"
              >
                {item.content_type}
              </Badge>
            </div>

            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-destructive uppercase tracking-wide">
                    Raison de mise en quarantaine
                  </p>
                  <p className="text-sm text-foreground/90 font-medium leading-normal">
                    {item.failure_reason || "Erreur de traitement inconnue"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t text-xs mt-auto">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span
                className="uppercase font-medium tracking-tight"
                data-testid="file-type"
              >
                {item.file_type}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {item.language && (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                  {item.language.toUpperCase()}
                </Badge>
              )}
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="default"
                    size="icon"
                    className="shrink-0 border border-accent/40"
                  >
                    <BookImage className="h-4 w-4" />
                  </Button>
                </SheetTrigger>

                <SheetContent className="w-full sm:max-w-xl flex flex-col">
                  <SheetHeader className="mb-6">
                    <SheetTitle>{sheetConfig.title}</SheetTitle>
                    <SheetDescription>
                      {sheetConfig.description}
                    </SheetDescription>
                  </SheetHeader>

                  <div className="flex-1 min-h-0">{sheetConfig.content}</div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
