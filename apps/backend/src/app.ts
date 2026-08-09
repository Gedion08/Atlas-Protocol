import Fastify, { type FastifyInstance } from "fastify";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { loadEnv, type Env } from "./env.js";
import { registerSecurity } from "./plugins/security.js";
import { registerErrorHandlers } from "./plugins/errors.js";
import { registerMetrics } from "./plugins/metrics.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerVaultRoutes } from "./routes/vaults.js";
import { registerManagerRoutes } from "./routes/managers.js";
import { registerStrategyRoutes } from "./routes/strategies.js";
import { registerLeaderboardRoutes } from "./routes/leaderboard.js";
import { registerInvestorRoutes } from "./routes/investors.js";
import { registerOracleRoutes } from "./routes/oracle.js";
import { registerGovernanceRoutes } from "./routes/governance.js";
import { registerGovernanceExecutionRoutes } from "./routes/governance-execution.js";
import { registerInsuranceRoutes } from "./routes/insurance.js";
import { registerEmergencyExitRoutes } from "./routes/emergency-exit.js";
import { registerStakingRoutes } from "./routes/staking.js";
import { registerTokenRoutes } from "./routes/token.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerWsRoutes } from "./routes/ws.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { createMemoryRepositories, type Repositories } from "./db/repositories.js";
import { createPostgresRepositories } from "./db/repositories-pg.js";
import { buildPgPool } from "./db/bootstrap.js";
import { eventBus } from "./event-bus.js";
import {
  ClickHouseTimeSeriesStore,
  InMemoryTimeSeriesStore,
  PgTimeSeriesStore,
  type TimeSeriesStore,
} from "./services/ingestion/timeseries.js";
import { MetricsAggregator } from "./services/ingestion/aggregator.js";
import { DryRunSubmitter, OracleLoop } from "./services/oracle/index.js";
import { SolanaSubmitter } from "./services/oracle/solana.js";
import { Indexer } from "./services/indexer/kafka.js";
import {
  CircuitBreakerLoop,
  DryRunCircuitBreakerSubmitter,
  SolanaCircuitBreakerSubmitter,
  DryRunVaultEmergencyExitSubmitter,
  SolanaVaultEmergencyExitSubmitter,
} from "./services/circuit-breaker/index.js";
import { VaultClient } from "./services/vault/index.js";
import { DlmmEnricher } from "./services/analytics/dlmm-enricher.js";
import { ClickHouseDlmmAnalyticsStore, type DlmmAnalyticsStore } from "./services/analytics/dlmm.js";

export interface BuildAppOptions {
  env?: Env;
  logger?: boolean | object;
  repositories?: Repositories;
  timeSeries?: TimeSeriesStore;
  vaultClient?: VaultClient;
  dlmmStore?: DlmmAnalyticsStore;
  governanceKeypair?: Keypair;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();
  const app = Fastify({
    logger:
      options.logger ??
      (env.NODE_ENV === "test"
        ? false
        : { level: env.LOG_LEVEL, redact: ["req.headers.authorization"] }),
    trustProxy: true,
    bodyLimit: 1_048_576,
  });
  const serverUrl = `http://${env.HOST === "0.0.0.0" ? "localhost" : env.HOST}:${env.BACKEND_PORT}`;

  let governanceKeypair: Keypair | undefined;
  if (options.governanceKeypair) {
    governanceKeypair = options.governanceKeypair;
  } else if (env.GOVERNANCE_KEYPAIR) {
    try {
      const secret = Uint8Array.from(JSON.parse(env.GOVERNANCE_KEYPAIR) as number[]);
      governanceKeypair = Keypair.fromSecretKey(secret);
    } catch (err) {
      app.log.warn({ err }, "invalid GOVERNANCE_KEYPAIR format");
    }
  }

  let timeSeries: TimeSeriesStore;
  if (options.timeSeries) {
    timeSeries = options.timeSeries;
  } else if (env.REPOSITORY_DRIVER === "postgres") {
    try {
      timeSeries = new PgTimeSeriesStore(buildPgPool(env.DATABASE_URL, { max: 5 }));
    } catch (error) {
      app.log.warn({ error }, "failed to connect to PostgreSQL for timeSeries, falling back to in-memory");
      timeSeries = new InMemoryTimeSeriesStore();
    }
  } else if (env.CLICKHOUSE_ENABLED) {
    timeSeries = new ClickHouseTimeSeriesStore(env.CLICKHOUSE_URL);
  } else {
    timeSeries = new InMemoryTimeSeriesStore();
  }

  let repositories: Repositories;
  if (options.repositories) {
    repositories = options.repositories;
  } else if (env.REPOSITORY_DRIVER === "postgres") {
    try {
      repositories = await createPostgresRepositories();
    } catch (error) {
      app.log.warn({ error }, "failed to connect to PostgreSQL, falling back to in-memory repositories");
      repositories = createMemoryRepositories(timeSeries);
    }
  } else {
    repositories = createMemoryRepositories(timeSeries);
  }

  const aggregator = new MetricsAggregator(timeSeries);
  eventBus.subscribe((event) => void aggregator.ingest([event]));

  const dlmmStore =
    options.dlmmStore ??
    new ClickHouseDlmmAnalyticsStore(env.CLICKHOUSE_URL);
  const dlmmEnricher = new DlmmEnricher(dlmmStore);
  eventBus.subscribe((event) => void dlmmEnricher.enrich(event).catch(() => {}));

  const aggregatorFlushTimer = setInterval(
    () => void aggregator.flushCompletedBuckets().catch(() => {}),
    3_600_000,
  );
  aggregatorFlushTimer.unref();

  const vaultClient =
    options.vaultClient ??
    new VaultClient(
      new Connection(env.SOLANA_RPC_URL, "confirmed"),
      new PublicKey(env.ATLAS_VAULT_PROGRAM_ID),
    );

  let indexer: Indexer | null = null;
  if (env.KAFKA_ENABLED) {
    try {
      indexer = new Indexer({
        brokers: env.KAFKA_BROKERS.split(",").map((b) => b.trim()),
        eventBus,
        store: timeSeries,
      });
      await indexer.startProducer();
      await indexer.startConsumer();
    } catch (err) {
      console.error("failed to start Kafka indexer, continuing without it", err);
      indexer = null;
    }
  }

  let oracleLoop: OracleLoop | null = null;
  if (env.ORACLE_LOOP_ENABLED) {
    const submitter = env.ORACLE_KEYPAIR
      ? new SolanaSubmitter({
          connection: new Connection(env.SOLANA_RPC_URL, "confirmed"),
          oracleKeypair: Keypair.fromSecretKey(
            Uint8Array.from(JSON.parse(env.ORACLE_KEYPAIR) as number[]),
          ),
          programId: new PublicKey(env.ATLAS_REGISTRY_PROGRAM_ID),
        })
      : new DryRunSubmitter();
    oracleLoop = new OracleLoop({
      store: timeSeries,
      submissions: repositories.oracle,
      submitter,
      threshold: env.ORACLE_SUSPEND_THRESHOLD,
      intervalMs: env.ORACLE_LOOP_INTERVAL_MS,
    });
    oracleLoop.start();
  }

   let circuitBreaker: CircuitBreakerLoop | null = null;
   if (env.CIRCUIT_BREAKER_ENABLED) {
     const circuitBreakerSubmitter = governanceKeypair
       ? new SolanaCircuitBreakerSubmitter({
           connection: new Connection(env.SOLANA_RPC_URL, "confirmed"),
           signerKeypair: governanceKeypair,
           programId: new PublicKey(env.ATLAS_REGISTRY_PROGRAM_ID),
         })
       : new DryRunCircuitBreakerSubmitter();
     const vaultEmergencySubmitter = governanceKeypair
       ? new SolanaVaultEmergencyExitSubmitter({
           connection: new Connection(env.SOLANA_RPC_URL, "confirmed"),
           signerKeypair: governanceKeypair,
           programId: new PublicKey(env.ATLAS_VAULT_PROGRAM_ID),
         })
       : new DryRunVaultEmergencyExitSubmitter();
     circuitBreaker = new CircuitBreakerLoop({
      store: timeSeries,
      managers: repositories.managers,
      vaults: repositories.vaults,
      strategies: repositories.strategies,
      submitter: circuitBreakerSubmitter,
      vaultSubmitter: vaultEmergencySubmitter,
      dlmm: {
        latestForStrategy: async (strategyId: string) => {
          const result = await dlmmStore.latestForStrategy(strategyId);
          return result ? { inventorySkew: result.inventorySkew } : null;
        },
      },
      intervalMs: env.CIRCUIT_BREAKER_INTERVAL_MS,
    });
    circuitBreaker.start();
  }

  await registerSecurity(app);
  await registerMetrics(app);
  registerErrorHandlers(app);

  await app.register(import("@fastify/websocket"));
  await app.register(import("@fastify/swagger"), {
    openapi: {
      info: {
        title: "Atlas Protocol API",
        description: "The decentralized operating system for professional liquidity providers",
        version: "0.1.0",
      },
      servers: [{ url: serverUrl }],
      tags: [
        { name: "vaults", description: "Investor vaults" },
        { name: "investors", description: "Investor positions and deposits" },
        { name: "managers", description: "LP managers and scoring" },
        { name: "strategies", description: "Strategy marketplace" },
        { name: "leaderboard", description: "Manager rankings" },
        { name: "risk", description: "Risk engine decisions" },
        { name: "webhooks", description: "External event intake" },
      ],
    },
  });
  await app.register(import("@fastify/swagger-ui"), {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: false },
  });

  app.register(async (scoped) => {
    scoped.register(async (r) => registerHealthRoutes(r, repositories, env));
    scoped.register(async (r) => registerVaultRoutes(r, repositories, vaultClient));
    scoped.register(async (r) => registerInvestorRoutes(r, repositories, undefined, vaultClient));
    scoped.register(async (r) => registerManagerRoutes(r, repositories));
    scoped.register(async (r) => registerStrategyRoutes(r, repositories));
    scoped.register(async (r) => registerLeaderboardRoutes(r, repositories));
    scoped.register(async (r) => registerOracleRoutes(r, repositories));
    scoped.register(async (r) => registerGovernanceRoutes(r, repositories));
    scoped.register(async (r) => registerGovernanceExecutionRoutes(r, repositories, governanceKeypair));
    scoped.register(async (r) => registerInsuranceRoutes(r, repositories));
    scoped.register(async (r) => registerEmergencyExitRoutes(r, repositories, vaultClient, governanceKeypair));
    scoped.register(async (r) => registerStakingRoutes(r, repositories));
    scoped.register(async (r) => registerTokenRoutes(r, repositories));
    scoped.register(async (r) => registerWebhookRoutes(r, env, repositories));
    scoped.register(async (r) => registerWsRoutes(r));
    scoped.register(async (r) => registerAnalyticsRoutes(r, repositories, dlmmStore));
  });

  app.addHook("onClose", async () => {
    circuitBreaker?.stop();
    oracleLoop?.stop();
    await indexer?.stop();
    dlmmEnricher.clearCache();
    if (aggregatorFlushTimer) clearInterval(aggregatorFlushTimer);
    if (timeSeries !== options.timeSeries) {
      await timeSeries.close();
    }
  });

  return app;
}
