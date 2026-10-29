import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeAppPassword } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Attendance Portal" },
      { name: "description", content: "Choose a new password for your account." },
      { property: "og:title", content: "Set a new password — Attendance Portal" },
      { property: "og:description", content: "Choose a new password for your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const pw = String(f.get("pw"));
          if (!pw) return toast.error("Password is required.");
          if (pw !== String(f.get("pw2"))) return toast.error("Passwords don't match.");
          setBusy(true);
          const { error } = await supabase.auth.updateUser({ password: normalizeAppPassword(pw) });
          setBusy(false);
          if (error) return toast.error(error.message);
          toast.success("Password updated");
          navigate({ to: "/dashboard" });
        }}
      >
        <h1 className="text-2xl font-bold">Set a new password</h1>
        <div className="space-y-1.5"><Label>New password</Label><Input name="pw" type="password" required /></div>
        <div className="space-y-1.5"><Label>Confirm password</Label><Input name="pw2" type="password" required /></div>
        <Button className="w-full" disabled={busy}>Update password</Button>
      </form>
    </div>
  );
}
