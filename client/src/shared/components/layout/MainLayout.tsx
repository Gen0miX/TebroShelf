import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/shared/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Separator } from "@/shared/components/ui/separator";
import { useState } from "react";
import type { ReactNode } from "react";
import { PageTitleContext } from "@/shared/providers/PageTitleContext";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [title, setTitle] = useState("TebroShelf");

  return (
    <PageTitleContext.Provider value={setTitle}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-background">
          <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              {/* Breadcrumb or Page Title can go here */}
              <h1 className="font-semibold text-lg tracking-tight">{title}</h1>
            </div>
          </header>
          <main className="flex flex-1 flex-col gap-4 p-6 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </PageTitleContext.Provider>
  );
}
