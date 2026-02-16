import { Connection } from "@solana/web3.js";
import { config } from "../config.js";
export function makeSolanaConnection() {
    return new Connection(config.solanaHttp, {
        commitment: "processed",
        wsEndpoint: config.solanaWs,
    });
}
