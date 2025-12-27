import { FastifyRequest, FastifyReply } from "fastify";
import {
  getCurrentBalance,
  transact,
  createUser,
} from "#src/services/wallet.service";
import {
  GetBalanceInput,
  TransactInput,
} from "#src/types/wallet.types";

/**
 * Get balance for a user
 * GET /api/wallet/balance/:userId
 */
export async function getBalanceHandler(
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply
) {
  try {
    const { userId } = request.params;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        error: "userId is required",
      });
    }

    const result = await getCurrentBalance({ userId });

    return reply.code(200).send({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const statusCode = error.message?.includes("not found") ? 404 : 500;
    return reply.code(statusCode).send({
      success: false,
      error: error.message || "Failed to retrieve balance",
    });
  }
}

/**
 * Process a transaction (credit or debit)
 * POST /api/wallet/transact
 */
export async function transactHandler(
  request: FastifyRequest<{ Body: TransactInput }>,
  reply: FastifyReply
) {
  try {
    const { idempotentKey, userId, amount, type } = request.body;

    if (!idempotentKey || !userId || !amount || !type) {
      return reply.code(400).send({
        success: false,
        error: "All fields are required: idempotentKey, userId, amount, type",
      });
    }

    const result = await transact({
      idempotentKey,
      userId,
      amount,
      type,
    });

    return reply.code(200).send({
      success: result.success,
      data: {
        transactionId: result.transactionId,
        newBalance: result.newBalance,
        message: result.message,
      },
    });
  } catch (error: any) {
    const statusCode =
      error.message?.includes("Insufficient balance") ||
      error.message?.includes("concurrent") ||
      error.message?.includes("retry")
        ? 409
        : error.message?.includes("not found")
        ? 404
        : error.message?.includes("must be") ||
          error.message?.includes("required")
        ? 400
        : 500;

    return reply.code(statusCode).send({
      success: false,
      error: error.message || "Failed to process transaction",
    });
  }
}

/**
 * Create a new user (helper endpoint for testing/setup)
 * POST /api/wallet/users
 */
export async function createUserHandler(
  request: FastifyRequest<{
    Body: { userId: string; initialBalance?: number };
  }>,
  reply: FastifyReply
) {
  try {
    const { userId, initialBalance = 0 } = request.body;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        error: "userId is required",
      });
    }

    await createUser(userId, initialBalance);

    return reply.code(201).send({
      success: true,
      message: `User ${userId} created successfully`,
      data: {
        userId,
        initialBalance,
      },
    });
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: error.message || "Failed to create user",
    });
  }
}

