import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/providers";
import { WalletButton } from "@/components/wallet-button";

export const metadata: Metadata = {
  title: "Atlas Protocol",
  description: "The decentralized operating system for professional liquidity providers",
};

const nav = [
  { href: "/", label: "Invest" },
  { href: "/strategies", label: "Strategies" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/dao", label: "DAO" },
  { href: "/protocol", label: "Protocol" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>
          <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">A</span>
                  Atlas Protocol
                </Link>
                <nav className="hidden items-center gap-1 md:flex">
                  {nav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
              <WalletButton />
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground">
            Atlas Protocol does not generate yield. It allocates capital to verified LP managers based on transparent on-chain performance.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
