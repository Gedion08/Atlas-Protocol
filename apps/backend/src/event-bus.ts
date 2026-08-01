import { MemoryEventBus, type EventBus } from "./services/indexer/helius.js";

export const eventBus: EventBus = new MemoryEventBus();
