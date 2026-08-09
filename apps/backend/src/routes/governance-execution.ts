import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { env } from "../env.js";
import {
  GOVERNANCE_PROGRAM_ID,
  governanceConfigPda,
  proposalPda,
  buildExecuteProposalTransaction,
} from "../services/governance/solana.js";
import { Connection, Keypair, sendAndConfirmTransaction } from "@solana/web3.js";
import { requireWalletSignature, NonceStore } from "../services/auth/signature.js";
import { createRateLimit } from "../plugins/security.js";

const executeBody = z.object({
  proposalId: z.string().min(1),
});

export async function registerGovernanceExecutionRoutes(
  app: FastifyInstance,
  repos: Repositories,
  governanceKeypair?: Keypair,
  nonces: NonceStore = new NonceStore(),
): Promise<void> {
  app.post(
    "/api/v1/governance/proposals/:id/execute",
    {
      schema: { tags: ["governance"] },
      preHandler: [createRateLimit(5, 60_000)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      executeBody.parse(request.body);

      const proposal = await repos.governance.getProposal(id);
      if (!proposal) {
        return reply.status(404).send({ error: "proposal_not_found", message: "Proposal not found", statusCode: 404 });
      }

      if (proposal.status !== "succeeded") {
        return reply.status(400).send({
          error: "invalid_status",
          message: `Cannot execute proposal with status: ${proposal.status}`,
          statusCode: 400,
        });
      }

      const now = Math.floor(Date.now() / 1000);
      if (now < proposal.executionAt) {
        return reply.status(400).send({
          error: "timelock_active",
          message: `Execution available after ${new Date(proposal.executionAt * 1000).toLocaleString()}`,
          statusCode: 400,
        });
      }

      const executorKeypair = governanceKeypair;
      if (!executorKeypair) {
        return reply.status(500).send({
          error: "governance_keypair_missing",
          message: "GOVERNANCE_KEYPAIR is not configured",
          statusCode: 500,
        });
      }

      const auth = requireWalletSignature({
        nonces,
        ownerHeader: request.headers["x-atlas-owner"] as string | undefined,
        nonceHeader: request.headers["x-atlas-nonce"] as string | undefined,
        signatureHeader: request.headers["x-atlas-signature"] as string | undefined,
        body: request.body,
        expectedOwner: executorKeypair.publicKey.toBase58(),
      });
      if (!auth.ok) {
        return reply.status(auth.statusCode ?? 401).send(auth);
      }

      const [configPda] = governanceConfigPda(GOVERNANCE_PROGRAM_ID);
      const [proposalPdaKey] = proposalPda(configPda, BigInt(id), GOVERNANCE_PROGRAM_ID);

      const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
      const tx = await buildExecuteProposalTransaction({
        connection,
        executorKeypair,
        config: configPda,
        proposal: proposalPdaKey,
        programId: GOVERNANCE_PROGRAM_ID,
      });

      try {
        const signature = await sendAndConfirmTransaction(
          connection,
          tx,
          [executorKeypair],
          { commitment: "confirmed" },
        );

        await repos.governance.updateProposalStatus(id, "executed");

        return reply.status(200).send({
          data: {
            signature,
            proposalId: id,
            status: "executed",
          },
        });
      } catch (err) {
        return reply.status(500).send({
          error: "execution_failed",
          message: err instanceof Error ? err.message : "Transaction failed",
          statusCode: 500,
        });
      }
    },
  );
}
