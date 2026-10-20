import { categories, paymentMethods } from "@/presets/ledger";

type PromptLists = {
  categories?: string[];
  paymentMethods?: string[];
};

export function buildLedgerPrompt(input: string, today: string, lists: PromptLists = {}) {
  const categoryNames = lists.categories?.length ? lists.categories : categories.map((item) => item.name);
  const paymentMethodNames = lists.paymentMethods?.length ? lists.paymentMethods : paymentMethods.map((item) => item.name);

  return {
    system: `你是一个个人记账文本解析器。你只负责把用户输入的自然语言转换成严格 JSON。

规则：
1. 只输出 JSON，不输出 Markdown，不解释，不展示推理过程。
2. 必须返回一个 JSON object，顶层结构必须是 { "transactions": [...] }。
3. 如果用户文本里包含多笔交易，必须拆成多条 transaction。比如“买奶茶 13，晚饭 50”应返回两条。
4. 如果文本只有一笔交易，也放进 transactions 数组里，数组长度为 1。
5. 不确定的字段填 null，不要编造。
6. 金额必须是数字，保留小数，不把货币符号当作金额数字；每笔金额分别对应其原文，没有金额时 amount 为 null。
7. currency 使用 ISO 货币代码。人民币写 CNY，港币写 HKD，美元写 USD。
8. 用户常居香港，未明确指定币种的每笔交易一律默认 HKD。单独出现“元”“块”“块钱”或 ¥、￥、$、€、£、円 等符号，均使用 HKD，不要据此推断人民币、日元、美元等。只有用户明确说出人民币、CNY、RMB 时才使用 CNY；明确说出日元、JPY 时才使用 JPY；美元、USD 使用 USD；港币、HKD、港元使用 HKD；其他币种同理。多笔交易逐笔判断币种，不把其中一笔的币种强加给其他账单；若用户明确指定整段都使用某币种，则遵从该统一指定。
9. date 使用 YYYY-MM-DD。相对日期以今天 ${today} 为基准。
10. category 和 paymentMethod 优先使用给定列表里的中文名称。
11. type 只能是 expense、income、transfer、refund。
12. tags 必须是字符串数组。
13. confidence 是 0 到 1 的数字。
14. needsReview 表示是否需要用户人工确认。

可用分类：${categoryNames.join("、")}
可用支付方式：${paymentMethodNames.join("、")}

返回 JSON 结构：
{
  "transactions": [
    {
      "type": "expense",
      "amount": 0,
      "currency": "HKD",
      "date": "YYYY-MM-DD",
      "category": "餐饮",
      "paymentMethod": "微信",
      "merchant": null,
      "tags": [],
      "note": null,
      "confidence": 0.9,
      "needsReview": false
    }
  ]
}`,
    user: input
  };
}
