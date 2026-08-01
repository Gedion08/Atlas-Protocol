import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AtlasManagerRegistry } from "../target/types/atlas_manager_registry";

describe("atlas-manager-registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AtlasManagerRegistry as Program<AtlasManagerRegistry>;
  const stakingProgram = anchor.workspace.AtlasStaking;

  const governance = provider.wallet.publicKey;
  const oracle = Keypair.generate();
  const slashAuthority = provider.wallet.publicKey;

  const owner = Keypair.generate();
  const bondAmount = new BN(1_000_000);
  const scoreThreshold = 40;

  let configPda: PublicKey;
  let bondMint: PublicKey;
  let profilePda: PublicKey;
  let bondPda: PublicKey;
  let bondEscrowPda: PublicKey;

  async function airdrop(pubkey: PublicKey) {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL),
    );
  }

  async function ensureConfig() {
    // Idempotent: initialize if needed, then force the settings this suite needs so
    // order of execution across suites does not matter.
    try {
      await program.methods
        .initializeConfig({
          oracle: oracle.publicKey,
          slashAuthority,
          bondMint,
          bondAmount,
          scoreThreshold,
        })
        .accounts({ config: configPda, governance, systemProgram: SystemProgram.programId })
        .rpc();
    } catch {
      // already initialized by another suite — settings re-applied below
    }
    await program.methods
      .updateConfig({
        oracle: oracle.publicKey,
        slashAuthority,
        bondMint,
        bondAmount,
        scoreThreshold,
      })
      .accounts({ config: configPda, governance })
      .rpc();
  }

  it("registers a manager with a staking bond", async () => {
    bondMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      governance,
      governance,
      6,
    );
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("atlas_registry_config")],
      program.programId,
    );
    [profilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("manager"), owner.publicKey.toBuffer()],
      program.programId,
    );
    [bondPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bond"), owner.publicKey.toBuffer()],
      stakingProgram.programId,
    );
    [bondEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), bondPda.toBuffer()],
      stakingProgram.programId,
    );

    await airdrop(owner.publicKey);
    const ownerBondToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      bondMint,
      owner.publicKey,
    );
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      bondMint,
      ownerBondToken.address,
      governance,
      10_000_000,
    );

    await ensureConfig();

    await program.methods
      .register("Quantum Capital")
      .accounts({
        config: configPda,
        profile: profilePda,
        bond: bondPda,
        bondEscrow: bondEscrowPda,
        bondMint,
        owner: owner.publicKey,
        ownerToken: ownerBondToken.address,
        stakingProgram: stakingProgram.programId,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();

    const profile = await program.account.managerProfile.fetch(profilePda);
    expect(profile.name).toBe("Quantum Capital");
    expect(profile.status.active).toBe(true);
    expect(profile.bondRequired.toString()).toBe(bondAmount.toString());

    // Bond locked in the staking escrow.
    const bond = await stakingProgram.account.bondAccount.fetch(bondPda);
    expect(bond.amount.toString()).toBe(bondAmount.toString());
  });

  it("rejects duplicate registration", async () => {
    const ownerBondToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      bondMint,
      owner.publicKey,
    );
    await expect(
      program.methods
        .register("Second Name")
        .accounts({
          config: configPda,
          profile: profilePda,
          bond: bondPda,
          bondEscrow: bondEscrowPda,
          bondMint,
          owner: owner.publicKey,
          ownerToken: ownerBondToken.address,
          stakingProgram: stakingProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc(),
    ).rejects.toThrow();
  });

  it("rejects names that are too long", async () => {
    const other = Keypair.generate();
    await airdrop(other.publicKey);
    const otherBondToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      bondMint,
      other.publicKey,
    );
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      bondMint,
      otherBondToken.address,
      governance,
      10_000_000,
    );
    const [otherPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("manager"), other.publicKey.toBuffer()],
      program.programId,
    );
    const [otherBond] = PublicKey.findProgramAddressSync(
      [Buffer.from("bond"), other.publicKey.toBuffer()],
      stakingProgram.programId,
    );
    const [otherBondEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), otherBond.toBuffer()],
      stakingProgram.programId,
    );
    await expect(
      program.methods
        .register("x".repeat(65))
        .accounts({
          config: configPda,
          profile: otherPda,
          bond: otherBond,
          bondEscrow: otherBondEscrow,
          bondMint,
          owner: other.publicKey,
          ownerToken: otherBondToken.address,
          stakingProgram: stakingProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([other])
        .rpc(),
    ).rejects.toThrow();
  });

  it("oracle sets the composite score", async () => {
    await program.methods
      .setScore({
        feeGeneration: 80,
        risk: 80,
        drawdown: 85,
        capitalRetention: 90,
        consistency: 85,
        tvlGrowth: 70,
        governanceParticipation: 60,
      })
      .accounts({ config: configPda, profile: profilePda, submitter: oracle.publicKey })
      .signers([oracle])
      .rpc();

    const profile = await program.account.managerProfile.fetch(profilePda);
    const expected = Math.round(
      (80 * 30 + 80 * 20 + 85 * 15 + 90 * 10 + 85 * 10 + 70 * 10 + 60 * 5) / 100,
    );
    expect(profile.score.total).toBe(expected);
  });

  it("rejects non-oracle score submissions", async () => {
    await expect(
      program.methods
        .setScore({
          feeGeneration: 10,
          risk: 10,
          drawdown: 10,
          capitalRetention: 10,
          consistency: 10,
          tvlGrowth: 10,
          governanceParticipation: 10,
        })
        .accounts({ config: configPda, profile: profilePda, submitter: owner.publicKey })
        .signers([owner])
        .rpc(),
    ).rejects.toThrow();
  });

  it("auto-suspends managers scoring at or below the threshold", async () => {
    await program.methods
      .setScore({
        feeGeneration: 10,
        risk: 10,
        drawdown: 10,
        capitalRetention: 10,
        consistency: 10,
        tvlGrowth: 10,
        governanceParticipation: 10,
      })
      .accounts({ config: configPda, profile: profilePda, submitter: oracle.publicKey })
      .signers([oracle])
      .rpc();

    const profile = await program.account.managerProfile.fetch(profilePda);
    expect(profile.status.suspended).toBe(true);
  });

  it("governance bans a manager and slashes the bond", async () => {
    await program.methods
      .setStatus({ banned: {} })
      .accounts({ config: configPda, profile: profilePda, signer: governance })
      .rpc();

    const [stakingConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("atlas_staking_config")],
      stakingProgram.programId,
    );
    const [insuranceEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("insurance_escrow"), stakingConfigPda.toBuffer()],
      stakingProgram.programId,
    );

    // Ensure the staking program config exists, then point its slash authority at
    // this suite's slash authority so the registry slash CPI is authorized.
    try {
      await stakingProgram.methods
        .initialize(
          new PublicKey("AfCPkgDj8ADzebwdWW9T8WTAyXVqMccaPkQJsQHFMhtr"), // vault program
          bondMint, // premium mint placeholder (stablecoin leg)
        )
        .accounts({ config: stakingConfigPda, deployer: governance })
        .rpc();
    } catch {
      // already initialized
    }
    await stakingProgram.methods
      .setSlashAuthority(slashAuthority)
      .accounts({ config: stakingConfigPda, slashAuthority: governance })
      .rpc();

    const before = await stakingProgram.account.bondAccount.fetch(bondPda);
    await program.methods
      .slashBond(new BN(500_000))
      .accounts({
        config: configPda,
        stakingConfig: stakingConfigPda,
        profile: profilePda,
        bond: bondPda,
        bondEscrow: bondEscrowPda,
        insuranceEscrow: insuranceEscrowPda,
        bondMint,
        slashAuthority,
        stakingProgram: stakingProgram.programId,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const after = await stakingProgram.account.bondAccount.fetch(bondPda);
    expect(after.amount.toString()).toBe(before.amount.sub(new BN(500_000)).toString());
  });

  it("rejects out-of-range score components", async () => {
    await expect(
      program.methods
        .setScore({
          feeGeneration: 101,
          risk: 20,
          drawdown: 15,
          capitalRetention: 90,
          consistency: 85,
          tvlGrowth: 70,
          governanceParticipation: 60,
        })
        .accounts({ config: configPda, profile: profilePda, submitter: oracle.publicKey })
        .signers([oracle])
        .rpc(),
    ).rejects.toThrow();
  });
});
