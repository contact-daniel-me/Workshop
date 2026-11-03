import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error("Application error:", error);
  const router = useRouter();
  const errorMessage = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  const isDynamicImportError =
    errorMessage.includes("Failed to fetch dynamically imported module") ||
    errorMessage.includes("Importing a module script failed") ||
    errorMessage.includes("error loading dynamically imported module");

  // Auto-recover from stale chunks after a new deployment
  useEffect(() => {
    if (isDynamicImportError && typeof window !== "undefined") {
      const key = "last_chunk_reload";
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - Number(last) > 10000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
      }
    }
  }, [isDynamicImportError]);

  const handleAction = () => {
    if (isDynamicImportError && typeof window !== "undefined") {
      window.location.reload();
    } else {
      router.invalidate();
      reset();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {isDynamicImportError ? "Application Update Available" : "This page didn't load"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isDynamicImportError
            ? "A newer version of the portal was deployed. Please refresh your browser to load the latest update."
            : "Something went wrong on our end. You can try refreshing or head back home."}
        </p>
        {errorMessage && (
          <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-xs text-left overflow-auto max-h-36 font-mono border border-destructive/20">
            {errorMessage}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={handleAction}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
          >
            {isDynamicImportError ? "Refresh Page" : "Try again"}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Event Management Portal" },
      { name: "description", content: "Secure QR-based attendance tracking and event management." },
      { name: "author", content: "Event Management" },
      { property: "og:title", content: "Event Management Portal" },
      { property: "og:description", content: "Secure QR-based attendance tracking and event management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap" },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // Handle stale chunk reload after new deployments seamlessly without hydration mismatch
  useEffect(() => {
    const handlePreloadError = () => {
      const k = "vite_chunk_reload";
      const last = sessionStorage.getItem(k);
      const now = Date.now();
      if (!last || now - Number(last) > 8000) {
        sessionStorage.setItem(k, String(now));
        window.location.reload();
      }
    };
    window.addEventListener("vite:preloadError", handlePreloadError);
    return () => window.removeEventListener("vite:preloadError", handlePreloadError);
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster richColors />
    </QueryClientProvider>
  );
}
