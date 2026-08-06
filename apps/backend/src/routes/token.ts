import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { env } from "../env.js";
import {
  buildSaleTransaction,
  getAtlasBalance,
  getTreasuryPubkey,
  sendFaucetTransaction,
  type FaucetResult,
  type SaleBuildResult,
} from "../services/token/distribution.js";
import { Connection, PublicKey } from "@solana/web3.js";

const faucetBody = z.object({
  recipient: z.string().min(32).max(44),
  amount: z.number().positive().default(env.ATLAS_FAUCET_AMOUNT),
});

const saleBuildBody = z.object({
  buyer: z.string().min(32).max(44),
  solAmount: z.number().positive(),
});

export async function registerTokenRoutes(app: FastifyInstance, repos: Repositories): Promise<void> {
  app.get(
    "/api/v1/token/balance/:owner",
    { schema: { tags: ["token"] } },
    async (request) => {
      const { owner } = request.params as { owner: string };
      const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
      const balance = await getAtlasBalance(connection, new PublicKey(owner));
      return { data: { owner, mint: "7roukPrgB6rjLrJ9mqHoiCrMTjwYzT8UKbxGgtTRVtEa", balance } };
    },
  );

  app.get(
    "/api/v1/token/sale/info",
    { schema: { tags: ["token"] } },
    async () => {
      const treasury = getTreasuryPubkey().toBase58();
      return {
        data: {
          mint: "7roukPrgB6rjLrJ9mqHoiCrMTjwYzT8UKbxGgtTRVtEa",
          treasury,
          rate: env.ATLAS_SALE_RATE,
          minSol: 0.01,
          maxSol: 10,
          faucetAmount: env.ATLAS_FAUCET_AMOUNT,
          faucetCooldownSecs: env.ATLAS_FAUCET_COOLDOWN_SECS,
        },
      };
    },
  );

  app.post(
    "/api/v1/token/faucet",
    { schema: { tags: ["token"] } },
    async (request, reply) => {
      const body = faucetBody.parse(request.body);
      const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
      const recipient = new PublicKey(body.recipient);

      const signature = await sendFaucetTransaction({
        connection,
        recipient,
        amount: body.amount,
      });

      const result: FaucetResult = {
        signature,
        recipient: body.recipient,
        amount: body.amount,
      };

      return reply.status(200).send({ data: result });
    },
  );

  app.post(
    "/api/v1/token/sale/build",
    { schema: { tags: ["token"] } },
    async (request) => {
      const body = saleBuildBody.parse(request.body);
      const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
      const buyer = new PublicKey(body.buyer);
      const atlasAmount = Math.floor(body.solAmount * env.ATLAS_SALE_RATE);

      const { transaction, ataAccounts } = await buildSaleTransaction({
        connection,
        buyer,
        solAmount: body.solAmount,
        atlasAmount,
      });

      const result: SaleBuildResult = {
        transaction: Buffer.from(transaction.serialize({ requireAllSignatures: false })).toString("base64"),
        blockhash: transaction.recentBlockhash ?? (await connection.getLatestBlockhash()).blockhash,
        treasury: getTreasuryPubkey().toBase58(),
        recipient: body.buyer,
        solAmount: body.solAmount,
        atlasAmount,
        ataAccounts: ataAccounts.map((ata) => ata.toBase58()),
      };

      return { data: result };
    },
  );
}
