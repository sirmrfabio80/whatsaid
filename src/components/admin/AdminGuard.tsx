import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Gates admin-only routes. Non-admins are redirected to the homepage.
 * Renders a minimal loading state while auth is initialising.
 */
export default function AdminGuard({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="h-6 w-40 bg-muted/60 rounded animate-pulse" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
