import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/use-me";
import { QrCode, LogOut } from "lucide-react";

export function AppHeader() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:px-4">
        <Link to="/" className="flex items-center gap-1.5 sm:gap-2 font-display text-base sm:text-lg font-bold text-primary shrink-0">
          <QrCode className="h-5 w-5 shrink-0" />
          <span className="hidden sm:inline">Event Management Portal</span>
          <span className="sm:hidden">Event Portal</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          <nav className="flex items-center gap-1 text-xs sm:text-sm">
            <Link
              to="/dashboard"
              className="rounded-md px-2 py-1.5 sm:px-3 sm:py-1.5 hover:bg-muted font-medium"
              activeProps={{ className: "bg-muted font-bold text-foreground" }}
            >
              <span className="hidden sm:inline">My </span>Attendance
            </Link>
            {me?.isStaff && (
              <Link
                to="/admin"
                className="rounded-md px-2 py-1.5 sm:px-3 sm:py-1.5 hover:bg-muted font-medium"
                activeProps={{ className: "bg-muted font-bold text-foreground" }}
              >
                Admin
              </Link>
            )}
          </nav>
          <span className="hidden text-sm text-muted-foreground md:block truncate max-w-[140px]">
            {me?.profile?.full_name}
          </span>
          <Button variant="ghost" size="sm" onClick={signOut} className="h-8 px-2 sm:px-3 text-xs sm:text-sm gap-1.5">
            <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
