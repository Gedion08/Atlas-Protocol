import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AtlasTreasury } from "../target/types/atlas_treasury";

describe("atlas-treasury", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AtlasTreasury as Program<AtlasTreasury>;

  const deployer = provider.wallet.publicKey;
  const oracle1 = Keypair.generate();
  const oracle2 = Keypair.generate();
  const oracle3 = Keypair.generate();

  let configPda: PublicKey;
  let revenueMint: PublicKey;
  let atlasMint: PublicKey;
  let revenueEscrowPda: PublicKey;

  async function airdrop(pubkey: PublicKey) {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL),
    );
  }

  it("bootstraps the treasury with an M-of-N oracle set", async () => {
    revenueMint = await createMint(provider.connection, provider.wallet.payer, deployer, deployer, 6);
    atlasMint = await createMint(provider.connection, provider.wallet.payer, deployer, deployer, 6);
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("atlas_treasury")],
      program.programId,
    );
    [revenueEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("revenue_escrow"), configPda.toBuffer()],
      program.programId,
    );
    await program.methods
      .initialize(
        new BN(10_000),
        [oracle1.publicKey, oracle2.publicKey, oracle3.publicKey],
        3,
      )
      .accounts({
        config: configPda,
        revenueEscrow: revenueEscrowPda,
        revenueMint,
        atlasMint,
        deployer,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    const config = await program.account.treasuryConfig.fetch(configPda);
    expect(config.governance.equals(deployer)).toBe(true);
    expect(config.minOracleSignatures).toBe(3);
    expect(config.periodSpent.toNumber()).toBe(0);
  });

  it("accepts revenue deposits into the program escrow", async () => {
    const depositor = Keypair.generate();
    await airdrop(depositor.publicKey);
    const depositorToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      revenueMint,
      depositor.publicKey,
    );
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      revenueMint,
      depositorToken.address,
      deployer,
      1_000_000,
    );
    await program.methods
      .depositRevenue(new BN(250_000))
      .accounts({
        config: configPda,
        revenueEscrow: revenueEscrowPda,
        depositorToken: depositorToken.address,
        depositor: depositor.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([depositor])
      .rpc();
    const escrow = await provider.connection.getTokenAccountBalance(revenueEscrowPda);
    expect(escrow.value.amount).toBe("250000");
  });

  it("rejects a keeper rollover before the period has elapsed", async () => {
    // initialize() stamps period_start, so an immediate keeper rollover must be
    // rejected (PeriodNotElapsed). The boundary logic is unit-tested in
    // state.rs (period_boundaries_roll_over_when_elapsed).
    await expect(
      program.methods
        .rolloverPeriod()
        .accounts({ config: configPda, keeper: deployer })
        .rpc(),
    ).rejects.toThrow();
  });
});
