import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Separator } from "@/shared/components/ui/separator";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Check, ArrowLeft, Image as ImageIcon, Loader2 } from "lucide-react";
import type { MetadataSearchResult as MetadataSearchResultType } from "@/features/quarantine/index";

export interface CurrentBookData {
  title: string;
  author: string | null;
  description: string | null;
  genres: string | null; // JSON string or comma separated in UI
  coverPath: string | null;
  contentType: string;
  publisher?: string | null;
  publicationDate?: string | null;
  isbn?: string | null;
  language?: string | null;
  series?: string | null;
  volume?: number | null;
}

interface MetadataPreviewPanelProps {
  result: MetadataSearchResultType;
  currentBook: CurrentBookData;
  onApply: (result: MetadataSearchResultType) => void;
  onBack: () => void;
  isApplying?: boolean;
}

const sourceLabels: Record<string, string> = {
  openlibrary: "OpenLibrary",
  googlebooks: "Google Books",
  anilist: "AniList",
  myanimelist: "MyAnimeList",
  mangadex: "MangaDex",
};

const sourceColors: Record<string, string> = {
  openlibrary: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  googlebooks: "bg-green-100 text-green-800 hover:bg-green-100",
  anilist: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  myanimelist: "bg-indigo-100 text-indigo-800 hover:bg-indigo-100",
  mangadex: "bg-orange-100 text-orange-800 hover:bg-orange-100",
};

export const MetadataPreviewPanel = ({
  result,
  currentBook,
  onApply,
  onBack,
  isApplying = false,
}: MetadataPreviewPanelProps) => {
  // Helpers to compare values
  const hasDiff = (
    current: string | number | null | undefined,
    selected: string | number | null | undefined,
  ): boolean => {
    if (!current && !selected) return false;
    if (!current && selected) return true;
    if (current && !selected) return false;

    return (
      String(current).trim().toLowerCase() !==
      String(selected).trim().toLowerCase()
    );
  };

  const renderField = (
    label: string,
    currentValue: React.ReactNode,
    selectedValue: React.ReactNode,
    isDifferent: boolean
  ) => (
    <div className="grid grid-cols-2 gap-4 py-2 text-sm border-b last:border-0 border-border/50">
      <div className="break-words pr-2">
        <span className="block text-xs font-medium text-muted-foreground uppercase mb-0.5">
          {label}
        </span>
        <div className="text-muted-foreground/80 line-clamp-4">
          {currentValue || "—"}
        </div>
      </div>
      <div className={`break-words pl-2 ${isDifferent ? "bg-accent/10 -mx-2 px-2 rounded" : ""}`}>
        <span className="block text-xs font-medium text-muted-foreground uppercase mb-0.5">
          {label}
        </span>
        <div className={`font-medium line-clamp-4 ${isDifferent ? "text-primary" : ""}`}>
          {selectedValue || "—"}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={isApplying} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Retour
        </Button>
        <Badge 
          className={`capitalize border-none ${sourceColors[result.source] || "bg-secondary"}`}
          variant="secondary"
        >
          Source: {sourceLabels[result.source] || result.source}
        </Badge>
      </div>

      {/* Main Content Area - Side by Side */}
      <Card className="flex-1 overflow-hidden flex flex-col border-border/60 shadow-sm">
        <div className="grid grid-cols-2 gap-4 bg-muted/30 p-3 border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Données actuelles</div>
          <div>Données sélectionnées</div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            
            {/* Cover Images */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="flex flex-col items-center">
                <div className="relative w-32 h-48 bg-muted rounded-md flex items-center justify-center border border-border overflow-hidden">
                   {currentBook.coverPath ? (
                    <img 
                      src={`${import.meta.env.VITE_API_URL}/static/${currentBook.coverPath}`} 
                      alt="Current cover" 
                      className="w-full h-full object-cover opacity-80"
                    />
                  ) : (
                    <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
                  )}
                  <div className="absolute inset-0 bg-background/10 backdrop-grayscale-[0.5]" />
                </div>
                <span className="text-xs text-muted-foreground mt-2">Actuel</span>
              </div>
              
              <div className="flex flex-col items-center">
                <div className="relative w-32 h-48 bg-muted rounded-md flex items-center justify-center border border-primary/20 shadow-sm overflow-hidden">
                  {result.coverUrl ? (
                    <img 
                      src={result.coverUrl} 
                      alt="New cover" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
                  )}
                  {result.coverUrl && !currentBook.coverPath && (
                     <Badge className="absolute top-2 right-2 px-1 py-0 h-4 text-[9px]">NOUVEAU</Badge>
                  )}
                </div>
                <span className="text-xs font-medium text-primary mt-2">Sélectionné</span>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Metadata Fields Comparison */}
            <div className="space-y-1">
              {renderField("Titre", currentBook.title, result.title, hasDiff(currentBook.title, result.title))}
              
              {renderField("Auteur(s)", currentBook.author, result.author, hasDiff(currentBook.author, result.author))}
              
              {renderField("Description", currentBook.description, result.description, hasDiff(currentBook.description, result.description))}
              
              {renderField(
                "Genres", 
                currentBook.genres, 
                result.genres.join(", "), 
                // Simple comparison for genres logic could be improved
                hasDiff(currentBook.genres, result.genres.join(", "))
              )}

              {renderField("Éditeur", currentBook.publisher, result.publisher, hasDiff(currentBook.publisher, result.publisher))}
              
              {renderField("Date de publication", currentBook.publicationDate, result.publicationDate, hasDiff(currentBook.publicationDate, result.publicationDate))}
              
              {renderField("ISBN", currentBook.isbn, result.isbn, hasDiff(currentBook.isbn, result.isbn))}
              
              {renderField("Langue", currentBook.language, result.language, hasDiff(currentBook.language, result.language))}
              
              {renderField("Série", currentBook.series, result.series, hasDiff(currentBook.series, result.series))}
              
              {renderField("Volume", currentBook.volume, result.volume, hasDiff(currentBook.volume, result.volume))}
            </div>

          </div>
        </ScrollArea>
      </Card>

      {/* Actions */}
      <div className="mt-4 flex justify-end gap-3 flex-shrink-0 pt-2 border-t">
        <Button variant="outline" onClick={onBack} disabled={isApplying}>
          Annuler
        </Button>
        <Button 
          onClick={() => onApply(result)} 
          disabled={isApplying}
          className="min-w-[140px]"
        >
          {isApplying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Application...
            </>
          ) : (
             <>
               <Check className="w-4 h-4 mr-2" />
               Appliquer
             </>
          )}
        </Button>
      </div>
    </div>
  );
};
