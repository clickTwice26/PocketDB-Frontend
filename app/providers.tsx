"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "react-hot-toast";
import { useState, useEffect } from "react";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { useUIStore } from "@/store/ui";
import { TooltipProvider } from "@/components/ui/tooltip";
config.autoAddCss = false;

function ThemeApplicator() {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", theme);
    // Manage Tailwind's `dark` class — light is the only bright theme
    if (theme === "light") {
      html.classList.remove("dark");
    } else {
      html.classList.add("dark");
    }
  }, [theme]);

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
        {children}
        <Toaster
        position="bottom-right"
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
