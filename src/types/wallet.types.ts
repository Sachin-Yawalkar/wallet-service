export type GetBalanceInput = {
  userId: string;
}

export type GetBalanceOutput = {
  userId: string;
  balance: number;
}

export type TransactInput = {
  idempotentKey: string;
  userId: string;
  amount: string;
  type: "credit" | "debit";
}

export type TransactOutput = {
  success: boolean;
  transactionId: string;
  newBalance: number;
  message?: string;
}