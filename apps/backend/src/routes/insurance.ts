import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { env } from "../env.js";
import { buildActivateInsuranceInstruction, TREASURY_PROGRAM_ID } from "../services/treasury/solana.js";
import { InsuranceService } from "../services/insurance/index.js";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";

const activateBody = z.object({
  amount: z.number().positive(),
  executor: z.string().min(1),
});

const claimBody = z.object({
  vaultAddress: z.string().min(1),
  claimant: z.string().min(1),
  amount: z.number().positive(),
  eventType: z.string().min(1),
  evidence: z.string().min(1),
  eventTs: z.number().int().positive(),
});

const assessBody = z.object({
  claimId: z.string().min(1),
  executor: z.string().min(1),
  assessor: z.string().min(1),
  notes: z.string().min(1),
  recommendedAmount: z.number().positive(),
  coInsuranceBps: z.number().int().min(0).max(10_000),
});

const adjudicateBody = z.object({
  claimId: z.string().min(1),
  executor: z.string().min(1),
  approved: z.boolean(),
  notes: z.string().optional(),
});

const payoutBody = z.object({
  claimId: z.string().min(1),
  executor: z.string().min(1),
  signature: z.string().min(1),
  amount: z.number().positive(),
});

function parseExecutor(): Keypair | null {
  if (env.GOVERNANCE_KEYPAIR) {
    try {
      const secret = Uint8Array.from(JSON.parse(env.GOVERNANCE_KEYPAIR));
      return Keypair.fromSecretKey(secret);
    } catch {
      return null;
    }
  }
  return null;
}

function assertExecutor(executorKeypair: Keypair | null, expected: string) {
  if (!executorKeypair || executorKeypair.publicKey.toBase58() !== expected) {
    return {
      error: "unauthorized_executor",
      message: "Executor does not match configured governance keypair",
      statusCode: 403,
    };
  }
  return null;
}

export async function registerInsuranceRoutes(
  app: FastifyInstance,
  repos: Repositories,
): Promise<void> {
  const service = new InsuranceService(repos);

  app.post(
    "/api/v1/insurance/activate",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const body = activateBody.parse(request.body);

      const executorKeypair = parseExecutor();
      if (!executorKeypair) {
        return reply.status(400).send({
          error: "invalid_keypair",
          message: "Invalid GOVERNANCE_KEYPAIR format",
          statusCode: 400,
        });
      }
      const authError = assertExecutor(executorKeypair, body.executor);
      if (authError) return reply.status(authError.statusCode).send(authError);

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

  app.post(
    "/api/v1/insurance/claims",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const body = claimBody.parse(request.body);
      try {
        const claim = await service.submitClaim({
          id: `clm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ...body,
          coInsuranceAmount: 0,
          status: "pending",
          decidedAt: undefined,
          decidedBy: undefined,
          assessmentNotes: undefined,
          payoutSignature: undefined,
          paidAt: undefined,
          createdAt: Date.now(),
        });
        return reply.status(201).send({ data: claim });
      } catch (err) {
        return reply.status(400).send({
          error: "invalid_claim",
          message: err instanceof Error ? err.message : "Failed to submit claim",
          statusCode: 400,
        });
      }
    },
  );

  app.get(
    "/api/v1/insurance/claims",
    { schema: { tags: ["insurance"] } },
    async (request) => {
      const query = request.query as { vaultAddress?: string; claimant?: string; status?: string };
      const claims = await service.listClaims(query);
      return { data: claims };
    },
  );

  app.get(
    "/api/v1/insurance/claims/:id",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const claim = await service.getClaim(id);
      if (!claim) {
        return reply.status(404).send({
          error: "claim_not_found",
          message: "Claim not found",
          statusCode: 404,
        });
      }
      return { data: claim };
    },
  );

  app.post(
    "/api/v1/insurance/claims/:id/assess",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = assessBody.parse(request.body);

      const executorKeypair = parseExecutor();
      const authError = assertExecutor(executorKeypair, body.executor);
      if (authError) return reply.status(authError.statusCode).send(authError);

      try {
        const claim = await service.assessClaim({
          claimId: id,
          assessor: body.assessor,
          notes: body.notes,
          recommendedAmount: body.recommendedAmount,
          coInsuranceBps: body.coInsuranceBps,
          decidedAt: Date.now(),
        });
        return reply.status(200).send({ data: claim });
      } catch (err) {
        return reply.status(400).send({
          error: "assessment_failed",
          message: err instanceof Error ? err.message : "Failed to assess claim",
          statusCode: 400,
        });
      }
    },
  );

  app.post(
    "/api/v1/insurance/claims/:id/adjudicate",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = adjudicateBody.parse(request.body);

      const executorKeypair = parseExecutor();
      const authError = assertExecutor(executorKeypair, body.executor);
      if (authError) return reply.status(authError.statusCode).send(authError);

      try {
        const claim = await service.adjudicateClaim(id, body.approved, body.executor, body.notes);
        return reply.status(200).send({ data: claim });
      } catch (err) {
        return reply.status(400).send({
          error: "adjudication_failed",
          message: err instanceof Error ? err.message : "Failed to adjudicate claim",
          statusCode: 400,
        });
      }
    },
  );

  app.post(
    "/api/v1/insurance/claims/:id/payout",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = payoutBody.parse(request.body);

      const executorKeypair = parseExecutor();
      const authError = assertExecutor(executorKeypair, body.executor);
      if (authError) return reply.status(authError.statusCode).send(authError);

      try {
        const claim = await service.processPayout({
          claimId: id,
          signature: body.signature,
          amount: body.amount,
          paidAt: Date.now(),
        });
        return reply.status(200).send({ data: claim });
      } catch (err) {
        return reply.status(400).send({
          error: "payout_failed",
          message: err instanceof Error ? err.message : "Failed to process payout",
          statusCode: 400,
        });
      }
    },
  );
}
