import type { Category, PaymentMethod } from "@/models/ledger";

export const paymentMethods: PaymentMethod[] = [
  { id: "cash", name: "现金" },
  { id: "wechat", name: "微信" },
  { id: "alipay", name: "支付宝" },
  { id: "credit-card", name: "信用卡" },
  { id: "bank-card", name: "银行卡" },
  { id: "octopus", name: "八达通" },
  { id: "apple-pay", name: "Apple Pay" },
  { id: "paypal", name: "PayPal" },
  { id: "stored-card", name: "储值卡" },
  { id: "other", name: "其他" }
];

export const categories: Category[] = [
  { id: "food", name: "餐饮", type: "expense" },
  { id: "transport", name: "交通", type: "expense" },
  { id: "shopping", name: "购物", type: "expense" },
  { id: "housing", name: "住房", type: "expense" },
  { id: "utilities", name: "水电燃气", type: "expense" },
  { id: "telecom", name: "通讯", type: "expense" },
  { id: "medical", name: "医疗", type: "expense" },
  { id: "education", name: "教育", type: "expense" },
  { id: "entertainment", name: "娱乐", type: "expense" },
  { id: "travel", name: "旅行", type: "expense" },
  { id: "digital", name: "数码", type: "expense" },
  { id: "gift", name: "人情", type: "expense" },
  { id: "sports", name: "运动", type: "expense" },
  { id: "salary", name: "工资", type: "income" },
  { id: "bonus", name: "奖金", type: "income" },
  { id: "investment", name: "投资", type: "income" },
  { id: "refund", name: "退款", type: "refund" },
  { id: "transfer", name: "转账", type: "transfer" },
  { id: "other", name: "其他" }
];

export const currencies = ["CNY", "HKD", "USD", "EUR", "JPY", "GBP", "MOP", "TWD", "SGD"];
