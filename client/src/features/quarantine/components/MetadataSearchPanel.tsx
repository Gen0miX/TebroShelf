import React, { useState, useEffect } from "react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Search, AlertCircle, Inbox } from "lucide-react";
import { useAvailableSources } from "../hooks/useAvailableSources";
import { useMetadataSearch } from "../hooks/useMetadataSearch";
import { MetadataSearchResult } from "./MetadataSearchResult";
import type {
  MetadataSearchResult as MetadataSearchResultType,
  MetadataSource,
} from "../types";

interface MetadataSearchPanelProps {
  bookId: number;
  initialQuery?: string;
  contentType: "book" | "manga";
  onResultSelect?: (result: MetadataSearchResultType) => void;
}

const sourceLabels: Record<string, string> = {
  openlibrary: "OpenLibrary",
  googlebooks: "Google Books",
  anilist: "AniList",
  myanimelist: "MyAnimeList",
  mangadex: "MangaDex",
};

const BOOK_SOURCES = ["openlibrary", "googlebooks"];
const MANGA_SOURCES = ["anilist", "myanimelist", "mangadex"];

export const MetadataSearchPanel: React.FC<MetadataSearchPanelProps> = ({
  bookId,
  initialQuery = "",
  contentType,
  onResultSelect,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [source, setSource] = useState<MetadataSource>(
    contentType === "manga" ? "anilist" : "openlibrary",
  );

  const { data: availableSources, isLoading: isLoadingSources } =
    useAvailableSources();
  const {
    data: results,
    isLoading: isSearching,
    isError,
    refetch,
    isFetched,
  } = useMetadataSearch(query, source);

  // Filter sources based on content type
  const filteredSources = availableSources?.filter((src) => {
    if (contentType === "book") return BOOK_SOURCES.includes(src);
    if (contentType === "manga") return MANGA_SOURCES.includes(src);
    return true;
  });

  // Update query if initialQuery changes
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  // Adjust source if contentType changes or results are loaded
  useEffect(() => {
    if (contentType === "manga") {
      setSource("anilist");
    } else {
      setSource("openlibrary");
    }
  }, [contentType]);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (query.trim()) {
      refetch();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Search Form */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input type="hidden" name="bookId" value={bookId} />
        <div className="flex-1">
          <Input
            placeholder="Search by title..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full"
          />
        </div>

        <Select
          value={source}
          onValueChange={(value) => setSource(value as MetadataSource)}
          disabled={isLoadingSources}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {filteredSources?.map((src) => (
              <SelectItem key={src} value={src}>
                {sourceLabels[src] || src}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button type="submit" disabled={isSearching || !query.trim()}>
          <Search className="w-4 h-4 mr-2" />
          Search
        </Button>
      </form>

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto min-h-0 pt-2">
        {isSearching ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex p-3 gap-4 border rounded-xl overflow-hidden"
              >
                <Skeleton className="w-16 h-24 flex-shrink-0" />
                <div className="flex flex-col flex-1 justify-between py-1">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="w-12 h-12 text-destructive/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Search failed
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Something went wrong while fetching metadata. Please try again.
            </p>
            <Button variant="outline" onClick={() => handleSearch()}>
              Retry Search
            </Button>
          </div>
        ) : isFetched && (!results || results.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No results found
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Try different search terms or select another source to find your
              book.
            </p>
          </div>
        ) : (
          <div className="space-y-3 no-scrollbar overflow-y-auto">
            {results?.map((result) => (
              <MetadataSearchResult
                key={`${result.source}-${result.externalId}`}
                result={result}
                onSelect={onResultSelect}
              />
            ))}

            {!isFetched && !initialQuery && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/60">
                <Search className="w-12 h-12 mb-4 opacity-20" />
                <p>Search for metadata to enrich your book</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
