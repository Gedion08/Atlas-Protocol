import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { allocate, DEFAULT_ALLOCATION_CONSTRAINTS } from "../services/allocation/index.js";
import { computeSharePricing } from "../services/pricing/index.js";
import { requireWalletSignature, NonceStore } from "../services/auth/signature.js";
import type { VaultClient } from "../services/vault/index.js";

const addressParam = z.object({ address: z.string().min(1) });

export async function registerVaultRoutes(
  app: FastifyInstance,
  repos: Repositories,
  vaultClient?: VaultClient,
  nonces: NonceStore = new NonceStore(),
): Promise<void> {
  app.get(
    "/api/v1/vaults",
    {
      schema: {
        tags: ["vaults"],
        response: {
          200: { type: "object", additionalProperties: true, properties: { data: { type: "array" } } },
        },
      },
    },
    async () => {
      const raw = await repos.vaults.list();
      const vaults = vaultClient ? await vaultClient.listVaults(raw) : raw;
      return {
        data: vaults.map((v) => ({
          ...v,
          allocation: v.allocation ?? allocate([], v.tvl, DEFAULT_ALLOCATION_CONSTRAINTS),
        })),
      };
    },
  );

  app.get(
    "/api/v1/vaults/:address",
    {
      schema: {
        tags: ["vaults"],
        params: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
        response: {
          200: { type: "object", additionalProperties: true, properties: { data: { type: "object", additionalProperties: true } } },
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { address } = addressParam.parse(request.params);
      let vault = await repos.vaults.get(address);
      if (!vault) return reply.status(404).send({ error: "vault_not_found", message: "Vault not found", statusCode: 404 });
      if (vaultClient) vault = await vaultClient.enrichVault(vault);
      return { data: vault };
    },
  );

  app.get(
    "/api/v1/vaults/:address/strategies",
    {
      schema: {
        tags: ["vaults"],
        params: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
      },
    },
    async (request, reply) => {
      const { address } = addressParam.parse(request.params);
      const vault = await repos.vaults.get(address);
      if (!vault) return reply.status(404).send({ error: "vault_not_found", message: "Vault not found", statusCode: 404 });
      const strategies = await repos.strategies.list({ managerId: vault.managerId });
      return { data: strategies };
    },
  );

  app.get(
    "/api/v1/vaults/:address/pricing",
    {
      schema: {
        tags: ["vaults"],
        params: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
      },
    },
    async (request, reply) => {
      const { address } = addressParam.parse(request.params);
      let vault = await repos.vaults.get(address);
      if (!vault) return reply.status(404).send({ error: "vault_not_found", message: "Vault not found", statusCode: 404 });
      if (vaultClient) vault = await vaultClient.enrichVault(vault);
      return { data: computeSharePricing(vault) };
    },
  );

  app.post(
    "/api/v1/vaults/:address/reallocate",
    {
      schema: {
        tags: ["vaults"],
        params: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
        response: {
          200: { type: "object", additionalProperties: true, properties: { data: { type: "object", additionalProperties: true } } },
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { address } = addressParam.parse(request.params);
      const vault = await repos.vaults.get(address);
      if (!vault) return reply.status(404).send({ error: "vault_not_found", message: "Vault not found", statusCode: 404 });

      const managers = await repos.managers.list();
      const allocations = allocate(
        managers
          .filter((m) => m.status === "active")
          .map((m) => ({
            id: m.id,
            riskScore: m.score.risk,
            managerScore: m.score.total,
            tvl: m.tvl,
            feeEfficiency: Math.min(1, m.feesGenerated / Math.max(1, m.tvl * 0.02)),
            sharpe: 1.5,
            impermanentLoss: m.maxDrawdown,
            volatility: m.score.risk,
            consistency: m.score.consistency,
            utilization: 0.8,
            ageDays: m.yearsActive * 365,
          })),
        vault.tvl,
        DEFAULT_ALLOCATION_CONSTRAINTS,
      );

      return { data: { ...vault, allocation: allocations, lastRebalanceAt: Date.now() } };
    },
  );

  app.post(
    "/api/v1/vaults/:address/emergency-exit",
    { schema: { tags: ["vaults"] } },
    async (request, reply) => {
      const { address } = addressParam.parse(request.params);
      const vault = await repos.vaults.get(address);
      if (!vault) return reply.status(404).send({ error: "vault_not_found", message: "Vault not found", statusCode: 404 });
      if (!vault.onchain) {
        return reply.status(400).send({ error: "not_onchain_vault", message: "Vault does not support on-chain transactions", statusCode: 400 });
      }

      const owner = request.headers["x-atlas-owner"] as string | undefined;
      if (!owner) {
        return reply.status(401).send({ error: "unauthorized", message: "x-atlas-owner header is required", statusCode: 401 });
      }

      const auth = requireWalletSignature({
        nonces,
        ownerHeader: owner,
        nonceHeader: request.headers["x-atlas-nonce"] as string | undefined,
        signatureHeader: request.headers["x-atlas-signature"] as string | undefined,
        body: request.body,
        expectedOwner: owner,
      });
      if (!auth.ok) {
        return reply.status(auth.statusCode ?? 401).send(auth);
      }

      if (!vaultClient) {
        return reply.status(501).send({ error: "onchain_unavailable", message: "On-chain vault client not configured", statusCode: 501 });
      }

      const result = await vaultClient.buildInvestTransaction({
        meta: vault.onchain,
        owner,
        action: "emergency_exit",
      });

      return {
        data: {
          transaction: result.transaction.serialize({ requireAllSignatures: false }).toString("base64"),
          blockhash: result.transaction.recentBlockhash,
        },
      };
    },
  );
}
