import { FastifyInstance } from "fastify";
import {
  getBalanceHandler,
  transactHandler,
  createUserHandler,
} from "#src/controllers/wallet.controller";

/**
 * Wallet routes with request/response schema validation
 */
export async function walletRoutes(fastify: FastifyInstance) {
  // Get balance endpoint
  fastify.get<{
    Params: { userId: string };
  }>(
    "/balance/:userId",
    {
      schema: {
        description: "Get current balance for a user",
        tags: ["wallet"],
        params: {
          type: "object",
          required: ["userId"],
          properties: {
            userId: {
              type: "string",
              description: "The user ID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  userId: { type: "string" },
                  balance: { type: "number" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
            },
          },
        },
      },
    },
    getBalanceHandler
  );

  // Transaction endpoint
  fastify.post<{
    Body: {
      idempotentKey: string;
      userId: string;
      amount: string;
      type: "credit" | "debit";
    };
  }>(
    "/transact",
    {
      schema: {
        description: "Process a credit or debit transaction with idempotency support",
        tags: ["wallet"],
        body: {
          type: "object",
          required: ["idempotentKey", "userId", "amount", "type"],
          properties: {
            idempotentKey: {
              type: "string",
              description: "Unique key for idempotency (prevents duplicate transactions)",
            },
            userId: {
              type: "string",
              description: "The user ID",
            },
            amount: {
              type: "string",
              description: "Transaction amount (must be a positive number)",
            },
            type: {
              type: "string",
              enum: ["credit", "debit"],
              description: "Transaction type: credit adds funds, debit removes funds",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  transactionId: { type: "string" },
                  newBalance: { type: "number" },
                  message: { type: "string" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
            },
          },
          409: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
            },
          },
        },
      },
    },
    transactHandler
  );

  // Create user endpoint (helper for testing/setup)
  fastify.post<{
    Body: {
      userId: string;
      initialBalance?: number;
    };
  }>(
    "/users",
    {
      schema: {
        description: "Create a new user with optional initial balance (helper endpoint for testing/setup)",
        tags: ["wallet"],
        body: {
          type: "object",
          required: ["userId"],
          properties: {
            userId: {
              type: "string",
              description: "The user ID",
            },
            initialBalance: {
              type: "number",
              default: 0,
              description: "Initial balance (defaults to 0)",
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              data: {
                type: "object",
                properties: {
                  userId: { type: "string" },
                  initialBalance: { type: "number" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
            },
          },
        },
      },
    },
    createUserHandler
  );
}

