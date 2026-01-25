import { Button } from "@/shared/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useForceScan } from "../hooks/useForceScan";
import { toast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/features/auth";

export function ScanButton() {
  const { user } = useAuth();
  const { mutate: triggerScan, isPending } = useForceScan();

  // Only render for admin users (AC #1)
  if (!user || user.role !== "admin") {
    return null;
  }

  const handleClick = () => {
    triggerScan(undefined, {
      onSuccess: (data) => {
        toast({
          title: "Scan complete",
          description: `${data.filesProcessed} new file(s) detected`,
        });
      },
      onError: (error) => {
        if (error.message.includes("already in progress")) {
          toast({
            variant: "destructive",
            title: "Scan in progress",
            description: "Please wait for the current scan to complete",
          });
        } else {
          toast({
            variant: "destructive",
            title: "Scan failed",
            description: error.message,
          });
        }
      },
    });
  };

  return (
    <Button onClick={handleClick} disabled={isPending} variant="outline">
      <RefreshCw
        className={`mr-2 h-4 w-4 ${isPending ? "animate-spin" : ""}`}
      />
      {isPending ? "Scanning..." : "Force Scan"}
    </Button>
  );
}
