export function makeInitialState(rpcLabel, jito) {
    const now = Date.now();
    return {
        status: "STOPPED",
        analytics: {
            status: "STOPPED",
            uptimeSec: 0,
            bankrollSOL: 0,
            equitySOL: 0,
            openPositions: 0,
            dailyPnL_SOL: 0,
            totalPnL_SOL: 0,
            winRate: 0,
            avgHoldSec: 0,
            maxDrawdown_SOL: 0,
            lastAction: "boot",
            rpc: rpcLabel,
            jito,
            risk: { maxPosPct: 0.03, maxOpen: 4, stopLossPct: 0.25, dailyLossPct: 0.05 },
        },
        latestVitals: { t: now, equity: 0, pnl: 0, drawdown: 0, winRate: 0, trades: 0 },
        candidates: new Map(),
        rugAssessments: new Map(),
        rugAlerts: [],
        coinAssessments: new Map(),
        securityAlerts: [],
        latestSystemStatus: undefined,
        recentEvents: [],
    };
}
