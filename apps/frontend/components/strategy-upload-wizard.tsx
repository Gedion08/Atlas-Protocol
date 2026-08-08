"use client";

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import type { ManagerProfile, StrategyType, StrategyUpload } from "atlas-types";
import { STRATEGY_PARAMS } from "atlas-types";
import { api } from "@/lib/api";
import { bs58Encode } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

type Step = 1 | 2 | 3 | 4;

export function StrategyUploadWizard({ managers }: Props) {
  const queryClient = useQueryClient();
  const { connected, publicKey, signMessage } = useWallet();

  const activeManagers = managers.filter((m) => m.status === "active");

  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [managerId, setManagerId] = useState(activeManagers[0]?.id ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState<StrategyType>("passive");
  const [protocol, setProtocol] = useState<string>("meteora");
  const [pool, setPool] = useState("");
  const [pair, setPair] = useState("");
  const [managementBps, setManagementBps] = useState("50");
  const [performanceBps, setPerformanceBps] = useState("1500");
  const [riskTier, setRiskTier] = useState("1");
  const [description, setDescription] = useState("");

  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [jsonOverride, setJsonOverride] = useState("");

  const [signature, setSignature] = useState("");
  const [signing, setSigning] = useState(false);
  const [nonce, setNonce] = useState("");
  const [messageToSign, setMessageToSign] = useState("");

  const selectedManager = activeManagers.find((m) => m.id === managerId);
  const walletCanSign = connected && publicKey !== null && typeof signMessage === "function";

  const paramFields = useMemo(() => {
    const typeMap = STRATEGY_PARAMS[type];
    const def = typeMap?.[protocol as keyof typeof typeMap] ?? typeMap?.default;
    const properties = (def?.schema.properties as Record<string, { type?: string; minimum?: number; maximum?: number; minItems?: number }> | undefined) ?? {};
    const fields: { key: string; label: string; type: string; min?: number; max?: number; defaultVal: string }[] = [];
    for (const [key, spec] of Object.entries(properties)) {
      const defaultVal = def?.defaults?.[key] != null ? String(def.defaults[key]) : "";
      fields.push({
        key,
        label: key,
        type: spec.type === "number" ? "number" : spec.type === "array" ? "text" : "text",
        min: spec.minimum,
        max: spec.maximum,
        defaultVal,
      });
    }
    return fields;
  }, [type, protocol]);

  const generatedParams = useMemo(() => {
    const typeMap = STRATEGY_PARAMS[type];
    const def = typeMap?.[protocol as keyof typeof typeMap] ?? typeMap?.default;
    const params: Record<string, unknown> = { ...(def?.defaults ?? {}) };
    for (const field of paramFields) {
      const raw = paramValues[field.key];
      if (raw === undefined || raw === "") continue;
      if (field.type === "number") {
        const n = Number(raw);
        params[field.key] = Number.isNaN(n) ? field.defaultVal : n;
      } else if (field.type === "array") {
        try {
          params[field.key] = JSON.parse(raw);
        } catch {
          params[field.key] = raw.split(",").map((s) => s.trim()).filter(Boolean);
        }
      } else {
        params[field.key] = raw;
      }
    }
    if (jsonOverride.trim() !== "") {
      try {
        Object.assign(params, JSON.parse(jsonOverride));
      } catch {
        // ignore override parse errors
      }
    }
    return params;
  }, [type, protocol, paramFields, paramValues, jsonOverride]);

  const generatedJson = useMemo(() => JSON.stringify(generatedParams, null, 2), [generatedParams]);

  const mutation = useMutation({
    mutationFn: (args: { upload: StrategyUpload; owner: string; nonce: string; signature: string }) =>
      api.uploadStrategy(args.upload, { owner: args.owner, nonce: args.nonce, signature: args.signature }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
      resetForm();
      setStep(1);
    },
  });

  function resetForm() {
    setManagerId(activeManagers[0]?.id ?? "");
    setName("");
    setType("passive");
    setProtocol("meteora");
    setPool("");
    setPair("");
    setManagementBps("50");
    setPerformanceBps("1500");
    setRiskTier("1");
    setDescription("");
    setParamValues({});
    setJsonOverride("");
    setSignature("");
    setNonce("");
    setMessageToSign("");
    setError(null);
  }

  function buildUpload(): StrategyUpload {
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
      params: generatedParams,
    };
  }

  async function signWithWallet(): Promise<void> {
    if (!selectedManager || !signMessage) return;
    setSigning(true);
    setError(null);
    try {
      const nextNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const upload = buildUpload();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(upload)));
      const payloadSha256 = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const message = ["atlas.request v1", selectedManager.owner, nextNonce, payloadSha256].join("\n");
      const sig = await signMessage(new TextEncoder().encode(message));
      setSignature(bs58Encode(sig));
      setNonce(nextNonce);
      setMessageToSign(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signing failed");
    } finally {
      setSigning(false);
    }
  }

  function handleSignOnly() {
    if (!selectedManager || !walletCanSign) return;
    void signWithWallet();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedManager) return;
    if (!signature) {
      handleSignOnly();
      return;
    }
    mutation.mutate({
      upload: buildUpload(),
      owner: selectedManager.owner,
      nonce,
      signature,
    });
  }

  function canProceedStep1(): boolean {
    return !!managerId && name.trim().length > 0 && !!pool && !!pair;
  }

  function canProceedStep2(): boolean {
    return true;
  }

  function canProceedStep3(): boolean {
    return true;
  }

  const protocolHint = useMemo(() => {
    if (type === "passive") {
      if (protocol === "meteora" || protocol === "orca" || protocol === "raydium") {
        return "For CLMM/DLMM pools, use spreadBps and bins to configure your range.";
      }
      if (protocol === "sanctum" || protocol === "marinade") {
        return "For LST protocols, focus on rebalanceThresholdBps and maxSlippageBps.";
      }
    }
    if (type === "active") {
      if (protocol === "jupiter" || protocol === "drift") {
        return "For DEX/perp protocols, configure leverage, stop-loss, and take-profit levels.";
      }
    }
    return "Configure strategy-specific parameters below.";
  }, [type, protocol]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload a strategy</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="mb-4 flex items-center gap-2">
            {([1, 2, 3, 4] as Step[]).map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    step === s
                      ? "bg-primary text-primary-foreground"
                      : s < step
                        ? "bg-green-600 text-white"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {s < step ? "✓" : s}
                </div>
                {s < 4 && <div className="h-px w-6 bg-border" />}
              </div>
            ))}
            <span className="ml-2 text-xs text-muted-foreground">
              {step === 1 && "Basic info"}
              {step === 2 && "Market & fees"}
              {step === 3 && "Parameters"}
              {step === 4 && "Review & submit"}
            </span>
          </div>

          {step === 1 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Manager</span>
                <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className={inputClass}>
                  {activeManagers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-muted-foreground">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className={inputClass} placeholder="BTC/SOL Conservative" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Type</span>
                <select value={type} onChange={(e) => setType(e.target.value as StrategyType)} className={inputClass}>
                  {STRATEGY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Protocol</span>
                <select value={protocol} onChange={(e) => setProtocol(e.target.value)} className={inputClass}>
                  {PROTOCOLS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Risk tier</span>
                <select value={riskTier} onChange={(e) => setRiskTier(e.target.value)} className={inputClass}>
                  {[1, 2, 3, 4, 5].map((t) => (
                    <option key={t} value={t}>
                      T{t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Pool</span>
                <input value={pool} onChange={(e) => setPool(e.target.value)} required className={inputClass} placeholder="BTC-SOL DLMM" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Pair</span>
                <input value={pair} onChange={(e) => setPair(e.target.value)} required className={inputClass} placeholder="BTC/SOL" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Mgmt fee (bps)</span>
                <input type="number" min={0} max={5000} value={managementBps} onChange={(e) => setManagementBps(e.target.value)} className={inputClass} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Perf fee (bps)</span>
                <input type="number" min={0} max={10000} value={performanceBps} onChange={(e) => setPerformanceBps(e.target.value)} className={inputClass} />
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-muted-foreground">Description</span>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} className={inputClass} placeholder="Concentrated passive range" />
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="mb-2 text-xs text-muted-foreground">{protocolHint}</p>
              </div>
              {paramFields.map((field) => (
                <label key={field.key} className="space-y-1">
                  <span className="text-xs text-muted-foreground">
                    {field.label}
                    {field.min != null && field.max != null && (
                      <span className="ml-1 text-muted-foreground/70">({field.min}–{field.max})</span>
                    )}
                  </span>
                  <Input
                    type={field.type}
                    min={field.min}
                    max={field.max}
                    value={paramValues[field.key] ?? ""}
                    onChange={(e) =>
                      setParamValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={`Default: ${field.defaultVal}`}
                  />
                </label>
              ))}
              <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                <span className="text-xs text-muted-foreground">Params JSON (auto-generated; override if needed)</span>
                <Textarea
                  value={jsonOverride}
                  onChange={(e) => setJsonOverride(e.target.value)}
                  className={inputClass}
                  placeholder={generatedJson}
                />
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-muted-foreground">Generated JSON:</p>
                <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-border bg-muted p-2 text-[11px] whitespace-pre-wrap break-all text-muted-foreground">
                  {generatedJson}
                </pre>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Basic info</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div><span className="text-xs text-muted-foreground">Manager</span><p className="text-sm font-medium">{selectedManager?.name ?? managerId}</p></div>
                  <div><span className="text-xs text-muted-foreground">Name</span><p className="text-sm font-medium">{name}</p></div>
                  <div><span className="text-xs text-muted-foreground">Type</span><p className="text-sm font-medium capitalize">{type}</p></div>
                  <div><span className="text-xs text-muted-foreground">Protocol</span><p className="text-sm font-medium capitalize">{protocol}</p></div>
                  <div><span className="text-xs text-muted-foreground">Risk tier</span><p className="text-sm font-medium">T{riskTier}</p></div>
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Market & fees</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div><span className="text-xs text-muted-foreground">Pool</span><p className="text-sm font-medium">{pool}</p></div>
                  <div><span className="text-xs text-muted-foreground">Pair</span><p className="text-sm font-medium">{pair}</p></div>
                  <div><span className="text-xs text-muted-foreground">Mgmt fee</span><p className="text-sm font-medium">{managementBps} bps</p></div>
                  <div><span className="text-xs text-muted-foreground">Perf fee</span><p className="text-sm font-medium">{performanceBps} bps</p></div>
                </div>
              </div>
              {description && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</p>
                  <p className="text-sm">{description}</p>
                </div>
              )}
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Parameters</p>
                <pre className="max-h-60 overflow-auto rounded-md border border-border bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                  {generatedJson}
                </pre>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Wallet signature</p>
                {!selectedManager && (
                  <p className="text-sm text-destructive">No active manager selected.</p>
                )}
                {selectedManager && !walletCanSign && (
                  <p className="text-sm text-muted-foreground">Connect the manager-owner wallet to sign, or sign the message with your own tooling and paste the signature below.</p>
                )}
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" disabled={!selectedManager || !walletCanSign || signing} onClick={() => void signWithWallet()}>
                    {signing ? "Waiting for wallet…" : "Sign with wallet"}
                  </Button>
                  {signature && <Badge variant="positive">Signed</Badge>}
                </div>
                {messageToSign !== "" && (
                  <pre className="mt-2 max-h-24 overflow-auto rounded-md border border-border bg-muted p-2 text-[11px] whitespace-pre-wrap break-all text-muted-foreground">
                    Sign this exact message (UTF-8):
                    {"\n"}
                    {messageToSign}
                  </pre>
                )}
                <label className="mt-3 block space-y-1">
                  <span className="text-xs text-muted-foreground">Signature (base58) — signs "atlas.request v1 + owner + nonce + payload hash"</span>
                  <Input
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    className={inputClass}
                    placeholder="base58 ed25519 detached signature"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <div>
              {step > 1 && (
                <Button type="button" variant="outline" onClick={() => setStep((s) => (s - 1) as Step)}>
                  Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {mutation.isError && <Badge variant="destructive">{mutation.error.message}</Badge>}
              {mutation.isSuccess && <Badge variant="positive">Uploaded v{mutation.data.version}</Badge>}
              {step < 4 ? (
                <Button type="button" disabled={step === 1 ? !canProceedStep1() : step === 2 ? !canProceedStep2() : !canProceedStep3()}>
                  Next
                </Button>
              ) : (
                <Button type="submit" disabled={mutation.isPending || !selectedManager || !signature}>
                  {mutation.isPending ? "Uploading…" : "Upload strategy"}
                </Button>
              )}
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
