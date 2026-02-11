import React, { useState, useRef, useMemo, useEffect } from "react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Separator } from "@/shared/components/ui/separator";
import { Spinner } from "@/shared/components/ui/spinner";
import { Save, Upload, Image as ImageIcon } from "lucide-react";
import type { BookForEdit, EditMetadataRequest } from "../types";

interface MetadataEditFormProps {
  book: BookForEdit;
  onSave: (data: EditMetadataRequest) => void;
  onCoverUpload: (file: File) => void;
  onCancel?: () => void;
  isSaving: boolean;
  isUploadingCover: boolean;
}

/**
 * Form component for editing book metadata
 * Pre-populates fields with existing book data and handles validation
 */
export const MetadataEditForm: React.FC<MetadataEditFormProps> = ({
  book,
  onSave,
  onCoverUpload,
  onCancel,
  isSaving,
  isUploadingCover,
}) => {
  // Parse genres from JSON string to comma-separated display format
  const initialGenres = useMemo(() => {
    if (!book.genres) return "";
    try {
      const parsed = JSON.parse(book.genres);
      return Array.isArray(parsed) ? parsed.join(", ") : "";
    } catch {
      return "";
    }
  }, [book.genres]);

  // Form state
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author || "");
  const [description, setDescription] = useState(book.description || "");
  const [genres, setGenres] = useState(initialGenres);
  const [series, setSeries] = useState(book.series || "");
  const [volume, setVolume] = useState(book.volume?.toString() || "");
  const [isbn, setIsbn] = useState(book.isbn || "");
  const [publisher, setPublisher] = useState(book.publisher || "");
  const [publicationDate, setPublicationDate] = useState(
    book.publication_date || ""
  );
  const [language, setLanguage] = useState(book.language || "");

  // Cover preview state
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (coverPreview) {
        URL.revokeObjectURL(coverPreview);
      }
    };
  }, [coverPreview]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Build request with only changed/non-empty fields
    const data: EditMetadataRequest = {};

    if (title !== book.title) data.title = title;
    if (author !== (book.author || ""))
      data.author = author.trim() || null;
    if (description !== (book.description || ""))
      data.description = description.trim() || null;
    if (series !== (book.series || ""))
      data.series = series.trim() || null;
    if (publisher !== (book.publisher || ""))
      data.publisher = publisher.trim() || null;
    if (publicationDate !== (book.publication_date || ""))
      data.publication_date = publicationDate.trim() || null;
    if (language !== (book.language || ""))
      data.language = language.trim() || null;
    if (isbn !== (book.isbn || "")) data.isbn = isbn.trim() || null;

    // Handle volume conversion
    const volumeNum = volume ? parseInt(volume, 10) : null;
    if (volumeNum !== book.volume) {
      data.volume = volumeNum && volumeNum > 0 ? volumeNum : null;
    }

    // Handle genres conversion from comma-separated to array
    const genresArray = genres
      .split(",")
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
    const currentGenres = initialGenres
      .split(",")
      .map((g) => g.trim())
      .filter((g) => g.length > 0);

    if (JSON.stringify(genresArray) !== JSON.stringify(currentGenres)) {
      data.genres = genresArray.length > 0 ? genresArray : null;
    }

    // Only submit if there are changes
    if (Object.keys(data).length > 0) {
      onSave(data);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setCoverPreview(previewUrl);
      // Trigger upload
      onCoverUpload(file);
    }
  };

  const handleCoverButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Determine cover URL for preview
  const coverUrl = useMemo(() => {
    if (coverPreview) return coverPreview;
    if (book.cover_path) return `/api/v1/books/${book.id}/cover`;
    return null;
  }, [coverPreview, book.cover_path, book.id]);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <ScrollArea className="flex-1 pr-4">
        <div className="space-y-4 pb-4">
          {/* Title (required) */}
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={1}
              placeholder="Book title"
            />
          </div>

          {/* Author */}
          <div className="space-y-2">
            <Label htmlFor="author">Author</Label>
            <Input
              id="author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author name"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Book description..."
              rows={4}
            />
          </div>

          {/* Genres */}
          <div className="space-y-2">
            <Label htmlFor="genres">Genres (comma-separated)</Label>
            <Input
              id="genres"
              value={genres}
              onChange={(e) => setGenres(e.target.value)}
              placeholder="Fiction, Fantasy, Adventure"
            />
          </div>

          {/* Series & Volume (two columns) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="series">Series</Label>
              <Input
                id="series"
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                placeholder="Series name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="volume">Volume</Label>
              <Input
                id="volume"
                type="number"
                min="1"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                placeholder="1"
              />
            </div>
          </div>

          {/* ISBN & Language (two columns) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="isbn">ISBN</Label>
              <Input
                id="isbn"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="978-0000000000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Input
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="en"
              />
            </div>
          </div>

          {/* Publisher & Publication Date (two columns) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="publisher">Publisher</Label>
              <Input
                id="publisher"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                placeholder="Publisher name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="publicationDate">Publication Date</Label>
              <Input
                id="publicationDate"
                value={publicationDate}
                onChange={(e) => setPublicationDate(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </div>
          </div>

          <Separator className="my-4" />

          {/* Cover Image */}
          <div className="space-y-2">
            <Label>Cover Image</Label>
            <div className="flex gap-4 items-start">
              {/* Cover Preview */}
              <div className="w-24 h-36 bg-muted rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 border">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt="Cover preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
                )}
              </div>

              {/* Upload Controls */}
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCoverButtonClick}
                  disabled={isUploadingCover}
                >
                  {isUploadingCover ? (
                    <>
                      <Spinner className="w-4 h-4 mr-2" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Choose file
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Max 5MB (JPEG, PNG, WebP, GIF)
                </p>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Form Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t mt-4">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSaving || !title.trim()}>
          {isSaving ? (
            <>
              <Spinner className="w-4 h-4 mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </form>
  );
};
