import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app/header";

function AuthenticatedLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  component: AuthenticatedLayout,
});
