import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { requireWalletSignature, NonceStore } from "../services/auth/signature.js";
import type { VaultClient } from "../services/vault/index.js";

const vaultParam = z.object({ address: z.string().min(1) });
const walletParam = z.object({ wallet: z.string().min(1) });

const depositBody = z.object({
  investor: z.string().min(1),
  amount: z.number().positive(),
  strategyId: z.string().optional(),
});

const withdrawBody = z.object({
  investor: z.string().min(1),
  shares: z.number().positive(),
});

const investBuildBody = z.object({
  action: z.enum(["deposit", "request_withdraw", "settle_withdraw"]),
  /** Base units for `deposit` (token amount * 10^decimals). */
  amount: z.number().int().positive().optional(),
  /** Base units for `request_withdraw`. */
  shares: z.number().int().positive().optional(),
});

export async function registerInvestorRoutes(
  app: FastifyInstance,
  repos: Repositories,
  nonces: NonceStore = new NonceStore(),
  vaultClient?: VaultClient,
): Promise<void> {
  app.get(
    "/api/v1/investors/:wallet/positions",
    { schema: { tags: ["investors"] } },
    async (request) => {
      const { wallet } = walletParam.parse(request.params);
      const positions = await repos.investors.listPositions(wallet);
      if (!vaultClient) return { data: positions };
      const vaults = await vaultClient.listVaults(await repos.vaults.list());
      const chainPositions = await vaultClient.listPositions(wallet, vaults);
      return { data: [...positions, ...chainPositions] };
    },
  );

  app.get(
    "/api/v1/investors/:wallet",
    { schema: { tags: ["investors"] } },
    async (request) => {
      const { wallet } = walletParam.parse(request.params);
      const vaults = vaultClient
        ? await vaultClient.listVaults(await repos.vaults.list())
        : await repos.vaults.list();
      const positions = (await repos.investors.listPositions(wallet)).filter(
        (p) => p.status !== "withdrawn",
      );
      const chainPositions = vaultClient ? await vaultClient.listPositions(wallet, vaults) : [];
      const allPositions = [...positions, ...chainPositions];
      const vaultByAddress = new Map(vaults.map((v) => [v.address, v]));
      const totalInvested = allPositions.reduce((sum, p) => sum + p.amount, 0);
      const currentValue = allPositions.reduce((sum, p) => {
        const vault = vaultByAddress.get(p.vaultAddress);
        if (!vault || vault.sharesOutstanding <= 0) return sum + p.amount;
        const sharePrice = vault.sharePrice ?? vault.tvl / vault.sharesOutstanding;
        return sum + p.shares * sharePrice;
      }, 0);
      const vaultAddresses = [...new Set(allPositions.map((p) => p.vaultAddress))];
      return {
        data: {
          investor: wallet,
          totalInvested,
          currentValue,
          positionCount: allPositions.length,
          positions: allPositions,
          vaults: vaultAddresses,
        },
      };
    },
  );

  app.post(
    "/api/v1/vaults/:address/invest/build",
    {
      schema: {
        tags: ["investors", "vaults"],
        params: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
        body: {
          type: "object",
          required: ["action"],
          properties: {
            action: { type: "string", enum: ["deposit", "request_withdraw", "settle_withdraw"] },
            amount: { type: "integer" },
            shares: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      const { address } = vaultParam.parse(request.params);
      const input = investBuildBody.parse(request.body);
      const owner = request.headers["x-atlas-owner"] as string | undefined;
      if (!owner) {
        return reply.status(401).send({
          error: "unauthorized",
          message: "x-atlas-owner header is required to assemble an on-chain transaction",
          statusCode: 401,
        });
      }
      if (!vaultClient) {
        return reply.status(501).send({
          error: "onchain_unavailable",
          message: "On-chain investing is not enabled on this instance",
          statusCode: 501,
        });
      }
      const vault = await repos.vaults.get(address);
      if (!vault) {
        return reply.status(404).send({ error: "vault_not_found", message: "Vault not found", statusCode: 404 });
      }
      if (!vault.onchain) {
        return reply.status(400).send({
          error: "not_onchain_vault",
          message: "This vault does not support on-chain transactions",
          statusCode: 400,
        });
      }
      if (input.action === "deposit" && !input.amount) {
        return reply.status(400).send({
          error: "amount_required",
          message: "amount (base units) is required for deposit",
          statusCode: 400,
        });
      }
      if (input.action === "request_withdraw" && !input.shares) {
        return reply.status(400).send({
          error: "shares_required",
          message: "shares (base units) is required for request_withdraw",
          statusCode: 400,
        });
      }

      const result = await vaultClient.buildInvestTransaction({
        meta: vault.onchain,
        owner,
        action: input.action,
        amount: input.amount,
        shares: input.shares,
      });

      return {
        data: {
          transaction: result.transaction.serialize({ requireAllSignatures: false }).toString("base64"),
          blockhash: result.transaction.recentBlockhash,
          ataAccounts: result.ataAccounts.map((a) => a.toBase58()),
        },
      };
    },
  );

  app.post(
    "/api/v1/vaults/:address/deposit",
    { schema: { tags: ["investors", "vaults"] } },
    async (request, reply) => {
      const { address } = vaultParam.parse(request.params);
      const input = depositBody.parse(request.body);

      const vault = await repos.vaults.get(address);
      if (!vault) {
        return reply.status(404).send({ error: "vault_not_found", message: "Vault not found", statusCode: 404 });
      }
      if (vault.status !== "active") {
        return reply.status(409).send({
          error: "vault_not_active",
          message: `Vault is ${vault.status}; deposits are paused`,
          statusCode: 409,
        });
      }
      if (input.amount < vault.minDeposit) {
        return reply.status(400).send({
          error: "below_min_deposit",
          message: `Minimum deposit is ${vault.minDeposit} ${vault.baseAsset}`,
          statusCode: 400,
        });
      }

      const auth = requireWalletSignature({
        nonces,
        ownerHeader: request.headers["x-atlas-owner"] as string | undefined,
        nonceHeader: request.headers["x-atlas-nonce"] as string | undefined,
        signatureHeader: request.headers["x-atlas-signature"] as string | undefined,
        body: request.body,
        expectedOwner: input.investor,
      });
      if (!auth.ok) {
        return reply.status(auth.statusCode ?? 401).send(auth);
      }

      const position = await repos.investors.deposit(vault, input);
      const updated = await repos.vaults.update({
        ...vault,
        tvl: vault.tvl + input.amount,
        sharesOutstanding: vault.sharesOutstanding + position.shares,
        lastRebalanceAt: Date.now(),
      });

      return reply.status(201).send({ data: { position, vault: updated } });
    },
  );

  app.post(
    "/api/v1/vaults/:address/withdraw",
    { schema: { tags: ["investors", "vaults"] } },
    async (request, reply) => {
      const { address } = vaultParam.parse(request.params);
      const input = withdrawBody.parse(request.body);

      const vault = await repos.vaults.get(address);
      if (!vault) {
        return reply.status(404).send({ error: "vault_not_found", message: "Vault not found", statusCode: 404 });
      }

      const positions = await repos.investors.listPositions(input.investor);
      const position = positions.find(
        (p) => p.vaultAddress === address && p.status === "active",
      );
      if (!position) {
        return reply.status(404).send({
          error: "position_not_found",
          message: "No active position in this vault",
          statusCode: 404,
        });
      }

      const auth = requireWalletSignature({
        nonces,
        ownerHeader: request.headers["x-atlas-owner"] as string | undefined,
        nonceHeader: request.headers["x-atlas-nonce"] as string | undefined,
        signatureHeader: request.headers["x-atlas-signature"] as string | undefined,
        body: request.body,
        expectedOwner: input.investor,
      });
      if (!auth.ok) {
        return reply.status(auth.statusCode ?? 401).send(auth);
      }

      const result = await repos.investors.withdraw(position.id, vault, input.shares);
      if (!result) {
        return reply.status(400).send({
          error: "withdraw_failed",
          message: "Position is not redeemable",
          statusCode: 400,
        });
      }

      const updated = await repos.vaults.update({
        ...vault,
        tvl: Math.max(0, vault.tvl - result.proceeds),
        sharesOutstanding: Math.max(0, vault.sharesOutstanding - result.sharesRedeemed),
        lastRebalanceAt: Date.now(),
      });

      return reply.status(200).send({
        data: { position: result.position, proceeds: result.proceeds, sharesRedeemed: result.sharesRedeemed, vault: updated },
      });
    },
  );
}
