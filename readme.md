
# Wallet Service

  

A wallet service built with TypeScript and DynamoDB. Handles balance tracking and transactions with idempotency and race condition protection using only DynamoDB.

  

## Architecture

  

Everything runs locally in Docker - no AWS account needed. DynamoDB Local handles all data storage including idempotency tracking.

  

**Services:**

- DynamoDB: `localhost:8000`

- DynamoDB Admin UI: `localhost:8001` (useful for debugging)

  

**Database Schema:**

  

The `Users` table in DynamoDB has:

-  `userId` as the primary key

-  `balance` (number)

-  `createdAt` and `updatedAt` timestamps

  

The `Transactions` table in DynamoDB has:

-  `idempotentKey` as the primary key (ensures uniqueness)

-  `transactionId` (unique transaction identifier)

-  `userId` (reference to user)

-  `amount` (transaction amount)

-  `type` (credit or debit)

-  `newBalance` (balance after transaction)

-  `timestamp` (when transaction was processed)

  

**Initial Data:**

  

When you run `npm run init-tables`, the script automatically seeds 10 users with:

- Random UUIDs (generated using `crypto.randomUUID()`)

- Random balances between 50 and 120 (inclusive)

- Timestamps for `createdAt` and `updatedAt`

  

**How Idempotency Works:**

  

When a transaction comes in:

1. Check the `Transactions` table - if the `idempotentKey` exists, return the cached result

2. Use DynamoDB `TransactWriteCommand` to atomically:

- Insert the transaction record (only if `idempotentKey` doesn't exist)

- Update the user's balance (only if balance hasn't changed and won't go negative)

3. Both operations succeed or fail together, ensuring no race conditions

  

The `Transactions` table uses `idempotentKey` as the primary key, which ensures uniqueness and prevents duplicate transactions. The conditional write (`attribute_not_exists(idempotentKey)`) ensures that if two requests with the same key arrive simultaneously, only one will succeed.

  

**Race Condition Handling:**

  

Uses DynamoDB `TransactWriteCommand` for atomic operations. When processing a transaction:

1. Check if transaction already exists in `Transactions` table (idempotency check)

2. Use `TransactWriteCommand` to atomically:

- Insert transaction record with condition: `attribute_not_exists(idempotentKey)`

- Update user balance with condition: `balance = :currentBalance AND :newBalance >= 0`

3. If either condition fails, the entire transaction is rolled back

4. If transaction already exists, return the cached result

  

The conditional expressions ensure:

- No duplicate transactions (idempotency)

- No race conditions (balance check prevents concurrent modifications)

- No negative balances (balance validation)

  

## Prerequisites

  

You'll need:

- Node.js v18+

- Docker and Docker Compose

- npm (or yarn if you prefer)

  

## No AWS account needed - everything runs locally.

  

## Getting Started

  

Clone the repo and install dependencies:

```bash

git clone https://github.com/Sachin-Yawalkar/wallet-service.git

cd  wallet-service

npm  install

```

  

Start the Docker services:

```bash

npm  run  docker:up

```

  

This spins up DynamoDB Local and the DynamoDB Admin UI.

  

Initialize the tables:

```bash

npm  run  init-tables

```

  

This will:

- Create the Users and Transactions tables in DynamoDB

- Seed 10 users with random UUIDs and balances between 50 and 120

  

Run the tests:

```bash

npm  test

```

  

**Note:** Tests will automatically create the required tables if they don't exist. Make sure DynamoDB Local is running first:

```bash

npm  run  docker:up

```

  

Or if you want to run the full test suite (includes setup):

```bash

npm  run  full-test

```

  

## Tests

  

There are 9 tests covering:

- Basic balance retrieval

- Credit and debit transactions

- Preventing negative balances

- Idempotency (same key = same result)

- Race conditions with concurrent requests

- Input validation

  

## Usage

  

**Get balance:**

```typescript

import { getCurrentBalance } from  './services/wallet.service';

  

const  result  =  await  getCurrentBalance({ userId:  '1' });

console.log(result); // { userId: '1', balance: 100 }

```

  

**Process a transaction:**

```typescript

import { transact } from  './services/wallet.service';

  

// Add money

const  creditResult  =  await  transact({

idempotentKey:  'unique-key-1',

userId:  '1',

amount:  '50',

type:  'credit'

});

  

// Remove money

const  debitResult  =  await  transact({

idempotentKey:  'unique-key-2',

userId:  '1',

amount:  '25',

type:  'debit'

});

```

  

The `idempotentKey` is important - if you send the same key twice, you'll get the same result back (no double charging).

  

## Safety & Reliability

  

**Idempotency:** Same idempotent key always returns the same result. Results are stored in the `Transactions` table in DynamoDB. If two requests come in with the same key at the same time, DynamoDB's conditional writes ensure only one succeeds.

  

**Race Conditions:** Handled with DynamoDB `TransactWriteCommand` for atomic operations. The conditional expressions ensure that if the balance changes between read and write, the transaction fails and must be retried. This prevents race conditions without requiring external locks.

  

**Balance Protection:** Can't go negative. All updates are atomic and validated before committing using conditional expressions in DynamoDB.

  

**Error Handling:** Inputs are validated, errors are descriptive, and all operations are atomic (either fully succeed or fully fail).
  

## API Reference

  

**getCurrentBalance(input)**

  

Returns the current balance for a user.

  

Input:

```typescript

{ userId: string }

```

  

Output:

```typescript

{ userId: string, balance: number }

```

  

**transact(input)**

  

Processes a credit or debit transaction.

  

Input:

```typescript

{

idempotentKey: string,

userId: string,

amount: string,

type: 'credit'  |  'debit'

}

```

  

Output:

```typescript

{

success: boolean,

transactionId: string,

newBalance: number,

message?:  string

}

```

  

## Docker Commands

  

```bash

# Start everything

npm  run  docker:up

  

# Stop everything

npm  run  docker:down

  

# View DynamoDB Admin UI (helpful for debugging)

open  http://localhost:8001

```

  

## Monitoring & Debugging

  

The DynamoDB Admin UI at `http://localhost:8001` is pretty useful for seeing what's in your tables. You can:

- View all users in the `Users` table

- View all transactions in the `Transactions` table

- Inspect transaction details including idempotent keys

- Verify balances and transaction history

  

## Error Handling

  

The service handles:

- User not found

- Insufficient balance (won't let you go negative)

- Invalid input

- Race conditions (returns a retry message if balance changed concurrently)

- Duplicate transactions (returns cached result from Transactions table)

- Transaction conflicts (handled automatically by DynamoDB conditional writes)

  

## Performance Notes

  

All operations use DynamoDB with PAY_PER_REQUEST billing which works well for variable workloads. The `TransactWriteCommand` ensures atomic operations with strong consistency. Idempotency is handled by storing transaction records in the `Transactions` table, which can be cleaned up periodically if needed (though there's no automatic expiration).

  

## Cleanup

  

```bash

# Stop containers

npm  run  docker:down

  

# Remove everything including data

docker-compose  down  -v

```

  

## License

  

MIT

  

## Troubleshooting

  

**Docker containers won't start:**

  

Probably a port conflict. Check what's using the ports:

```bash

lsof  -i  :8000  # DynamoDB

lsof  -i  :8001  # DynamoDB Admin

```

  

Then stop any conflicting services and try again:

```bash

docker-compose  down

```

  

**DynamoDB connection errors:**

  

Check if it's running:

```bash

docker  ps  |  grep  dynamodb

docker  logs  dynamodb-local

```

  

**Tests failing:**

  

Sometimes the tables get into a weird state. Try:

```bash

# Recreate tables (this will clear all data)

npm  run  init-tables

  

# Run tests again

npm  test

```


## Extra
  

- For detailed API usage and interactive documentation, use 📚 Swagger UI: [http://localhost:3000/docs](http://localhost:3000/docs) or see [CURL_COMMANDS.md](./CURL_COMMANDS.md)

  ---
#### NOTE: Used Cursor web editor and AI Agent while solving this assessment
