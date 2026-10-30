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
    mode: (["login", "lookup", "forgot"].includes(s["mode"] as string)
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
        content: "Event Management Portal: Sign in with email or mobile number, or look up attendance details.",
      },
      { property: "og:title", content: "Event Management Portal" },
      {
        property: "og:description",
        content: "Event Management Portal: Sign in with email or mobile number, or look up attendance details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const instructions = [
  {
    step: "01",
    Icon: Smartphone,
    t: "Admin Enrollment",
    d: "Your workshop administrator enrolls your participant profile with your email, mobile number, and reference photograph.",
  },
  {
    step: "02",
    Icon: ShieldCheck,
    t: "Verification & Sign In",
    d: "Sign in using your registered mobile number or email and password provided by the workshop administration.",
  },
  {
    step: "03",
    Icon: QrCode,
    t: "Show Daily Attendance QR",
    d: "Sign in each workshop session to generate your secure daily rotating QR code and present it to the organizer.",
  },
  {
    step: "04",
    Icon: CalendarDays,
    t: "Track Attendance & Reports",
    d: "Monitor your session attendance status in real time and download your individual participation report anytime.",
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
                Log in with your email address or mobile number, or look up your
                approval status and attendance records directly below.
              </p>

              {/* Key Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/15">
                <div className="flex items-start gap-2.5">
                  <Smartphone className="h-5 w-5 mt-0.5 text-accent opacity-90 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm">Email & Phone Login</h4>
                    <p className="text-xs opacity-75">Sign in with either identifier seamlessly</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <CheckCircle className="h-5 w-5 mt-0.5 text-accent opacity-90 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm">Instant Lookup</h4>
                    <p className="text-xs opacity-75">View details by 10-digit mobile number</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <LockKeyhole className="h-5 w-5 mt-0.5 text-accent opacity-90 shrink-0" />
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

      {/* Instructions & Guidelines Section */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 flex-1">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold">Instructions</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Follow these essential steps to register, verify your profile, and record your workshop attendance.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {instructions.map(({ step, Icon, t, d }) => (
            <div
              key={t}
              className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-[11px] font-bold text-muted-foreground/75 bg-muted px-2 py-0.5 rounded-md">
                    STEP {step}
                  </span>
                </div>
                <h3 className="font-semibold text-base text-foreground">{t}</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
