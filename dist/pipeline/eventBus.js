import { EventEmitter } from "node:events";
import { v4 as uuidv4 } from "uuid";
export class EventBus {
    ee = new EventEmitter();
    seen = new Map(); // dedupKey -> ts
    seenMax = 10000;
    on(type, handler) {
        this.ee.on(type, handler);
        return () => this.ee.off(type, handler);
    }
    publish(topic, type, key, data) {
        const evt = {
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
    onAny(handler) {
        this.ee.on("*", handler);
        return () => this.ee.off("*", handler);
    }
    publishDedup(topic, type, key, data, dedupWindowMs = 1500) {
        const dedupKey = `${type}:${key}`;
        const now = Date.now();
        const last = this.seen.get(dedupKey);
        if (last && now - last < dedupWindowMs)
            return null;
        this.seen.set(dedupKey, now);
        if (this.seen.size > this.seenMax) {
            const keys = Array.from(this.seen.keys()).slice(0, this.seen.size - this.seenMax);
            for (const k of keys)
                this.seen.delete(k);
        }
        return this.publish(topic, type, key, data);
    }
}
