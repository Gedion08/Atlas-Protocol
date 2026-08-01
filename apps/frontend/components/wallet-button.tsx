"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { formatAddress } from "@/lib/format";

export function WalletButton() {
  const { wallets, select, connect, disconnect, connected, publicKey } = useWallet();
  const [open, setOpen] = useState(false);

  if (connected && publicKey) {
    return (
      <Button variant="outline" size="sm" onClick={() => disconnect()}>
        {formatAddress(publicKey.toBase58())}
      </Button>
    );
  }

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        Connect Wallet
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border bg-card p-1 shadow-lg">
          {wallets.map((wallet) => (
            <button
              key={wallet.adapter.name}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={async () => {
                try {
                  await select(wallet.adapter.name);
                  await connect();
                } catch {
                  alert("Wallet connection failed");
                }
                setOpen(false);
              }}
            >
              {wallet.adapter.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
