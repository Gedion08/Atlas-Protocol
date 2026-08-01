import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { createMint, getAssociatedTokenAddress, mintTo, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { AtlasStaking } from "../target/types/atlas_staking";

describe("atlas-staking", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AtlasStaking as Program<AtlasStaking>;

  const authority = provider.wallet.publicKey;
  const manager = anchor.web3.Keypair.generate();
  let bondMint: PublicKey;
  let premiumMint: PublicKey;
  let configPda: PublicKey;
  let bondPda: PublicKey;
  let escrowPda: PublicKey;
  let configBump: number;

  // Vault program ID placeholder: claims are only accepted against vault
  // accounts owned by this program (config.vaultProgram).
  const vaultProgram = new PublicKey("AfCPkgDj8ADzebwdWW9T8WTAyXVqMccaPkQJsQHFMhtr");

  async function pdas() {
    const [config, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("atlas_staking_config")],
      program.programId,
    );
    const [bond] = PublicKey.findProgramAddressSync(
      [Buffer.from("bond"), manager.publicKey.toBuffer()],
      program.programId,
    );
    const [escrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), bond.toBuffer()],
      program.programId,
    );
    return { config, configBump, bond, escrow };
  }

  it("initializes config", async () => {
    ({ config: configPda, configBump, bond: bondPda, escrow: escrowPda } = await pdas());
    premiumMint = await createMint(provider.connection, provider.wallet.payer, authority, authority, 6);

    await program.methods
      .initialize(vaultProgram, premiumMint)
      .accounts({ config: configPda, deployer: authority })
      .rpc();
    const config = await program.account.config.fetch(configPda);
    expect(config.slashAuthority.equals(authority)).toBe(true);
    expect(config.vaultProgram.equals(vaultProgram)).toBe(true);
    expect(config.premiumMint.equals(premiumMint)).toBe(true);
  });

  it("bonds tokens", async () => {
    bondMint = await createMint(provider.connection, provider.wallet.payer, authority, authority, 6);
    const ownerToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      bondMint,
      manager.publicKey,
      true,
    );
    await mintTo(provider.connection, provider.wallet.payer, bondMint, ownerToken.address, authority, 10_000_000);

    await program.methods
      .bond(1_000_000)
      .accounts({
        bond: bondPda,
        escrow: escrowPda,
        bondMint,
        owner: manager.publicKey,
        ownerToken: ownerToken.address,
      })
      .signers([manager])
      .rpc();

    const bond = await program.account.bondAccount.fetch(bondPda);
    expect(bond.amount.toString()).toBe("1000000");
  });

  it("unbond and claim after cooldown", async () => {
    await program.methods
      .unbond()
      .accounts({ bond: bondPda, config: configPda, owner: manager.publicKey })
      .signers([manager])
      .rpc();

    const after = await program.account.bondAccount.fetch(bondPda);
    expect(after.unbondAt.toNumber()).toBeGreaterThan(0);

    await expect(
      program.methods
        .claim()
        .accounts({
          bond: bondPda,
          escrow: escrowPda,
          bondMint,
          owner: manager.publicKey,
          ownerToken: await getAssociatedTokenAddress(bondMint, manager.publicKey),
        })
        .signers([manager])
        .rpc(),
    ).rejects.toThrow();

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(anchor.web3.SYSVAR_CLOCK_PUBKEY, 0),
    );
  });

  it("slash moves funds to insurance escrow", async () => {
    const insuranceEscrow = await getAssociatedTokenAddress(bondMint, configPda, true);

    await program.methods
      .slash(100_000)
      .accounts({
        config: configPda,
        bond: bondPda,
        escrow: escrowPda,
        bondMint,
        insuranceEscrow,
        slashAuthority: authority,
      })
      .rpc();

    const bond = await program.account.bondAccount.fetch(bondPda);
    expect(bond.amount.toString()).toBe("900000");
    expect(bond.slashCount).toBe(1);
  });

  it("rejects slashes from non-authority", async () => {
    const insuranceEscrow = await getAssociatedTokenAddress(bondMint, configPda, true);
    await expect(
      program.methods
        .slash(100_000)
        .accounts({
          config: configPda,
          bond: bondPda,
          escrow: escrowPda,
          bondMint,
          insuranceEscrow,
          slashAuthority: manager.publicKey,
        })
        .signers([manager])
        .rpc(),
    ).rejects.toThrow();
  });

  it("deposits stablecoin premiums into the premium reserve", async () => {
    const [premiumReserve] = PublicKey.findProgramAddressSync(
      [Buffer.from("premium_reserve"), configPda.toBuffer()],
      program.programId,
    );
    const depositorToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      premiumMint,
      authority,
    );
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      premiumMint,
      depositorToken.address,
      authority,
      10_000_000,
    );

    await program.methods
      .depositPremium(250_000)
      .accounts({
        config: configPda,
        premiumReserve,
        depositorToken: depositorToken.address,
        premiumMint,
        depositor: authority,
      })
      .rpc();

    const balance = await provider.connection.getTokenAccountBalance(premiumReserve);
    expect(balance.value.amount).toBe("250000");
  });
});
