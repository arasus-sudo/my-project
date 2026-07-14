import Fastify from "fastify";
import cors from "@fastify/cors";
import authRoutes from "./routes/auth";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: (process.env.CORS_ORIGINS || "*").split(","),
  });

  app.get("/health", async () => ({ ok: true }));

  app.register(authRoutes, { prefix: "/api" });

  return app;
}
