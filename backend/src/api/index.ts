import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyRateLimit from "@fastify/rate-limit";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { registerSeasonRoutes } from "./routes/seasons.js";
import { registerPlayerRoutes } from "./routes/players.js";
import { registerHexRoutes } from "./routes/hexes.js";
import { registerAttackRoutes } from "./routes/attacks.js";
import { registerReputationRoutes } from "./routes/reputation.js";
import { registerFeedRoutes } from "./routes/feed.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerGuardianRoutes } from "./routes/guardian.js";
import { registerWebSocket } from "./ws.js";

export async function startApi() {
  const app = Fastify({ logger: false });

  // Rate limiting
  await app.register(fastifyRateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
  });

  // WebSocket
  await app.register(fastifyWebsocket);

  // CORS — allow all for dev
  app.addHook("onRequest", (req, reply, done) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      reply.status(204).send();
      return;
    }
    done();
  });

  // Health check
  app.get("/api/health", async () => ({ status: "ok", timestamp: Date.now() }));

  // Routes
  registerSeasonRoutes(app);
  registerPlayerRoutes(app);
  registerHexRoutes(app);
  registerAttackRoutes(app);
  registerReputationRoutes(app);
  registerFeedRoutes(app);
  registerStatsRoutes(app);
  registerGuardianRoutes(app);

  // WebSocket
  registerWebSocket(app);

  await app.listen({ port: config.port, host: config.host });
  logger.info(`API server listening on http://${config.host}:${config.port}`);

  return app;
}
