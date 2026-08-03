import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { requireWalletSignature, NonceStore } from "../services/auth/signature.js";

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

export async function registerInvestorRoutes(
  app: FastifyInstance,
  repos: Repositories,
  nonces: NonceStore = new NonceStore(),
): Promise<void> {
  app.get(
    "/api/v1/investors/:wallet/positions",
    { schema: { tags: ["investors"] } },
    async (request) => {
      const { wallet } = walletParam.parse(request.params);
      return { data: await repos.investors.listPositions(wallet) };
    },
  );

  app.get(
    "/api/v1/investors/:wallet",
    { schema: { tags: ["investors"] } },
    async (request) => {
      const { wallet } = walletParam.parse(request.params);
      const positions = (await repos.investors.listPositions(wallet)).filter(
        (p) => p.status !== "withdrawn",
      );
      const vaults = await repos.vaults.list();
      const vaultByAddress = new Map(vaults.map((v) => [v.address, v]));
      const totalInvested = positions.reduce((sum, p) => sum + p.amount, 0);
      const currentValue = positions.reduce((sum, p) => {
        const vault = vaultByAddress.get(p.vaultAddress);
        if (!vault || vault.sharesOutstanding <= 0) return sum + p.amount;
        const sharePrice = vault.tvl / vault.sharesOutstanding;
        return sum + p.shares * sharePrice;
      }, 0);
      const vaultAddresses = [...new Set(positions.map((p) => p.vaultAddress))];
      return {
        data: {
          investor: wallet,
          totalInvested,
          currentValue,
          positionCount: positions.length,
          positions,
          vaults: vaultAddresses,
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
