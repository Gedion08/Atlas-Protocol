import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { env } from "../../env.js";

export interface HeliusTransaction {
  signature: string;
  timestamp: number;
  slot: number;
  type?: string;
  description?: string;
  nativeTransfers?: Array<{ amount: number }>;
  events?: Record<string, unknown>;
  accountData?: Array<{ account: string }>;
}

export type AtlasEventType =
  | "deposit"
  | "withdraw"
  | "swap"
  | "rebalance"
  | "fee_collected"
  | "position_open"
  | "position_close"
  | "emergency_exit";

export interface AtlasEvent {
  type: AtlasEventType;
  signature: string;
  timestamp: number;
  slot: number;
  vaultAddress: string;
  managerId: string;
  strategyId?: string;
  payload: Record<string, unknown>;
}

export interface EventBus {
  publish(event: AtlasEvent): Promise<void>;
  subscribe(handler: (event: AtlasEvent) => void): void;
}

export class MemoryEventBus implements EventBus {
  private handlers: Array<(event: AtlasEvent) => void> = [];

  async publish(event: AtlasEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error("event handler failed", err);
      }
    }
  }

  subscribe(handler: (event: AtlasEvent) => void): void {
    this.handlers.push(handler);
  }
}

export function createEventBus(): EventBus {
  return new MemoryEventBus();
}

export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(signature, "hex");

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function getRawBody(request: FastifyRequest): Promise<Buffer> {
  return Buffer.from(JSON.stringify(request.body));
}

export function normalizeHeliusWebhook(body: {
  transactions?: HeliusTransaction[];
}): AtlasEvent[] {
  return (body.transactions ?? []).map((tx) => {
    let vaultAddress = "";
    if (tx.accountData) {
      for (const acc of tx.accountData) {
        if (acc.account) {
          vaultAddress = acc.account;
          break;
        }
      }
    }
    if (!vaultAddress && tx.description) {
      const match = tx.description.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
      if (match) vaultAddress = match[0];
    }
    return {
      type: (tx.type as AtlasEventType) ?? "swap",
      signature: tx.signature,
      timestamp: tx.timestamp,
      slot: tx.slot,
      vaultAddress,
      managerId: "",
      payload: {
        description: tx.description,
        events: tx.events,
        nativeTransfers: tx.nativeTransfers,
      },
    };
  });
}
