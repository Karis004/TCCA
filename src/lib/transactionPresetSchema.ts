import { z } from "zod";

export const transactionPresetSchema = z.object({
  name: z.string().trim().min(1, "请填写预设名称。").max(80, "预设名称最多 80 个字。"),
  type: z.enum(["expense", "income", "transfer", "refund"]),
  amount: z.number().finite().positive("请填写大于零的金额。"),
  currency: z.string().trim().toUpperCase().transform((value) => value === "RMB" ? "CNY" : value).pipe(z.string().regex(/^[A-Z]{3}$/, "请选择有效币种。")),
  category: z.string().trim().min(1, "请填写分类。"),
  paymentMethod: z.string().trim().min(1, "请填写支付方式。"),
  merchant: z.string().trim().nullable().optional(),
  tags: z.array(z.string()).default([]),
  note: z.string().trim().nullable().optional()
});
