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
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold text-primary">
          <QrCode className="h-5 w-5" /> SmartAttend
        </Link>
        <nav className="flex gap-1 text-sm">
          <Link to="/dashboard" className="rounded-md px-3 py-1.5 hover:bg-muted" activeProps={{ className: "bg-muted font-semibold" }}>
            My attendance
          </Link>
          {me?.isStaff && (
            <Link to="/admin" className="rounded-md px-3 py-1.5 hover:bg-muted" activeProps={{ className: "bg-muted font-semibold" }}>
              Admin
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:block">{me?.profile?.full_name}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
