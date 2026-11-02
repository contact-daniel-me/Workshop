import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/use-me";
import { QrCode, LogOut, User, ShieldCheck } from "lucide-react";

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
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Left: Event Management Portal Brand */}
        <Link
          to="/dashboard"
          className="flex items-center gap-2 font-display text-base sm:text-lg font-bold text-foreground hover:text-primary transition-colors shrink-0"
        >
          <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <QrCode className="h-4 w-4" />
          </div>
          <span className="hidden sm:inline">Event Management Portal</span>
          <span className="sm:hidden">Event Portal</span>
        </Link>

        {/* Right: Navigation, Profile & Logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          <nav className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Link
              to="/dashboard"
              className="rounded-lg px-3 py-1.5 font-medium transition-colors hover:bg-muted text-muted-foreground"
              activeProps={{ className: "bg-muted font-bold text-foreground shadow-2xs" }}
            >
              My Attendance
            </Link>

            {me?.isStaff && (
              <Link
                to="/admin"
                className="rounded-lg px-3 py-1.5 font-medium transition-colors hover:bg-muted text-muted-foreground flex items-center gap-1"
                activeProps={{ className: "bg-muted font-bold text-foreground shadow-2xs" }}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Admin</span>
              </Link>
            )}
          </nav>

          {/* Participant Profile Access */}
          {me?.profile?.full_name && (
            <Link
              to="/dashboard"
              className="hidden md:flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-foreground/90 hover:text-primary bg-muted/50 hover:bg-muted px-2.5 py-1 rounded-lg border transition-colors truncate max-w-[160px]"
              title={`Signed in as ${me.profile.full_name} (${me.profile.participant_code})`}
            >
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{me.profile.full_name}</span>
            </Link>
          )}

          {/* Sign Out Action */}
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="h-8 w-8 sm:w-auto px-0 sm:px-2.5 text-xs sm:text-sm gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer shrink-0"
            title="Sign out of Event Management Portal"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
