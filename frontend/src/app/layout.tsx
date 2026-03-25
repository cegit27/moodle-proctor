import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProctorVision - Teacher Dashboard",
  description: "Teacher operations dashboard for online proctoring and exam monitoring."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
