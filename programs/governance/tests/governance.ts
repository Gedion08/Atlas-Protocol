import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AtlasGovernance } from "../target/types/atlas_governance";

describe("atlas-governance", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AtlasGovernance as Program<AtlasGovernance>;

  const governance = provider.wallet.publicKey;
  const holder = anchor.web3.Keypair.generate();
  let atlasMint: PublicKey;
  let configPda: PublicKey;
  let lockPda: PublicKey;
  let proposalPda: PublicKey;

  const DAY = 86_400;

  async function pdas() {
    const [config] = PublicKey.findProgramAddressSync(
      [Buffer.from("atlas_governance")],
      program.programId,
    );
    const [lock] = PublicKey.findProgramAddressSync(
      [Buffer.from("ve_lock"), holder.publicKey.toBuffer()],
      program.programId,
    );
    const counter = (await program.account.governanceConfig.fetch(config)).proposalCounter;
    const [proposal] = PublicKey.findProgramAddressSync(
      [Buffer.from("proposal"), config.toBuffer(), new BN(counter).toArrayLike(Buffer, "le", 8)],
      program.programId,
    );
    return { config, lock, proposal };
  }

  it("initializes governance", async () => {
    ({ config: configPda, lock: lockPda } = await pdas());
    atlasMint = await createMint(provider.connection, provider.wallet.payer, governance, governance, 9);
    await program.methods
      .initialize(atlasMint)
      .accounts({ config: configPda, atlasMint, deployer: governance })
      .rpc();
    const config = await program.account.governanceConfig.fetch(configPda);
    expect(config.governance.equals(governance)).toBe(true);
    expect(config.totalVeWeight.toString()).toBe("0");
  });

  it("creates a ve-lock", async () => {
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), configPda.toBuffer()],
      program.programId,
    );
    const holderToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      atlasMint,
      holder.publicKey,
      true,
    );
    await mintTo(provider.connection, provider.wallet.payer, atlasMint, holderToken.address, governance, 10_000_000);

    await program.methods
      .createLock(new BN(1_000_000), 4 * 365 * DAY)
      .accounts({
        config: configPda,
        vault: vaultPda,
        lock: lockPda,
        ownerToken: holderToken.address,
        atlasMint,
        owner: holder.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([holder])
      .rpc();
    const lock = await program.account.veLock.fetch(lockPda);
    expect(lock.amount.toString()).toBe("1000000");
    expect(lock.weight.toNumber()).toBeGreaterThan(1_000_000);
  });

  it("delegates voting power", async () => {
    const delegate = anchor.web3.Keypair.generate();
    await program.methods
      .delegate(delegate.publicKey)
      .accounts({ lock: lockPda, owner: holder.publicKey })
      .signers([holder])
      .rpc();
    const lock = await program.account.veLock.fetch(lockPda);
    expect(lock.delegate.equals(delegate.publicKey)).toBe(true);
  });

  it("creates a proposal", async () => {
    const { proposal } = await pdas();
    proposalPda = proposal;
    await program.methods
      .createProposal(
        "Raise max drawdown tolerance",
        { parametric: {} },
        new PublicKey("9h29CPwoYFgQ4wYN2oWWCyA9rS3nMYaeS99Y676zSGa8"),
        Buffer.alloc(0),
      )
      .accounts({
        config: configPda,
        proposal: proposalPda,
        proposer: governance,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    const created = await program.account.proposal.fetch(proposalPda);
    expect(created.title).toBe("Raise max drawdown tolerance");
    expect(created.status.active).toBe(true);
  });

  it("votes with ve-lock weight", async () => {
    const [votePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vote"), proposalPda.toBuffer(), lockPda.toBuffer()],
      program.programId,
    );
    await program.methods
      .vote(true)
      .accounts({
        config: configPda,
        proposal: proposalPda,
        lock: lockPda,
        vote: votePda,
        signer: holder.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([holder])
      .rpc();
    const proposal = await program.account.proposal.fetch(proposalPda);
    expect(proposal.forVotes.toNumber()).toBeGreaterThan(0);
  });

  it("finalizes an expired proposal", async () => {
    await program.methods
      .finalizeProposal()
      .accounts({ config: configPda, proposal: proposalPda })
      .rpc();
    const proposal = await program.account.proposal.fetch(proposalPda);
    expect(proposal.status.succeeded || proposal.status.defeated || proposal.status.expired).toBe(true);
  });
});
