export type TransactionType = "expense" | "income" | "transfer" | "refund";

export type CurrencyCode = "CNY" | "HKD" | "USD" | "EUR" | "JPY" | "GBP" | "MOP" | "TWD" | "SGD" | string;

export type PaymentMethod = {
  id: string;
  name: string;
};

export type Category = {
  id: string;
  name: string;
  type?: TransactionType;
};

export type TransactionInput = {
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  amountCny: number;
  fxRateToCny: number;
  date: string;
  category: string;
  paymentMethod: string;
  merchant?: string | null;
  tags: string[];
  note?: string | null;
  originalText?: string | null;
};

export type Transaction = TransactionInput & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};

export type ParsedTransaction = {
  type: TransactionType;
  amount: number | null;
  currency: CurrencyCode | null;
  date: string | null;
  category: string | null;
  paymentMethod: string | null;
  merchant: string | null;
  tags: string[];
  note: string | null;
  confidence: number;
  needsReview: boolean;
};
