import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Lock, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Event Management Portal" },
      { name: "description", content: "Password recovery instructions." },
      { property: "og:title", content: "Event Management Portal" },
      { property: "og:description", content: "Password recovery instructions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md shadow-xl border rounded-2xl p-6 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Lock className="h-6 w-6" />
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Password Recovery
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Password recovery is managed by your administrator. Please contact your workshop administrator to reset your password. For security reasons, password-reset emails are not sent.
          </p>
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-left space-y-1.5">
          <p className="font-semibold text-primary">
            Please contact your workshop administrator.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Contact an authorized administrator to reset your account credentials directly from the management console.
          </p>
        </div>

        <Button asChild className="w-full font-bold">
          <Link to="/auth">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Sign In
          </Link>
        </Button>
      </Card>
    </div>
  );
}
