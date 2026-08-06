import { Kafka, type Consumer, type Producer } from "kafkajs";
import type { AtlasEvent, EventBus } from "./helius.js";
import type { TimeSeriesStore } from "../ingestion/timeseries.js";

/** Kafka topics for the indexer pipeline (roadmap §Phase 2). */
export const TOPICS = {
  /** Raw on-chain events (deposits, swaps, rebalances) from Helius/Geyser. */
  events: "atlas.events",
  /** Aggregated per-manager metric points feeding the Performance Oracle. */
  metrics: "atlas.metrics",
} as const;

export interface IndexerOptions {
  brokers: string[];
  clientId?: string;
  groupId?: string;
  eventBus: EventBus;
  store: TimeSeriesStore;
  kafka?: Kafka;
}

/**
 * Streams on-chain events to Kafka and re-ingests them into the time-series
 * store, decoupling webhook intake from the Performance Oracle loop.
 */
export class Indexer {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private readonly clientId: string;
  private readonly groupId: string;

  constructor(private readonly options: IndexerOptions) {
    this.clientId = options.clientId ?? "atlas-indexer";
    this.groupId = options.groupId ?? "atlas-indexer";
    this.kafka =
      options.kafka ??
      new Kafka({ clientId: this.clientId, brokers: options.brokers });
  }

  /** Publishes every eventBus event to the `atlas.events` topic. */
  async startProducer(): Promise<void> {
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.options.eventBus.subscribe((event) => {
      void this.publish(event).catch((err) => console.error("kafka publish failed", err));
    });
  }

  async publish(event: AtlasEvent): Promise<void> {
    if (!this.producer) return;
    await this.producer.send({
      topic: TOPICS.events,
      messages: [{ key: event.vaultAddress, value: JSON.stringify(event) }],
    });
  }

  /**
   * Consumes `atlas.events` and folds events into metric points for the oracle
   * store (tvl/nav updates when present in the payload).
   */
  async startConsumer(): Promise<void> {
    this.consumer = this.kafka.consumer({ groupId: this.groupId });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPICS.events, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const event = JSON.parse(message.value.toString()) as AtlasEvent;
        const point = this.eventToPoint(event);
        if (point) await this.options.store.appendMetrics([point]);
      },
    });
  }

  async stop(): Promise<void> {
    await this.producer?.disconnect();
    await this.consumer?.disconnect();
    this.producer = null;
    this.consumer = null;
  }

  private eventToPoint(event: AtlasEvent): Parameters<TimeSeriesStore["appendMetrics"]>[0][number] | null {
    const tvl = event.payload.tvl;
    const nav = event.payload.nav;
    const dailyPnl = event.payload.pnl;
    if (typeof tvl !== "number" && typeof nav !== "number" && typeof dailyPnl !== "number") {
      return null;
    }
    return {
      managerId: event.managerId,
      timestamp: event.timestamp * 1000,
      tvl: typeof tvl === "number" ? tvl : 0,
      nav: typeof nav === "number" ? nav : 1,
      feesGenerated: typeof event.payload.fees === "number" ? event.payload.fees : 0,
      dailyPnl: typeof dailyPnl === "number" ? dailyPnl : 0,
      maxDrawdown: 0,
      volatility: 0,
      protocolsUsed: 0,
      poolsTraded: 0,
      governanceActions: 0,
      poolConcentration: 0,
      tokenConcentration: 0,
      protocolConcentration: 0,
      memecoinConcentration: 0,
      stablePoolConcentration: 0,
      slippage: 0,
      feeDecay: 0,
      oracleHealth: 0,
      utilization: 0,
      inventoryImbalance: 0,
    };
  }
}
