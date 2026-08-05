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

const executeBody = z.object({
  proposalId: z.string().min(1),
  executor: z.string().min(1),
});

export async function registerGovernanceExecutionRoutes(
  app: FastifyInstance,
  repos: Repositories,
): Promise<void> {
  app.post(
    "/api/v1/governance/proposals/:id/execute",
    { schema: { tags: ["governance"] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = executeBody.parse(request.body);

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

      const [configPda] = governanceConfigPda(GOVERNANCE_PROGRAM_ID);
      const [proposalPdaKey] = proposalPda(configPda, BigInt(id), GOVERNANCE_PROGRAM_ID);

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
