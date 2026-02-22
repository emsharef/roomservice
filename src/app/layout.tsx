import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gallery AI Toolkit",
  description: "AI-powered companion for gallery management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
            <span className="text-lg font-semibold tracking-tight">
              Gallery AI Toolkit
            </span>
            <nav>{/* nav links will go here */}</nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
