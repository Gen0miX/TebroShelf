import { Button } from "@/shared/components/ui/button";
import { useAuth } from "@/features/auth";
import { useApproveQuarantine } from "../hooks/useApproveQuarantine";
import { toast } from "@/shared/hooks/use-toast";

interface ApproveButtonProps {
  bookId: number;
  bookTitle: string;
}

export function ApproveButton({ bookId, bookTitle }: ApproveButtonProps) {
  const { user } = useAuth();
  const { mutate: approve, isPending } = useApproveQuarantine();

  // Admin-only — don't render for non-admin
  if (!user || user.role !== "admin") {
    return null;
  }

  const handleApprove = () => {
    approve(bookId, {
      onSuccess: () => {
        toast({
          title: "Moved to library",
          description: `"${bookTitle}" is now available in the library.`,
        });
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Approval failed",
          description: error.message,
        });
      },
    });
  };

  return (
    <Button onClick={handleApprove} disabled={isPending} variant="default">
      {isPending ? "Moving..." : "Move to Library"}
    </Button>
  );
}
