// src/scripts/initTables.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  CreateTableCommand,
  ListTablesCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

// Configure DynamoDB client for local Docker instance
const client = new DynamoDBClient({
  region: "local",
  endpoint: "http://localhost:8000",
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
});

// Create document client for easier item operations
const docClient = DynamoDBDocumentClient.from(client);

async function deleteTableIfExists(tableName: string): Promise<void> {
  try {
    const listCommand = new ListTablesCommand({});
    const tables = await client.send(listCommand);

    if (tables.TableNames?.includes(tableName)) {
      console.log(`Deleting existing table: ${tableName}`);
      const deleteCommand = new DeleteTableCommand({ TableName: tableName });
      await client.send(deleteCommand);
      // Wait for table to be deleted
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error(`Error checking/deleting table ${tableName}:`, error);
  }
}

async function createUsersTable(): Promise<void> {
  const command = new CreateTableCommand({
    TableName: "Users",
    KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "userId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  });

  try {
    await client.send(command);
    console.log("Users table created successfully");
  } catch (error) {
    console.error("Error creating Users table:", error);
    throw error;
  }
}

async function createTransactionsTable(): Promise<void> {
  const command = new CreateTableCommand({
    TableName: "Transactions",
    KeySchema: [{ AttributeName: "idempotentKey", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "idempotentKey", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  });

  try {
    await client.send(command);
    console.log("Transactions table created successfully");
  } catch (error) {
    console.error("Error creating Transactions table:", error);
    throw error;
  }
}

async function seedUsers(): Promise<void> {
  console.log("\nSeeding 10 users with random UUIDs and balances...");
  
  const users = [];
  for (let i = 0; i < 10; i++) {
    const userId = randomUUID();
    // Random balance between 50 and 120 (inclusive)
    const balance = Math.floor(Math.random() * (120 - 50 + 1)) + 50;
    
    users.push({
      userId,
      balance,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  try {
    // Insert all users
    for (const user of users) {
      const command = new PutCommand({
        TableName: "Users",
        Item: user,
      });
      await docClient.send(command);
      console.log(`  ✓ Created user ${user.userId} with balance ${user.balance}`);
    }
    console.log(`\n✓ Successfully seeded ${users.length} users`);
  } catch (error) {
    console.error("Error seeding users:", error);
    throw error;
  }
}

async function initializeTables(): Promise<void> {
  console.log("=== DynamoDB Table Initialization ===");

  try {
    // Delete existing tables
    await deleteTableIfExists("Users");
    await deleteTableIfExists("Transactions");

    // Create tables
    await createUsersTable();
    await createTransactionsTable();

    // Seed 10 users with random UUIDs and balances
    await seedUsers();

    console.log("\n✓ All tables initialized successfully!");
    console.log("\nDynamoDB Admin UI: http://localhost:8001");
    console.log("\nReady to run tests!");
  } catch (error) {
    console.error("\n✗ Failed to initialize tables:", error);
    process.exit(1);
  }
}

// Run initialization
initializeTables();