import { describe, expect, it, vi } from "vitest";
import { Indexer, TOPICS } from "../src/services/indexer/kafka.js";
import { InMemoryTimeSeriesStore } from "../src/services/ingestion/timeseries.js";
import { MemoryEventBus, type AtlasEvent } from "../src/services/indexer/helius.js";

const send = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}));
const run = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}));
const subscribe = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}));

vi.mock("kafkajs", () => {
  const connect = vi.fn(async () => {});
  const disconnect = vi.fn(async () => {});
  class MockKafka {
    producer() {
      return { connect, send, disconnect };
    }
    consumer() {
      return { connect, subscribe, disconnect, run };
    }
  }
  return { Kafka: MockKafka };
});

const event: AtlasEvent = {
  type: "swap",
  signature: "sig1",
  timestamp: 1_700_000_000,
  slot: 123,
  vaultAddress: "vault1",
  managerId: "mgr_quantum",
  payload: { tvl: 12_400_000, nav: 1.1, pnl: 5_000 },
};

describe("Kafka indexer", () => {
  it("publishes events to the events topic", async () => {
    const eventBus = new MemoryEventBus();
    const indexer = new Indexer({ brokers: ["localhost:9092"], eventBus, store: new InMemoryTimeSeriesStore() });
    await indexer.startProducer();

    await eventBus.publish(event);
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0][0] as unknown as { topic: string; messages: Array<{ key: string; value: string }> };
    expect(sent.topic).toBe(TOPICS.events);
    expect(JSON.parse(sent.messages[0].value).managerId).toBe("mgr_quantum");
  });

  it("consumes events into the time-series store", async () => {
    const store = new InMemoryTimeSeriesStore();
    const indexer = new Indexer({
      brokers: ["localhost:9092"],
      eventBus: new MemoryEventBus(),
      store,
    });
    await indexer.startConsumer();

    const consumeArgs = run.mock.calls[0][0] as unknown as { eachMessage: (args: { message: { value?: Buffer } }) => Promise<void> };
    await consumeArgs.eachMessage({ message: { value: Buffer.from(JSON.stringify(event)) } });

    const points = await store.metricsFor("mgr_quantum", 0, Date.now());
    expect(points).toHaveLength(1);
    expect(points[0].tvl).toBe(12_400_000);
  });

  it("skips events without metric payloads", async () => {
    const store = new InMemoryTimeSeriesStore();
    const indexer = new Indexer({
      brokers: ["localhost:9092"],
      eventBus: new MemoryEventBus(),
      store,
    });
    await indexer.startConsumer();
    const consumeArgs = run.mock.calls[0][0] as unknown as { eachMessage: (args: { message: { value?: Buffer } }) => Promise<void> };
    await consumeArgs.eachMessage({
      message: { value: Buffer.from(JSON.stringify({ ...event, payload: {} })) },
    });
    expect((await store.metricsFor("mgr_quantum", 0, Date.now())).length).toBe(0);
  });
});
