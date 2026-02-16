import { EventEmitter } from "node:events";
import { v4 as uuidv4 } from "uuid";
import type { RelayEvent, Topic, EventType } from "../types/events.js";

type Handler<T> = (evt: RelayEvent<T>) => void;

export class EventBus {
  private ee = new EventEmitter();
  private seen = new Map<string, number>(); // dedupKey -> ts
  private seenMax = 10000;

  on<T>(type: EventType, handler: Handler<T>) {
    this.ee.on(type, handler as any);
    return () => this.ee.off(type, handler as any);
  }

  publish<T>(topic: Topic, type: EventType, key: string, data: T): RelayEvent<T> {
    const evt: RelayEvent<T> = {
      id: uuidv4(),
      ts: Date.now(),
      topic,
      type,
      key,
      data,
    };
    this.ee.emit(type, evt);
    this.ee.emit("*", evt);
    return evt;
  }

  onAny(handler: Handler<any>) {
    this.ee.on("*", handler as any);
    return () => this.ee.off("*", handler as any);
  }

  publishDedup<T>(
    topic: Topic,
    type: EventType,
    key: string,
    data: T,
    dedupWindowMs = 1500
  ): RelayEvent<T> | null {
    const dedupKey = `${type}:${key}`;
    const now = Date.now();
    const last = this.seen.get(dedupKey);
    if (last && now - last < dedupWindowMs) return null;

    this.seen.set(dedupKey, now);
    if (this.seen.size > this.seenMax) {
      const keys = Array.from(this.seen.keys()).slice(0, this.seen.size - this.seenMax);
      for (const k of keys) this.seen.delete(k);
    }

    return this.publish(topic, type, key, data);
  }
}
