import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Atlas Protocol",
  description: "The decentralized operating system for professional liquidity providers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground">
            Atlas Protocol does not generate yield. It allocates capital to verified LP managers based on transparent on-chain performance.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
