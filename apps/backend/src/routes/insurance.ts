import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { env } from "../env.js";
import { buildActivateInsuranceInstruction, TREASURY_PROGRAM_ID } from "../services/treasury/solana.js";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";

const activateBody = z.object({
  amount: z.number().positive(),
  executor: z.string().min(1),
});

export async function registerInsuranceRoutes(
  app: FastifyInstance,
  repos: Repositories,
): Promise<void> {
  app.post(
    "/api/v1/insurance/activate",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const body = activateBody.parse(request.body);

      let executorKeypair: Keypair | null = null;
      if (env.GOVERNANCE_KEYPAIR) {
        try {
          const secret = Uint8Array.from(JSON.parse(env.GOVERNANCE_KEYPAIR));
          executorKeypair = Keypair.fromSecretKey(secret);
        } catch {
          return reply.status(400).send({
            error: "invalid_keypair",
            message: "Invalid GOVERNANCE_KEYPAIR format",
            statusCode: 400,
          });
        }
      }

      if (!executorKeypair || executorKeypair.publicKey.toBase58() !== body.executor) {
        return reply.status(403).send({
          error: "unauthorized_executor",
          message: "Executor does not match configured governance keypair",
          statusCode: 403,
        });
      }

      const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("atlas_treasury")],
        TREASURY_PROGRAM_ID,
      );
      const [revenueEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("revenue_escrow"), configPda.toBuffer()],
        TREASURY_PROGRAM_ID,
      );
      const [insuranceEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("insurance_escrow"), configPda.toBuffer()],
        TREASURY_PROGRAM_ID,
      );

      const tx = buildActivateInsuranceInstruction({
        programId: TREASURY_PROGRAM_ID,
        accounts: {
          config: configPda,
          revenueEscrow,
          insuranceEscrow,
          governance: executorKeypair.publicKey,
        },
        amount: body.amount,
      });

      try {
        const signature = await sendAndConfirmTransaction(
          connection,
          new Transaction().add(tx),
          [executorKeypair],
          { commitment: "confirmed" },
        );

        return reply.status(200).send({
          data: {
            signature,
            amount: body.amount,
          },
        });
      } catch (err) {
        return reply.status(500).send({
          error: "activation_failed",
          message: err instanceof Error ? err.message : "Transaction failed",
          statusCode: 500,
        });
      }
    },
  );
}
