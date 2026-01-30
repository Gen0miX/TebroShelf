import type { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { Navigate } from "react-router";

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
