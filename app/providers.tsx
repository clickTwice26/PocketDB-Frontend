"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "react-hot-toast";
import { useState, useEffect } from "react";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { TooltipProvider } from "@/components/ui/tooltip";
config.autoAddCss = false;

const THEME_BG: Record<string, string> = {
  dark: "#0f1117",
  light: "#f0f4fb",
  diu: "#09100c",
};

function ThemeApplicator() {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", theme);
    html.style.background = THEME_BG[theme] ?? THEME_BG.dark;
    if (theme === "light") {
      html.classList.remove("dark");
    } else {
      html.classList.add("dark");
    }
  }, [theme]);

  return null;
}

/** Bootstraps the auth session on every page load by hitting /auth/me. */
function AuthBootstrap() {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  useEffect(() => {
    fetchMe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2000,
            retry: 2,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={400}>
        <ThemeApplicator />
        <AuthBootstrap />
        {children}
        <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#1a1d27",
            color: "#e2e8f0",
            border: "1px solid #2d3148",
            borderRadius: "12px",
            fontSize: "13px",
            fontFamily: "\"DM Sans\", system-ui, sans-serif",
          },
          success: { iconTheme: { primary: "#22c55e", secondary: "#1a1d27" } },
          error: { iconTheme: { primary: "#ef4444", secondary: "#1a1d27" } },
        }}
      />
      <ReactQueryDevtools initialIsOpen={false} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
