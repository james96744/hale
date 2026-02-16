import { WebSocketServer } from "ws";
import { config } from "../config.js";
export function attachWsTelemetry(server, hub) {
    const wss = new WebSocketServer({ server, path: "/ws/telemetry" });
    const heartbeat = new WeakMap();
    const pingTimer = setInterval(() => {
        for (const socket of wss.clients) {
            const alive = heartbeat.get(socket) ?? true;
            if (!alive) {
                socket.terminate();
                continue;
            }
            heartbeat.set(socket, false);
            socket.ping();
        }
    }, 20_000);
    wss.on("close", () => clearInterval(pingTimer));
    wss.on("connection", (socket, req) => {
        if (wss.clients.size > 300) {
            socket.close(1013, "server_busy");
            return;
        }
        const url = new URL(req.url ?? "", `http://${req.headers.host}`);
        const tokenQ = url.searchParams.get("token");
        const authH = req.headers["authorization"];
        const tokenH = authH?.startsWith("Bearer ") ? authH.slice("Bearer ".length) : null;
        if ((tokenQ ?? tokenH) !== config.authToken) {
            socket.close(1008, "unauthorized");
            return;
        }
        const unsub = hub.subscribe((msg) => {
            if (socket.readyState === socket.OPEN)
                socket.send(JSON.stringify(msg));
        });
        heartbeat.set(socket, true);
        socket.on("pong", () => heartbeat.set(socket, true));
        socket.on("close", () => unsub());
        socket.on("error", () => unsub());
    });
    return wss;
}
