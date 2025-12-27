import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  TransactWriteCommand,
  ScanCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import docClient from "#src/config/dynamodbClient";
import { GetBalanceInput, GetBalanceOutput, TransactInput, TransactOutput } from "#src/types/wallet.types"

const USERS_TABLE = "Users";
const TRANSACTIONS_TABLE = "Transactions";

/**
 * Task 1: Retrieve Current Balance Function
 * Retrieves the current balance for a specified user from DynamoDB
 */
export async function getCurrentBalance(
  input: GetBalanceInput
): Promise<GetBalanceOutput> {
  try {
    const { userId } = input;

    if (!userId) {
      throw new Error("userId is required");
    }

    const command = new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    });

    const result = await docClient.send(command);

    if (!result.Item) {
      throw new Error(`User ${userId} not found`);
    }

    return {
      userId: result.Item.userId,
      balance: result.Item.balance || 0,
    };
  } catch (error) {
    console.error("Error retrieving balance:", error);
    throw error;
  }
}

/**
 * Task 2: Transact Function
 * Processes transactions with DynamoDB-based idempotency, race condition handling, and balance validation
 * 
 * This implementation uses:
 * 1. DynamoDB Transactions table for idempotency checks (idempotentKey as primary key)
 * 2. DynamoDB TransactWriteCommand for atomic operations to prevent race conditions
 * 3. Conditional writes to ensure no duplicate transactions and balance validation
 * 4. All state stored only in DynamoDB tables (no Redis or local state)
 */
export async function transact(
  input: TransactInput
): Promise<TransactOutput> {
  try {
    const { idempotentKey, userId, amount, type } = input;

    // Validate inputs
    if (!idempotentKey || !userId || !amount || !type) {
      throw new Error("All fields are required: idempotentKey, userId, amount, type");
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new Error("Amount must be a positive number");
    }

    if (type !== "credit" && type !== "debit") {
      throw new Error("Type must be either 'credit' or 'debit'");
    }

    // Step 1: Check idempotency using DynamoDB Transactions table
    const getTransactionCommand = new GetCommand({
      TableName: TRANSACTIONS_TABLE,
      Key: { idempotentKey },
    });

    const existingTransaction = await docClient.send(getTransactionCommand);
    
    if (existingTransaction.Item) {
      // Transaction already processed - return cached result
      return {
        success: true,
        transactionId: existingTransaction.Item.transactionId,
        newBalance: existingTransaction.Item.newBalance,
        message: "Transaction already processed (idempotent)",
      };
    }

    // Step 2: Get current user data
    const getUserCommand = new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    });

    const userResult = await docClient.send(getUserCommand);

    if (!userResult.Item) {
      throw new Error(`User ${userId} not found`);
    }

    const currentBalance = userResult.Item.balance || 0;

    // Step 3: Calculate balance change
    const balanceChange = type === "credit" ? numericAmount : -numericAmount;
    const calculatedNewBalance = currentBalance + balanceChange;

    // Step 4: Pre-validate balance won't go negative (optimistic check)
    if (calculatedNewBalance < 0) {
      throw new Error("Insufficient balance: transaction would result in negative balance");
    }

    // Step 5: Generate transaction ID
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    // Step 6: Build the update expression for balance
    // Use ADD operation for atomic balance update (allows concurrent transactions)
    const updateExpression: any = {
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: "ADD balance :balanceChange SET updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":balanceChange": balanceChange,
        ":updatedAt": timestamp,
      },
    };
    
    // For debits, add condition to prevent negative balance
    if (type === "debit") {
      updateExpression.ConditionExpression = "balance >= :minBalance";
      updateExpression.ExpressionAttributeValues[":minBalance"] = numericAmount;
    }

    // Step 7: Use DynamoDB TransactWriteCommand for atomic operations
    // This ensures:
    // - Transaction record is created only if it doesn't exist (idempotency)
    // - User balance is updated atomically using ADD (allows concurrent transactions)
    // - Both operations succeed or fail together (no race conditions)
    const transactCommand = new TransactWriteCommand({
      TransactItems: [
        {
          // Condition: Only insert transaction if idempotentKey doesn't exist
          Put: {
            TableName: TRANSACTIONS_TABLE,
            Item: {
              idempotentKey,
              transactionId,
              userId,
              amount: numericAmount,
              type,
              newBalance: calculatedNewBalance, // Store calculated balance for idempotency
              timestamp,
            },
            ConditionExpression: "attribute_not_exists(idempotentKey)",
          },
        },
        {
          Update: updateExpression,
        },
      ],
    });

    try {
      await docClient.send(transactCommand);
      
      // Step 8: Get the actual new balance after the atomic update
      // This ensures we return the correct balance even with concurrent transactions
      const getUpdatedUserCommand = new GetCommand({
        TableName: USERS_TABLE,
        Key: { userId },
      });
      const updatedUserResult = await docClient.send(getUpdatedUserCommand);
      const actualNewBalance = updatedUserResult.Item?.balance || calculatedNewBalance;
      
      return {
        success: true,
        transactionId,
        newBalance: actualNewBalance,
      };
    } catch (error: any) {
      // Handle conditional check failures
      if (error.name === "TransactionCanceledException") {
        // Check if it's because transaction already exists (idempotency)
        const checkAgain = await docClient.send(getTransactionCommand);
        if (checkAgain.Item) {
          // Get the current actual balance for the user
          const getUserBalanceCommand = new GetCommand({
            TableName: USERS_TABLE,
            Key: { userId },
          });
          const userBalanceResult = await docClient.send(getUserBalanceCommand);
          const currentActualBalance = userBalanceResult.Item?.balance || checkAgain.Item.newBalance;
          
          return {
            success: true,
            transactionId: checkAgain.Item.transactionId,
            newBalance: currentActualBalance,
            message: "Transaction already processed (idempotent - concurrent request)",
          };
        }
        // Otherwise, it's because balance would go negative
        // Re-read the current balance to provide accurate error
        const getCurrentBalanceCommand = new GetCommand({
          TableName: USERS_TABLE,
          Key: { userId },
        });
        const currentBalanceResult = await docClient.send(getCurrentBalanceCommand);
        const latestBalance = currentBalanceResult.Item?.balance || 0;
        const wouldBeBalance = latestBalance + balanceChange;
        
        if (wouldBeBalance < 0) {
          throw new Error("Insufficient balance: transaction would result in negative balance");
        }
        // If we get here, it's an unexpected condition failure - retry
        throw new Error("Transaction failed due to concurrent modification. Please retry.");
      }
      throw error;
    }
  } catch (error) {
    console.error("Error processing transaction:", error);
    throw error;
  }
}

/**
 * Helper function to initialize a user (for testing)
 */
export async function createUser(userId: string, initialBalance: number = 0): Promise<void> {
  const command = new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      userId,
      balance: initialBalance,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });

  await docClient.send(command);
}

/**
 * Helper function to clear transactions table (for testing)
 */
export async function clearTransactionsTable(): Promise<void> {
  try {
    // Scan all items
    const scanCommand = new ScanCommand({
      TableName: TRANSACTIONS_TABLE,
    });
    
    const result = await docClient.send(scanCommand);
    
    // Delete all items
    if (result.Items && result.Items.length > 0) {
      for (const item of result.Items) {
        const deleteCommand = new DeleteCommand({
          TableName: TRANSACTIONS_TABLE,
          Key: { idempotentKey: item.idempotentKey },
        });
        await docClient.send(deleteCommand);
      }
    }
  } catch (error: any) {
    // If table doesn't exist, that's fine - it will be created by setup
    if (error.name !== "ResourceNotFoundException") {
      throw error;
    }
  }
}