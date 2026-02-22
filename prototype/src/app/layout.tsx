import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Arternal Inventory Browser",
  description: "Browse your gallery inventory",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <header className="bg-gray-900 text-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <a href="/" className="text-lg font-semibold tracking-tight hover:text-gray-300 transition-colors">
              Arternal
            </a>
            <nav className="flex gap-1">
              <a
                href="/"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Inventory
              </a>
              <a
                href="/artists"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Artists
              </a>
              <a
                href="/contacts"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Contacts
              </a>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
