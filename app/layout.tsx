import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "PocketDB",
  description: "Lightweight database cluster manager — spin up Docker-powered PostgreSQL, MySQL & Redis in seconds.",
  icons: { icon: "/favicon.ico" },
};

// Blocking script: runs synchronously before the first paint.
// Sets data-theme, dark/light class, AND the background color directly
// as an inline style so no dark flash occurs even when Turbopack loads
// CSS asynchronously in development mode.
const themeScript = `
(function(){
  var BG = { dark: '#0f1117', light: '#f0f4fb', diu: '#09100c' };
  var theme = 'dark';
  try {
    var s = localStorage.getItem('pocketdb-ui');
    if (s) { var parsed = JSON.parse(s); if (parsed && parsed.state && parsed.state.theme) theme = parsed.state.theme; }
  } catch(e) {}
  var el = document.documentElement;
  el.setAttribute('data-theme', theme);
  el.style.background = BG[theme] || BG.dark;
  if (theme === 'light') {
    el.classList.remove('dark');
  } else {
    el.classList.add('dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
