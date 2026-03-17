import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProctorVision - Teacher Dashboard",
  description: "Modern teacher monitoring console for online proctoring exams."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-slate-100">
        <div className="min-h-screen bg-slate-950">
          <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 lg:px-6">{children}</div>
        </div>
      </body>
    </html>
  );
}
