import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { useToast } from "@/shared/hooks/use-toast";
import { MetadataEditForm } from "./MetadataEditForm";
import { useEditMetadata } from "../hooks/useEditMetadata";
import { useUploadCover } from "../hooks/useUploadCover";
import type { BookForEdit, EditMetadataRequest } from "../types";

interface MetadataEditDialogProps {
  book: BookForEdit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog wrapper for MetadataEditForm
 * Handles mutations and toast notifications
 */
export const MetadataEditDialog: React.FC<MetadataEditDialogProps> = ({
  book,
  open,
  onOpenChange,
}) => {
  const { toast } = useToast();
  const editMutation = useEditMetadata();
  const coverMutation = useUploadCover();

  const handleSave = (data: EditMetadataRequest) => {
    editMutation.mutate(
      { bookId: book.id, data },
      {
        onSuccess: () => {
          toast({
            title: "Metadata updated",
            description: "Changes saved successfully.",
          });
          onOpenChange(false);
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Save failed",
            description: error.message,
          });
        },
      }
    );
  };

  const handleCoverUpload = (file: File) => {
    coverMutation.mutate(
      { bookId: book.id, file },
      {
        onSuccess: () => {
          toast({
            title: "Cover updated",
            description: "Cover image uploaded successfully.",
          });
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Cover upload failed",
            description: error.message,
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate">
            Edit Metadata — {book.title}
          </DialogTitle>
          <DialogDescription>
            Modify book information and cover image
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <MetadataEditForm
            book={book}
            onSave={handleSave}
            onCoverUpload={handleCoverUpload}
            onCancel={() => onOpenChange(false)}
            isSaving={editMutation.isPending}
            isUploadingCover={coverMutation.isPending}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
