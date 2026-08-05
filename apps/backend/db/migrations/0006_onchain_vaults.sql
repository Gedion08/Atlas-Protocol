ALTER TABLE vaults ADD COLUMN IF NOT EXISTS onchain JSONB;

CREATE INDEX IF NOT EXISTS idx_vaults_onchain_program ON vaults ((onchain ->> 'programId'));
