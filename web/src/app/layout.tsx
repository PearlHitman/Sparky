import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spark",
  description: "Spark Instagram inbox",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="bg-bg text-fg min-h-full flex flex-col">{children}</body>
    </html>
  );
}
