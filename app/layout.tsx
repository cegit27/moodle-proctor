import "./globals.css";

export const metadata = {
  title: "Teacher Dashboard",
  description: "AI Proctoring Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}