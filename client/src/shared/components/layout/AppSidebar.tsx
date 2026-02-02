import {
  Library,
  PlusCircle,
  Radiation,
  Activity,
  Settings,
  BookOpen,
  Layers,
  ChevronRight,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/shared/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { Link, useLocation } from "react-router-dom";
import { useQuarantineCount } from "@/features/quarantine/hooks/useQuarantineCount";

const items = [
  {
    title: "Bibliothèque",
    icon: Library,
    url: "/",
    items: [
      {
        title: "Livres",
        url: "/library/books",
        icon: BookOpen,
      },
      {
        title: "Mangas",
        url: "/library/manga",
        icon: Layers,
      },
    ],
  },
  {
    title: "Add New",
    icon: PlusCircle,
    url: "/add",
  },
  {
    title: "Quarantaine",
    icon: Radiation,
    url: "/quarantine",
  },
  {
    title: "Activité",
    icon: Activity,
    url: "/activity",
  },
  {
    title: "Paramètres",
    icon: Settings,
    url: "/settings",
  },
];

export function AppSidebar() {
  const location = useLocation();
  const { data: qCount } = useQuarantineCount();

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="h-16 flex items-center px-6 pt-3">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <div className="size-10 flex items-center justify-center">
            <img src="/favicon.svg" alt="TebroShelf Logo" />
          </div>
          <span className="group-data-[collapsible=icon]:hidden">
            TebroShelf
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive =
                  location.pathname === item.url ||
                  item.items?.some((sub) => location.pathname === sub.url);

                if (item.items) {
                  return (
                    <Collapsible
                      key={item.title}
                      asChild
                      open={isActive}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            asChild
                            tooltip={item.title}
                            isActive={isActive}
                          >
                            <Link to={item.url}>
                              <item.icon className="size-4" />
                              <span>{item.title}</span>
                              <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </Link>
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.items.map((subItem) => (
                              <SidebarMenuSubItem key={subItem.title}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={location.pathname === subItem.url}
                                >
                                  <Link to={subItem.url}>
                                    <span>{subItem.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={isActive}
                    >
                      <Link to={item.url}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.title === "Quarantaine" &&
                    qCount &&
                    qCount.count > 0 ? (
                      <SidebarMenuBadge
                        className="bg-destructive/30 text-destructive peer-data-[active=true]/menu-button:text-destructive 
                      peer-data-[active=true]/menu-button:bg-destructive/40 peer-hover/menu-button:text-destructive peer-hover/menu-button:bg-destructive/40 
                      group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:-top-1 group-data-[collapsible=icon]:-right-1 group-data-[collapsible=icon]:h-4 
                      group-data-[collapsible=icon]:min-w-4 group-data-[collapsible=icon]:text-[10px] group-data-[collapsible=icon]:px-1"
                      >
                        {qCount.count}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {/* Placeholder for user profile / logout */}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
