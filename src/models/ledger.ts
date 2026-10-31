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
  includeInAnalytics?: boolean;
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

export type TransactionDraft = ParsedTransaction & {
  amountCny?: number;
  fxRateToCny?: number;
  parseDurationMs?: number;
  originalText?: string;
  pendingInputId?: string;
  pendingDraftId?: string;
  localDraftId?: string;
};

export type PendingInput = {
  _id: string;
  text: string;
  referenceDate: string;
  status: "pending" | "processing" | "ready" | "completed";
  drafts: TransactionDraft[];
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TransactionPresetInput = Pick<TransactionInput,
  "type" | "amount" | "currency" | "category" | "paymentMethod" | "merchant" | "tags" | "note"
> & { name: string };

export type TransactionPreset = TransactionPresetInput & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};
