import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthPortal, type AuthMode } from "@/components/auth/AuthPortal";
import { QrCode } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    mode: (["login", "register", "lookup", "forgot"].includes(s["mode"] as string)
      ? s["mode"]
      : undefined) as AuthMode | undefined,
    redirect: typeof s["redirect"] === "string" && s["redirect"].startsWith("/")
      ? s["redirect"]
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Event Management Portal" },
      {
        name: "description",
        content: "Email and mobile phone login and registration for Event Management Portal.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left hero panel */}
      <div className="hidden bg-hero p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold">
          <QrCode className="h-6 w-6" /> Event Management Portal
        </Link>
        <div className="space-y-4 max-w-md">
          <h2 className="font-display text-3xl font-bold leading-tight">
            Event Management Portal
          </h2>
          <p className="text-sm opacity-85 leading-relaxed">
            Sign in with your email or mobile number, scan daily rotating QR codes, and track verified attendance in real time.
          </p>
        </div>
        <p className="text-xs opacity-75">Event Management Portal</p>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <AuthPortal
          initialMode={search.mode ?? "login"}
          redirectTo={search.redirect}
          className="shadow-lg border"
        />
      </div>
    </div>
  );
}
