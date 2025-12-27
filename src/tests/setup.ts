// Test setup utilities
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  CreateTableCommand,
  ListTablesCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

// Configure DynamoDB client for local Docker instance
const client = new DynamoDBClient({
  region: "local",
  endpoint: "http://localhost:8000",
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
});

/**
 * Ensures a table exists, creating it if it doesn't
 */
async function ensureTableExists(
  tableName: string,
  keySchema: any[],
  attributeDefinitions: any[]
): Promise<void> {
  try {
    // Check if table exists
    const listCommand = new ListTablesCommand({});
    const tables = await client.send(listCommand);

    if (tables.TableNames?.includes(tableName)) {
      // Table exists, verify it's active
      try {
        const describeCommand = new DescribeTableCommand({ TableName: tableName });
        const table = await client.send(describeCommand);
        if (table.Table?.TableStatus === "ACTIVE") {
          return; // Table exists and is active
        }
      } catch (error) {
        // Table might be in creating/deleting state, wait a bit
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Table doesn't exist or isn't active, create it
    const createCommand = new CreateTableCommand({
      TableName: tableName,
      KeySchema: keySchema,
      AttributeDefinitions: attributeDefinitions,
      BillingMode: "PAY_PER_REQUEST",
    });

    await client.send(createCommand);
    
    // Wait for table to become active
    let retries = 10;
    while (retries > 0) {
      try {
        const describeCommand = new DescribeTableCommand({ TableName: tableName });
        const table = await client.send(describeCommand);
        if (table.Table?.TableStatus === "ACTIVE") {
          return;
        }
      } catch (error) {
        // Table still creating
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      retries--;
    }
  } catch (error: any) {
    // If table already exists (race condition), that's fine
    if (error.name !== "ResourceInUseException") {
      throw error;
    }
  }
}

/**
 * Ensures all required tables exist for testing
 */
export async function ensureTestTables(): Promise<void> {
  try {
    // Ensure Users table exists
    await ensureTableExists(
      "Users",
      [{ AttributeName: "userId", KeyType: "HASH" }],
      [{ AttributeName: "userId", AttributeType: "S" }]
    );

    // Ensure Transactions table exists
    await ensureTableExists(
      "Transactions",
      [{ AttributeName: "idempotentKey", KeyType: "HASH" }],
      [{ AttributeName: "idempotentKey", AttributeType: "S" }]
    );
  } catch (error) {
    console.error("Error ensuring test tables:", error);
    throw error;
  }
}

