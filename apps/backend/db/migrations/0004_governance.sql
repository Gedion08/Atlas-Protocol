-- Governance/DAO: proposals, votes, and ve-locks.

CREATE TABLE IF NOT EXISTS ve_locks (
  holder TEXT PRIMARY KEY,
  delegate TEXT,
  amount NUMERIC(30, 6) NOT NULL DEFAULT 0,
  weight NUMERIC(30, 6) NOT NULL DEFAULT 0,
  unlock_at BIGINT NOT NULL,
  swept BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  proposer TEXT NOT NULL,
  class TEXT NOT NULL,
  title TEXT NOT NULL,
  target_program TEXT,
  instruction_data TEXT,
  quorum_weight NUMERIC(30, 6) NOT NULL DEFAULT 0,
  for_votes NUMERIC(30, 6) NOT NULL DEFAULT 0,
  against_votes NUMERIC(30, 6) NOT NULL DEFAULT 0,
  start_voting_at BIGINT NOT NULL,
  end_voting_at BIGINT NOT NULL,
  execution_at BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals (status);
CREATE INDEX IF NOT EXISTS idx_proposals_end ON proposals (end_voting_at);

CREATE TABLE IF NOT EXISTS proposal_votes (
  proposal_id TEXT NOT NULL REFERENCES proposals (id),
  voter TEXT NOT NULL,
  weight NUMERIC(30, 6) NOT NULL DEFAULT 0,
  in_favor BOOLEAN NOT NULL,
  voted_at BIGINT NOT NULL,
  PRIMARY KEY (proposal_id, voter)
);
