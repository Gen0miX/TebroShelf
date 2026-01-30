import { FileText, BookOpen, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { QuarantineItemType } from "@/features/quarantine/index";
import { Card } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";

interface QuarantineItemProps {
  item: QuarantineItemType;
}

export function QuarantineItem({ item }: QuarantineItemProps) {
  // Extract filename from file_path
  const filename = item.file_path.split(/[\\/]/).pop() || item.file_path;

  // Format date
  const dateAdded = format(new Date(item.created_at), "PPP", { locale: fr });

  // Build cover URL using API base URL + static path
  const coverUrl = item.cover_path
    ? `${import.meta.env.VITE_API_URL}/static/${item.cover_path}`
    : null;

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
          <div className="space-y-1">
            <h3
              className="font-semibold text-lg leading-tight line-clamp-1"
              title={filename}
            >
              {filename}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Ajouté le {dateAdded}</span>
            </div>
          </div>

          <div className="flex-1 space-y-2">
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

          <div className="flex items-center justify-between pt-2 border-t text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span className="uppercase font-medium tracking-tight" data-testid="file-type">
                {item.file_type}
              </span>
            </div>

            {item.language && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                {item.language.toUpperCase()}
              </Badge>
            )}
            <Badge
              variant={item.content_type === "manga" ? "accent" : "default"}
              className="capitalize text-[10px] px-1.5 py-0 h-5"
            >
              {item.content_type}
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}
