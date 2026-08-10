import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "POD Task Dashboard",
  description: "Weekly client task tracking for POD channels",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans" style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
