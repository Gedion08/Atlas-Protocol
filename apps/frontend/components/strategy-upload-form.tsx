"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import type { ManagerProfile, StrategyType, StrategyUpload } from "atlas-types";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bs58Encode } from "@/lib/format";

const STRATEGY_TYPES: StrategyType[] = [
  "passive",
  "active",
  "rule-based",
  "scheduled",
  "adaptive",
  "ai-assisted",
];

const PROTOCOLS = [
  "meteora",
  "orca",
  "raydium",
  "kamino",
  "jupiter",
  "drift",
  "sanctum",
  "marinade",
] as const;

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary";

interface Props {
  managers: ManagerProfile[];
}

export function StrategyUploadForm({ managers }: Props) {
  const queryClient = useQueryClient();
  const { connected, publicKey, signMessage } = useWallet();
  const [managerId, setManagerId] = useState(managers[0]?.id ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState<StrategyType>("passive");
  const [protocol, setProtocol] = useState<string>("meteora");
  const [pool, setPool] = useState("");
  const [pair, setPair] = useState("");
  const [managementBps, setManagementBps] = useState("50");
  const [performanceBps, setPerformanceBps] = useState("1500");
  const [riskTier, setRiskTier] = useState("1");
  const [description, setDescription] = useState("");
  const [params, setParams] = useState("");
  const [signature, setSignature] = useState("");
  const [signing, setSigning] = useState(false);
  const [nonce, setNonce] = useState("");
  const [messageToSign, setMessageToSign] = useState("");

  const selectedManager = managers.find((m) => m.id === managerId);
  const walletCanSign = connected && publicKey !== null && typeof signMessage === "function";

  const mutation = useMutation({
    mutationFn: (args: {
      upload: StrategyUpload;
      owner: string;
      nonce: string;
      signature: string;
    }) => api.uploadStrategy(args.upload, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
      setName("");
      setPool("");
      setPair("");
      setParams("");
      setSignature("");
      setNonce("");
      setMessageToSign("");
    },
  });

  const activeManagers = managers.filter((m) => m.status === "active");

  async function signWithWallet(): Promise<void> {
    if (!selectedManager || !signMessage) return;
    setSigning(true);
    try {
      const nextNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const upload = buildUpload();
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(upload)),
      );
      const payloadSha256 = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const message = ["atlas.request v1", selectedManager.owner, nextNonce, payloadSha256].join(
        "\n",
      );
      const sig = await signMessage(new TextEncoder().encode(message));
      setSignature(bs58Encode(sig));
      setNonce(nextNonce);
      setMessageToSign(message);
    } finally {
      setSigning(false);
    }
  }

  function buildUpload(): StrategyUpload {
    let parsedParams: Record<string, unknown> | undefined;
    if (params.trim() !== "") {
      try {
        parsedParams = JSON.parse(params);
      } catch {
        return undefined as unknown as StrategyUpload;
      }
    }
    return {
      managerId,
      name,
      type,
      protocol: protocol as (typeof PROTOCOLS)[number],
      pool,
      pair,
      fees: { managementBps: Number(managementBps), performanceBps: Number(performanceBps) },
      riskTier: Number(riskTier) as 1 | 2 | 3 | 4 | 5,
      description: description || undefined,
      params: parsedParams,
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedManager) return;
    const upload = buildUpload();
    if (!upload) return;
    if (!signature) {
      const nextNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(upload)),
      );
      const payloadSha256 = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setNonce(nextNonce);
      setMessageToSign(
        ["atlas.request v1", selectedManager.owner, nextNonce, payloadSha256].join("\n"),
      );
      if (walletCanSign) {
        await signWithWallet();
      }
      return;
    }
    mutation.mutate({
      upload,
      owner: selectedManager.owner,
      nonce,
      signature,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload a strategy</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Manager</span>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className={inputClass}
            >
              {activeManagers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className={inputClass}
              placeholder="BTC/SOL Conservative"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as StrategyType)}
              className={inputClass}
            >
              {STRATEGY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Protocol</span>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              className={inputClass}
            >
              {PROTOCOLS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Risk tier</span>
            <select
              value={riskTier}
              onChange={(e) => setRiskTier(e.target.value)}
              className={inputClass}
            >
              {[1, 2, 3, 4, 5].map((t) => (
                <option key={t} value={t}>
                  T{t}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Pool</span>
            <input
              value={pool}
              onChange={(e) => setPool(e.target.value)}
              required
              className={inputClass}
              placeholder="BTC-SOL DLMM"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Pair</span>
            <input
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              required
              className={inputClass}
              placeholder="BTC/SOL"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Mgmt fee (bps)</span>
            <input
              type="number"
              min={0}
              max={5000}
              value={managementBps}
              onChange={(e) => setManagementBps(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Perf fee (bps)</span>
            <input
              type="number"
              min={0}
              max={10000}
              value={performanceBps}
              onChange={(e) => setPerformanceBps(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              className={inputClass}
              placeholder="Concentrated passive range"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Params (JSON)</span>
            <input
              value={params}
              onChange={(e) => setParams(e.target.value)}
              className={inputClass}
              placeholder='{"spreadBps": 30, "bins": 40}'
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={mutation.isPending || !name || !pool || !pair}>
              {mutation.isPending ? "Uploading…" : "Upload strategy"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!selectedManager || !walletCanSign || signing}
              onClick={() => void signWithWallet()}
            >
              {signing ? "Waiting for wallet…" : "Sign with wallet"}
            </Button>
            {mutation.isError && <Badge variant="destructive">{mutation.error.message}</Badge>}
            {mutation.isSuccess && (
              <Badge variant="positive">Uploaded v{mutation.data.version}</Badge>
            )}
          </div>
          <label className="space-y-1 sm:col-span-2 lg:col-span-3">
            <span className="text-xs text-muted-foreground">
              Signature (base58) — signs &quot;atlas.request v1 + owner + nonce + payload
              hash&quot;.{" "}
              {walletCanSign
                ? 'Click "Sign with wallet", or paste a signature from your own tooling.'
                : "Connect the manager-owner wallet to sign, or sign the message with your own tooling and paste the signature here."}
            </span>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              className={inputClass}
              placeholder="base58 ed25519 detached signature"
            />
            {messageToSign !== "" && (
              <pre className="mt-1 max-h-24 overflow-auto rounded-md border border-border bg-muted p-2 text-[11px] whitespace-pre-wrap break-all text-muted-foreground">
                Sign this exact message (UTF-8):{"\n"}
                {messageToSign}
              </pre>
            )}
          </label>
        </form>
      </CardContent>
    </Card>
  );
}
