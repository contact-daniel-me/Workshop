import { createFileRoute } from "@tanstack/react-router";
import { AuthPortal, type AuthMode } from "@/components/auth/AuthPortal";
import {
  QrCode,
  ShieldCheck,
  CalendarDays,
  FileSpreadsheet,
  CheckCircle,
  Smartphone,
  LockKeyhole,
} from "lucide-react";

export const Route = createFileRoute("/")({
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
      { title: "Event Management Portal — Sign In, Register & View Details" },
      {
        name: "description",
        content: "Event Management Portal: Sign in with mobile number, register participant account, or lookup details.",
      },
      { property: "og:title", content: "Event Management Portal" },
      {
        property: "og:description",
        content: "Event Management Portal: Sign in with mobile number, register participant account, or lookup details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const features = [
  {
    Icon: QrCode,
    t: "Daily Rotating QR Codes",
    d: "Fresh, expiring code for each workshop day. One check-in per participant.",
  },
  {
    Icon: ShieldCheck,
    t: "Admin Verification",
    d: "Organiser review of profile photograph and verified attendance tracking.",
  },
  {
    Icon: CalendarDays,
    t: "Attendance Calendar",
    d: "Real-time overview of present, absent, and pending attendance sessions.",
  },
  {
    Icon: FileSpreadsheet,
    t: "Excel Attendance Reports",
    d: "Instant export of master sheets, daily logs, and individual participation records.",
  },
];

function Index() {
  const search = Route.useSearch();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Section with Integrated Auth Portal */}
      <section className="bg-hero text-primary-foreground py-10 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            {/* Left side: Information and workshop branding */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold backdrop-blur-xs">
                <QrCode className="h-4 w-4" />
                Event Management Portal
              </div>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
                Every Presence Matters.
              </h1>

              <p className="max-w-2xl text-base sm:text-lg opacity-85 leading-relaxed">
                Log in with your email address or mobile number, submit your participant registration, or look up your
                approval status and attendance records directly below.
              </p>

              {/* Key Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/15">
                <div className="flex items-start gap-2.5">
                  <Smartphone className="h-5 w-5 mt-0.5 text-accent opacity-90" />
                  <div>
                    <h4 className="font-semibold text-sm">Email & Phone Login</h4>
                    <p className="text-xs opacity-75">Sign in with either identifier seamlessly</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <CheckCircle className="h-5 w-5 mt-0.5 text-accent opacity-90" />
                  <div>
                    <h4 className="font-semibold text-sm">Instant Lookup</h4>
                    <p className="text-xs opacity-75">View details by 10-digit mobile number</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <LockKeyhole className="h-5 w-5 mt-0.5 text-accent opacity-90" />
                  <div>
                    <h4 className="font-semibold text-sm">Verified Security</h4>
                    <p className="text-xs opacity-75">Admin review and encrypted storage</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side: The Interactive Auth & Details Lookup Card */}
            <div className="lg:col-span-5 flex justify-center lg:justify-end">
              <AuthPortal
                initialMode={search.mode ?? "login"}
                redirectTo={search.redirect}
                className="w-full text-foreground shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights Section */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 flex-1">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold">Portal Capabilities</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete workshop attendance management built with Supabase, dynamic QR, and real-time records.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ Icon, t, d }) => (
            <div
              key={t}
              className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-base text-foreground">{t}</h3>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
