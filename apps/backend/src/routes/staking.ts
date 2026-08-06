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
} from "../services/staking/solana.js";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";

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
      const { owner } = request.params as { owner: string };
      const [bondPdaKey] = bondPda(new PublicKey(owner), STAKING_PROGRAM_ID);
      const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
      const accountInfo = await connection.getAccountInfo(bondPdaKey);
      if (!accountInfo) {
        return reply.status(404).send({ error: "bond_not_found", message: "No bond found for this owner", statusCode: 404 });
      }
      return { data: { exists: true, address: bondPdaKey.toBase58() } };
    },
  );

  app.post(
    "/api/v1/staking/bond",
    { schema: { tags: ["staking"] } },
    async (request, reply) => {
      const body = bondBody.parse(request.body);
      const ownerPubkey = new PublicKey(body.owner);
      const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
      const [bondPdaKey] = bondPda(ownerPubkey, STAKING_PROGRAM_ID);
      const [escrowPdaKey] = bondEscrowPda(bondPdaKey, STAKING_PROGRAM_ID);

      const instruction = buildBondInstruction({
        owner: ownerPubkey,
        bondMint: ownerPubkey,
        ownerToken: ownerPubkey,
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
    },
  );

  app.post(
    "/api/v1/staking/unbond",
    { schema: { tags: ["staking"] } },
    async (request, reply) => {
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
    },
  );

  app.post(
    "/api/v1/staking/claim",
    { schema: { tags: ["staking"] } },
    async (request, reply) => {
      const body = claimBody.parse(request.body);
      const ownerPubkey = new PublicKey(body.owner);
      const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");

      const instruction = buildClaimInstruction({
        owner: ownerPubkey,
        bondMint: ownerPubkey,
        ownerToken: ownerPubkey,
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
    },
  );
}
