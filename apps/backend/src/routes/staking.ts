import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { env } from "../env.js";
import {
  STAKING_PROGRAM_ID,
  bondPda,
  bondEscrowPda,
  buildBondInstruction,
  buildUnbondInstruction,
  buildClaimInstruction,
  getBondMint,
} from "../services/staking/solana.js";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

const bondBody = z.object({
  owner: z.string().min(1),
  amount: z.number().positive(),
});

const unbondBody = z.object({
  owner: z.string().min(1),
});

const claimBody = z.object({
  owner: z.string().min(1),
});

export async function registerStakingRoutes(app: FastifyInstance, repos: Repositories): Promise<void> {
  app.get(
    "/api/v1/staking/bond/:owner",
    { schema: { tags: ["staking"] } },
    async (request, reply) => {
      try {
        const { owner } = request.params as { owner: string };
        const [bondPdaKey] = bondPda(new PublicKey(owner), STAKING_PROGRAM_ID);
        const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
        const accountInfo = await connection.getAccountInfo(bondPdaKey).catch(() => null);
        if (!accountInfo) {
          return reply.status(404).send({ error: "bond_not_found", message: "No bond found for this owner", statusCode: 404 });
        }
        return { data: { exists: true, address: bondPdaKey.toBase58() } };
      } catch (error) {
        app.log.error({ error }, "failed to fetch bond status");
        return reply.status(503).send({ error: "rpc_unavailable", message: "Solana RPC unavailable. Please try again later.", statusCode: 503 });
      }
    },
  );

  app.post(
    "/api/v1/staking/bond",
    { schema: { tags: ["staking"] } },
    async (request, reply) => {
      try {
        const body = bondBody.parse(request.body);
        const ownerPubkey = new PublicKey(body.owner);
        const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
        const bondMint = await getBondMint(connection);
        const ownerToken = getAssociatedTokenAddressSync(bondMint, ownerPubkey, false, TOKEN_PROGRAM_ID);
        const [bondPdaKey] = bondPda(ownerPubkey, STAKING_PROGRAM_ID);
        const [escrowPdaKey] = bondEscrowPda(bondPdaKey, STAKING_PROGRAM_ID);

        const instruction = buildBondInstruction({
          owner: ownerPubkey,
          bondMint,
          ownerToken,
          amount: body.amount,
          programId: STAKING_PROGRAM_ID,
        });

        const tx = new Transaction().add(instruction);
        tx.feePayer = ownerPubkey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });

        return reply.status(200).send({
          data: {
            transaction: Buffer.from(serialized).toString("base64"),
            owner: body.owner,
            amount: body.amount,
            bondPda: bondPdaKey.toBase58(),
            escrowPda: escrowPdaKey.toBase58(),
          },
        });
      } catch (error) {
        app.log.error({ error }, "failed to build bond transaction");
        return reply.status(503).send({ error: "rpc_unavailable", message: "Solana RPC unavailable. Please try again later.", statusCode: 503 });
      }
    },
  );

  app.post(
    "/api/v1/staking/unbond",
    { schema: { tags: ["staking"] } },
    async (request, reply) => {
      try {
        const body = unbondBody.parse(request.body);
        const ownerPubkey = new PublicKey(body.owner);
        const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");

        const instruction = buildUnbondInstruction({
          owner: ownerPubkey,
          programId: STAKING_PROGRAM_ID,
        });

        const tx = new Transaction().add(instruction);
        tx.feePayer = ownerPubkey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });

        return reply.status(200).send({
          data: {
            transaction: Buffer.from(serialized).toString("base64"),
            owner: body.owner,
          },
        });
      } catch (error) {
        app.log.error({ error }, "failed to build unbond transaction");
        return reply.status(503).send({ error: "rpc_unavailable", message: "Solana RPC unavailable. Please try again later.", statusCode: 503 });
      }
    },
  );

  app.post(
    "/api/v1/staking/claim",
    { schema: { tags: ["staking"] } },
    async (request, reply) => {
      try {
        const body = claimBody.parse(request.body);
        const ownerPubkey = new PublicKey(body.owner);
        const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
        const bondMint = await getBondMint(connection);
        const ownerToken = getAssociatedTokenAddressSync(bondMint, ownerPubkey, false, TOKEN_PROGRAM_ID);

        const instruction = buildClaimInstruction({
          owner: ownerPubkey,
          bondMint,
          ownerToken,
          programId: STAKING_PROGRAM_ID,
        });

        const tx = new Transaction().add(instruction);
        tx.feePayer = ownerPubkey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });

        return reply.status(200).send({
          data: {
            transaction: Buffer.from(serialized).toString("base64"),
            owner: body.owner,
          },
        });
      } catch (error) {
        app.log.error({ error }, "failed to build claim transaction");
        return reply.status(503).send({ error: "rpc_unavailable", message: "Solana RPC unavailable. Please try again later.", statusCode: 503 });
      }
    },
  );
}
