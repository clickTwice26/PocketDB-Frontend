import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PocketDB — Sign in",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      {children}
    </div>
  );
}
