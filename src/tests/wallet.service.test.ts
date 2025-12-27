import { describe, test, expect, beforeAll } from "vitest";
import {
  getCurrentBalance,
  transact,
  createUser,
  clearTransactionsTable,
} from "#src/services/wallet.service";
import { ensureTestTables } from "./setup";
import { randomUUID } from "node:crypto";

/**
 * Test Suite for Balance Service with DynamoDB Idempotency
 * Run with: npm test
 * 
 * Note: Make sure DynamoDB Local is running (npm run docker:up)
 */

describe("Wallet Service Tests", () => {
  beforeAll(async () => {
    // Ensure tables exist before running tests
    await ensureTestTables();
    // Clear transactions table before starting tests
    await clearTransactionsTable();
  });

  test("Get Current Balance", async () => {
    const userId = randomUUID();
    await createUser(userId, 100);

    const result = await getCurrentBalance({ userId });

    expect(result.balance).toBe(100);
    expect(result.userId).toBe(userId);
  });

  test("Credit Transaction", async () => {
    const userId = randomUUID();
    await createUser(userId, 50);

    const result = await transact({
      idempotentKey: "credit-test-1",
      userId,
      amount: "30",
      type: "credit",
    });

    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(80);
    expect(result.transactionId).toBeDefined();
  });

  test("Debit Transaction", async () => {
    const userId = randomUUID();
    await createUser(userId, 100);

    const result = await transact({
      idempotentKey: "debit-test-1",
      userId,
      amount: "40",
      type: "debit",
    });

    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(60);
    expect(result.transactionId).toBeDefined();
  });

  test("Insufficient Balance Protection", async () => {
    const userId = randomUUID();
    await createUser(userId, 20);

    await expect(
      transact({
        idempotentKey: "insufficient-test-1",
        userId,
        amount: "50",
        type: "debit",
      })
    ).rejects.toThrow("Insufficient balance");
  });

  test("DynamoDB-Based Idempotency", async () => {
    const userId = randomUUID();
    await createUser(userId, 100);

    // First transaction
    const result1 = await transact({
      idempotentKey: "dynamodb-idempotent-key-1",
      userId,
      amount: "25",
      type: "credit",
    });

    // Second transaction with same idempotent key (should return cached result)
    const result2 = await transact({
      idempotentKey: "dynamodb-idempotent-key-1",
      userId,
      amount: "25",
      type: "credit",
    });

    // Verify balance hasn't changed
    const balance = await getCurrentBalance({ userId });

    expect(result1.newBalance).toBe(125);
    expect(result2.newBalance).toBe(125);
    expect(balance.balance).toBe(125);
    expect(result1.transactionId).toBe(result2.transactionId);
    expect(result2.message).toContain("idempotent");
  });

  test("Race Condition Handling with DynamoDB Transactions - Same Idempotent Key", async () => {
    const userId = randomUUID();
    await createUser(userId, 100);

    // Simulate concurrent transactions with SAME idempotent key
    // Only one should succeed, others should return idempotent result
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        transact({
          idempotentKey: `race-test-same-key`,
          userId,
          amount: "10",
          type: "credit",
        })
      );
    }

    const results = await Promise.allSettled(promises);
    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    // Check final balance - should only be credited once due to idempotency
    const balance = await getCurrentBalance({ userId });
    
    expect(balance.balance).toBe(110);
    expect(successful).toBe(5); // All should succeed (some as idempotent)
    expect(failed).toBe(0);
    
    // All should have the same transaction ID
    const transactionIds = results
      .filter((r) => r.status === "fulfilled")
      .map((r: any) => r.value.transactionId);
    const uniqueIds = new Set(transactionIds);
    expect(uniqueIds.size).toBe(1); // All should be the same transaction
  });

  test("Race Condition Handling with DynamoDB Transactions - Different Idempotent Keys", async () => {
    const userId = randomUUID();
    await createUser(userId, 100);

    // Simulate concurrent transactions with DIFFERENT idempotent keys
    // All should succeed, but balance updates should be atomic
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        transact({
          idempotentKey: `race-test-different-key-${i}`,
          userId,
          amount: "10",
          type: "credit",
        })
      );
    }

    const results = await Promise.allSettled(promises);
    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    // Check final balance - should be credited 5 times (50 total)
    const balance = await getCurrentBalance({ userId });
    
    expect(balance.balance).toBe(150); // 100 + (10 * 5)
    expect(successful).toBe(5);
    expect(failed).toBe(0);
    
    // All should have different transaction IDs
    const transactionIds = results
      .filter((r) => r.status === "fulfilled")
      .map((r: any) => r.value.transactionId);
    const uniqueIds = new Set(transactionIds);
    expect(uniqueIds.size).toBe(5); // All should be different transactions
  });

  test("Concurrent Requests with Same Idempotent Key", async () => {
    const userId = randomUUID();
    await createUser(userId, 200);

    // Simulate 5 concurrent requests with the SAME idempotent key
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        transact({
          idempotentKey: "concurrent-same-key",
          userId,
          amount: "50",
          type: "credit",
        })
      );
    }

    const results = await Promise.allSettled(promises);
    const successful = results.filter((r) => r.status === "fulfilled");

    // All should return the same transaction ID
    const transactionIds = successful.map(
      (r: any) => r.value.transactionId
    );
    const uniqueIds = new Set(transactionIds);

    // Check final balance - should only be credited once
    const balance = await getCurrentBalance({ userId });

    expect(balance.balance).toBe(250);
    expect(uniqueIds.size).toBe(1);
  });

  test("Multiple Sequential Transactions", async () => {
    const userId = randomUUID();
    await createUser(userId, 200);

    // Credit
    await transact({
      idempotentKey: "multi-1",
      userId,
      amount: "50",
      type: "credit",
    });

    // Debit
    await transact({
      idempotentKey: "multi-2",
      userId,
      amount: "30",
      type: "debit",
    });

    // Credit
    await transact({
      idempotentKey: "multi-3",
      userId,
      amount: "20",
      type: "credit",
    });

    const balance = await getCurrentBalance({ userId });

    // 200 + 50 - 30 + 20 = 240
    expect(balance.balance).toBe(240);
  });

  describe("Invalid Input Validation", () => {
    test("Should reject empty userId", async () => {
      await expect(
        transact({
          idempotentKey: "invalid-1",
          userId: "",
          amount: "10",
          type: "credit",
        })
      ).rejects.toThrow();
    });

    test("Should reject negative amount", async () => {
      const userId = randomUUID();
      await createUser(userId, 100);

      await expect(
        transact({
          idempotentKey: "invalid-2",
          userId,
          amount: "-10",
          type: "credit",
        })
      ).rejects.toThrow();
    });

    test("Should reject invalid transaction type", async () => {
      const userId = randomUUID();
      await createUser(userId, 100);

      await expect(
        transact({
          idempotentKey: "invalid-3",
          userId,
          amount: "10",
          type: "invalid" as any,
        })
      ).rejects.toThrow();
    });

    test("Should reject non-existent user", async () => {
      await expect(
        transact({
          idempotentKey: "invalid-4",
          userId: "non-existent-user",
          amount: "10",
          type: "credit",
        })
      ).rejects.toThrow();
    });
  });
});
