import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { walletRoutes } from "#src/routes/wallet.routes";

const server = Fastify({
  logger: {
    level: "info",
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
});

// Register Swagger
server.register(swagger, {
  openapi: {
    info: {
      title: "Wallet Service API",
      description: "A robust wallet service with balance management and transaction processing",
      version: "1.0.0",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
    ],
    tags: [
      {
        name: "wallet",
        description: "Wallet operations",
      },
    ],
  },
});

// Register Swagger UI
server.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: false,
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
});

// Register routes
server.register(walletRoutes, { prefix: "/api/wallet" });

// Health check endpoint
server.get(
  "/health",
  {
    schema: {
      description: "Health check endpoint",
      tags: ["health"],
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            timestamp: { type: "string" },
          },
        },
      },
    },
  },
  async (request, reply) => {
    return reply.code(200).send({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }
);

// Root endpoint
server.get("/", async (request, reply) => {
  return reply.code(200).send({
    message: "Wallet Service API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      getBalance: "GET /api/wallet/balance/:userId",
      transact: "POST /api/wallet/transact",
      createUser: "POST /api/wallet/users",
    },
  });
});

// Start server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || "0.0.0.0";

    await server.listen({ port, host });

    console.log(`
🚀 Wallet Service API is running!
📍 Server: http://${host === "0.0.0.0" ? "localhost" : host}:${port}
📚 Swagger UI: http://${host === "0.0.0.0" ? "localhost" : host}:${port}/docs
📖 OpenAPI JSON: http://${host === "0.0.0.0" ? "localhost" : host}:${port}/docs/json
🔍 Health Check: http://${host === "0.0.0.0" ? "localhost" : host}:${port}/health
    `);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on("SIGINT", async () => {
  try {
    await server.close();
    console.log("\n✅ Server closed gracefully");
    process.exit(0);
  } catch (err) {
    console.error("Error closing server:", err);
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
  try {
    await server.close();
    console.log("\n✅ Server closed gracefully");
    process.exit(0);
  } catch (err) {
    console.error("Error closing server:", err);
    process.exit(1);
  }
});

start();

