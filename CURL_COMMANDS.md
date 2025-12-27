# Wallet Service API - CURL Commands

This document contains CURL commands for all available endpoints in the Wallet Service API.

**Base URL:** `http://localhost:3000`

---

## 1. Create User

Creates a new user with an optional initial balance.

**Endpoint:** `POST /api/wallet/users`

```bash
curl --location 'http://localhost:3000/api/wallet/users' \
--header 'accept: application/json' \
--header 'Content-Type: application/json' \
--data '{
  "userId": "44e23031-9e99-4ce8-b9b3-28d101d1fd4e",
  "initialBalance": 123
}'
```

**With default balance (0):**
```bash
curl --location 'http://localhost:3000/api/wallet/users' \
--header 'accept: application/json' \
--header 'Content-Type: application/json' \
--data '{
  "userId": "44e23031-9e99-4ce8-b9b3-28d101d1fd4e"
}'
```

---

## 2. Get Balance

Retrieves the current balance for a specific user.

**Endpoint:** `GET /api/wallet/balance/:userId`

```bash
curl --location 'http://localhost:3000/api/wallet/balance/44e23031-9e99-4ce8-b9b3-28d101d1fd4e' \
--header 'accept: application/json'
```

---

## 3. Process Transaction

Processes a credit or debit transaction with idempotency support.

**Endpoint:** `POST /api/wallet/transact`

### Credit Transaction (Add funds)
```bash
curl --location 'http://localhost:3000/api/wallet/transact' \
--header 'accept: application/json' \
--header 'Content-Type: application/json' \
--data '{
  "idempotentKey": "txn-12345-abcde",
  "userId": "44e23031-9e99-4ce8-b9b3-28d101d1fd4e",
  "amount": "50.00",
  "type": "credit"
}'
```

### Debit Transaction (Remove funds)
```bash
curl --location 'http://localhost:3000/api/wallet/transact' \
--header 'accept: application/json' \
--header 'Content-Type: application/json' \
--data '{
  "idempotentKey": "txn-67890-fghij",
  "userId": "44e23031-9e99-4ce8-b9b3-28d101d1fd4e",
  "amount": "25.50",
  "type": "debit"
}'
```

**Note:** The `idempotentKey` must be unique for each transaction. Reusing the same key will return the same transaction result without processing a duplicate.

---

## 4. Health Check

Checks if the API service is running.

**Endpoint:** `GET /health`

```bash
curl --location 'http://localhost:3000/health' \
--header 'accept: application/json'
```

---

## 5. Root Endpoint

Returns API information and available endpoints.

**Endpoint:** `GET /`

```bash
curl --location 'http://localhost:3000/' \
--header 'accept: application/json'
```

---

## Example Workflow

Here's a complete example workflow:

### Step 1: Create a user
```bash
curl --location 'http://localhost:3000/api/wallet/users' \
--header 'accept: application/json' \
--header 'Content-Type: application/json' \
--data '{
  "userId": "44e23031-9e99-4ce8-b9b3-28d101d1fd4e",
  "initialBalance": 100
}'
```

### Step 2: Check balance
```bash
curl --location 'http://localhost:3000/api/wallet/balance/44e23031-9e99-4ce8-b9b3-28d101d1fd4e' \
--header 'accept: application/json'
```

### Step 3: Credit transaction
```bash
curl --location 'http://localhost:3000/api/wallet/transact' \
--header 'accept: application/json' \
--header 'Content-Type: application/json' \
--data '{
  "idempotentKey": "credit-001",
  "userId": "44e23031-9e99-4ce8-b9b3-28d101d1fd4e",
  "amount": "50.00",
  "type": "credit"
}'
```

### Step 4: Debit transaction
```bash
curl --location 'http://localhost:3000/api/wallet/transact' \
--header 'accept: application/json' \
--header 'Content-Type: application/json' \
--data '{
  "idempotentKey": "debit-001",
  "userId": "44e23031-9e99-4ce8-b9b3-28d101d1fd4e",
  "amount": "30.00",
  "type": "debit"
}'
```

### Step 5: Verify final balance
```bash
curl --location 'http://localhost:3000/api/wallet/balance/44e23031-9e99-4ce8-b9b3-28d101d1fd4e' \
--header 'accept: application/json'
```

---

## Notes

- All endpoints return JSON responses
- The `idempotentKey` in transactions must be unique per transaction
- Transaction amounts are passed as strings (e.g., "50.00")
- Transaction types are either "credit" or "debit"
- The service runs on port 3000 by default (configurable via `PORT` environment variable)

