import { Radiation } from "lucide-react";
import { QuarantineList } from "@/features/quarantine/index";
import { useEffect } from "react";
import { usePageTitle } from "../providers/PageTitleContext";

export default function QuarantinePage() {
  const setTitle = usePageTitle();

  useEffect(() => {
    setTitle("Quarantaine");
  }, [setTitle]);

  return (
    <main className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8 border-b pb-6">
        <div className="bg-destructive/10 p-3 rounded-xl">
          <Radiation className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Zone de Quarantaine
          </h1>
          <p className="text-muted-foreground">
            Examinez et gérez les éléments qui ont échoué au processus
            d'enrichissement.
          </p>
        </div>
      </div>

      <QuarantineList />
    </main>
  );
}
