import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";

const proposalParam = z.object({ id: z.string().min(1) });

const proposalQuery = z.object({
  status: z
    .enum(["active", "succeeded", "defeated", "expired", "executed"])
    .optional(),
});

const proposalBody = z.object({
  proposer: z.string().min(1),
  class: z.enum(["parametric", "fiscal", "protocol_critical", "constitutional"]),
  title: z.string().min(1).max(64),
  targetProgram: z.string().optional(),
  instructionData: z.string().optional(),
  endVotingAt: z.number().int().optional(),
});

const voteBody = z.object({
  voter: z.string().min(1),
  inFavor: z.boolean(),
});

export async function registerGovernanceRoutes(
  app: FastifyInstance,
  repos: Repositories,
): Promise<void> {
  app.get(
    "/api/v1/governance/proposals",
    { schema: { tags: ["governance"] } },
    async (request) => {
      const query = proposalQuery.parse(request.query);
      return { data: await repos.governance.listProposals(query.status) };
    },
  );

  app.get(
    "/api/v1/governance/proposals/:id",
    { schema: { tags: ["governance"] } },
    async (request, reply) => {
      const { id } = proposalParam.parse(request.params);
      const proposal = await repos.governance.getProposal(id);
      if (!proposal) {
        return reply.status(404).send({ error: "proposal_not_found", message: "Proposal not found", statusCode: 404 });
      }
      return { data: proposal };
    },
  );

  app.post(
    "/api/v1/governance/proposals",
    { schema: { tags: ["governance"] } },
    async (request, reply) => {
      const input = proposalBody.parse(request.body);
      const proposal = await repos.governance.createProposal(input);
      return reply.status(201).send({ data: proposal });
    },
  );

  app.get(
    "/api/v1/governance/proposals/:id/votes",
    { schema: { tags: ["governance"] } },
    async (request) => {
      const { id } = proposalParam.parse(request.params);
      return { data: await repos.governance.listVotes(id) };
    },
  );

  app.post(
    "/api/v1/governance/proposals/:id/votes",
    { schema: { tags: ["governance"] } },
    async (request, reply) => {
      const { id } = proposalParam.parse(request.params);
      const vote = voteBody.parse(request.body);
      const proposal = await repos.governance.castVote(id, vote);
      if (!proposal) {
        return reply.status(404).send({ error: "proposal_not_found", message: "Proposal not found", statusCode: 404 });
      }
      return { data: proposal };
    },
  );

  app.get(
    "/api/v1/governance/locks",
    { schema: { tags: ["governance"] } },
    async () => ({ data: await repos.governance.listLocks() }),
  );
}
