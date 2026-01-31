import React, { useState } from "react";
import { Card } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { ImageIcon } from "lucide-react";
import { Spinner } from "@/shared/components/ui/spinner";
import type { MetadataSearchResult as MetadataSearchResultType } from "@/features/quarantine/index";

interface MetadataSearchResultProps {
  result: MetadataSearchResultType;
  onSelect?: (result: MetadataSearchResultType) => void;
}

const sourceColors: Record<string, string> = {
  openlibrary: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  googlebooks: "bg-green-100 text-green-800 hover:bg-green-100",
  anilist: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  myanimelist: "bg-indigo-100 text-indigo-800 hover:bg-indigo-100",
  mangadex: "bg-orange-100 text-orange-800 hover:bg-orange-100",
};

const sourceLabels: Record<string, string> = {
  openlibrary: "OpenLibrary",
  googlebooks: "Google Books",
  anilist: "AniList",
  myanimelist: "MyAnimeList",
  mangadex: "MangaDex",
};

export const MetadataSearchResult: React.FC<MetadataSearchResultProps> = ({
  result,
  onSelect,
}) => {
  const { title, author, coverUrl, source } = result;
  const [isImageLoading, setIsImageLoading] = useState(true);

  const handleClick = () => {
    if (onSelect) {
      onSelect(result);
    }
  };

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:border-primary/50 transition-colors group"
      onClick={handleClick}
    >
      <div className="flex p-3 gap-4">
        {/* Cover Thumbnail */}
        <div className="relative w-16 h-24 flex-shrink-0 bg-secondary/30 rounded flex items-center justify-center overflow-hidden border border-border/50">
          {coverUrl ? (
            <>
              {isImageLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-secondary/20">
                  <Spinner className="w-5 h-5 text-muted-foreground/40" />
                </div>
              )}
              <img
                src={coverUrl}
                alt={title}
                className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-300 ${
                  isImageLoading ? "opacity-0" : "opacity-100"
                }`}
                onLoad={() => setIsImageLoading(false)}
                onError={() => setIsImageLoading(false)}
              />
            </>
          ) : (
            <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col flex-1 min-w-0 justify-between py-0.5">
          <div className="space-y-1">
            <h3
              className="font-bold text-sm leading-tight line-clamp-2"
              title={title}
            >
              {title}
            </h3>
            {author && (
              <p
                className="text-xs text-muted-foreground truncate"
                title={author}
              >
                {author}
              </p>
            )}
          </div>

          <div>
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 h-4 border-none font-medium capitalize ${sourceColors[source] || ""}`}
            >
              {sourceLabels[source] || source}
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
};
