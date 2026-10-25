"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { getCurrentMonth } from "@/lib/analytics";
import type { AnalyticsDisplayCurrency } from "@/lib/analytics";
import { TransactionEditor } from "@/components/TransactionEditor";
import { TransactionPresetList } from "@/components/TransactionPresetList";
import { PendingInputList } from "@/components/PendingInputList";
import { mergePendingDrafts, pendingKey } from "@/lib/pendingInputs";
import { ledgerToday, presetToDraft, suggestPresetName } from "@/lib/transactionPresets";
import type { Category, TransactionDraft as Draft, PaymentMethod, Transaction, TransactionInput, TransactionPreset, PendingInput } from "@/models/ledger";
import { categories as defaultCategories, paymentMethods as defaultPaymentMethods } from "@/presets/ledger";

type Tab = "entry" | "analytics" | "records" | "settings";
type PresetForm = { id?: string; name: string; draft: Draft };

type EditingDraft = Draft & {
  _id: string;
};

const tabs: { key: Tab; label: string }[] = [
  { key: "entry", label: "记账" },
  { key: "analytics", label: "分析" },
  { key: "records", label: "流水" },
  { key: "settings", label: "设置" }
];

function money(value = 0) {
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getDraftsFromParseResponse(data: unknown) {
  if (!data || typeof data !== "object") return [];

  if (Array.isArray(data)) {
    return data as Draft[];
  }

  const maybeData = data as { transactions?: unknown };
  if (Array.isArray(maybeData.transactions)) {
    return maybeData.transactions as Draft[];
  }

  return [data as Draft];
}

function draftToPayload(draft: Draft): Omit<TransactionInput, "amountCny" | "fxRateToCny"> {
  return {
    type: draft.type,
    amount: Number(draft.amount || 0),
    currency: (draft.currency || "HKD").toUpperCase(),
    date: draft.date || new Date().toISOString().slice(0, 10),
    category: draft.category?.trim() || "未分类",
    paymentMethod: draft.paymentMethod?.trim() || "未指定",
    merchant: draft.merchant,
    tags: draft.tags || [],
    note: draft.note,
    originalText: draft.originalText || null
  };
}

function transactionToDraft(transaction: Transaction): EditingDraft {
  return {
    _id: transaction._id,
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    date: transaction.date,
    category: transaction.category,
    paymentMethod: transaction.paymentMethod,
    merchant: transaction.merchant || null,
    tags: transaction.tags || [],
    note: transaction.note || null,
    confidence: 1,
    needsReview: true,
    amountCny: transaction.amountCny,
    fxRateToCny: transaction.fxRateToCny,
    originalText: transaction.originalText || undefined
  };
}

function readStoredLists() {
  const modelLists = localStorage.getItem("ai-ledger-model-lists");
  const customLists = localStorage.getItem("ai-ledger-custom-lists");
  const stored = modelLists || customLists;
  if (!stored) return null;

  try {
    const data = JSON.parse(stored) as Partial<{
      categories: Category[];
      paymentMethods: PaymentMethod[];
    }>;

    if (!modelLists && customLists) {
      return {
        categories: Array.isArray(data.categories) ? [...defaultCategories, ...data.categories] : defaultCategories,
        paymentMethods: Array.isArray(data.paymentMethods) ? [...defaultPaymentMethods, ...data.paymentMethods] : defaultPaymentMethods
      };
    }

    return data;
  } catch {
    localStorage.removeItem("ai-ledger-model-lists");
    localStorage.removeItem("ai-ledger-custom-lists");
    return null;
  }
}

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("entry");
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editingDraft, setEditingDraft] = useState<EditingDraft | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionPresets, setTransactionPresets] = useState<TransactionPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetError, setPresetError] = useState("");
  const [presetForm, setPresetForm] = useState<PresetForm | null>(null);
  const [presetFormError, setPresetFormError] = useState("");
  const [presetSaving, setPresetSaving] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const draftAreaRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPaymentMethods);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newPaymentMethodName, setNewPaymentMethodName] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [analysisCurrency, setAnalysisCurrency] = useState<AnalyticsDisplayCurrency>("HKD");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [parseError, setParseError] = useState("");
  const [pendingInputs, setPendingInputs] = useState<PendingInput[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingError, setPendingError] = useState("");
  const [pendingProgress, setPendingProgress] = useState("");
  const [pendingSaving, setPendingSaving] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<PendingInput | null>(null);
  const [pendingEditError, setPendingEditError] = useState("");
  const pendingLock = useRef(false);

  const loadPendingInputs = useCallback(async () => {
    setPendingError("");
    try {
      const response = await fetch("/api/pending-inputs");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取暂存文字失败。");
      setPendingInputs(data);
      setDrafts((current) => mergePendingDrafts(current, data));
    } catch (err) { setPendingError(err instanceof Error ? err.message : "读取暂存文字失败。"); }
    finally { setPendingLoading(false); }
  }, []);
  useEffect(() => { void loadPendingInputs(); }, [loadPendingInputs]);

  async function savePendingText() {
    if (!text.trim() || pendingSaving) return;
    const savedText = text;
    setPendingSaving(true);
    setPendingError("");
    try {
      const response = await fetch("/api/pending-inputs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: savedText, referenceDate: ledgerToday() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "暂存失败。");
      setPendingInputs((current) => [...current, data]);
      setText((current) => current === savedText ? "" : current);
      setParseError("");
      setMessage("文字已暂存，可继续记下一笔；恢复后可批量识别。");
    } catch (err) { setPendingError(err instanceof Error ? err.message : "暂存失败，输入文字已保留。"); }
    finally { setPendingSaving(false); }
  }

  async function editPendingText(form: HTMLFormElement) {
    if (!pendingEdit) return;
    setPendingSaving(true);
    setPendingEditError("");
    try {
      const fields = new FormData(form);
      const response = await fetch(`/api/pending-inputs?id=${pendingEdit._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: fields.get("text"), referenceDate: fields.get("referenceDate") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败。");
      setPendingInputs((current) => current.map((item) => item._id === data._id ? data : item));
      setPendingEdit(null);
    } catch (err) { setPendingEditError(err instanceof Error ? err.message : "保存失败。"); }
    finally { setPendingSaving(false); }
  }

  async function deletePendingInput(input: PendingInput) {
    setPendingError("");
    try {
      const response = await fetch(`/api/pending-inputs?id=${input._id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除失败。");
      setPendingInputs((current) => current.filter((item) => item._id !== input._id));
      setDrafts((current) => current.filter((item) => item.pendingInputId !== input._id));
    } catch (err) { setPendingError(err instanceof Error ? err.message : "删除失败。"); }
  }

  async function processPendingInputs(ids: string[]) {
    if (pendingLock.current) return;
    pendingLock.current = true;
    setPendingBusy(true);
    setPendingError("");
    setMessage("");
    let succeeded = 0;
    let failed = 0;
    try {
      for (let index = 0; index < ids.length; index++) {
        setPendingProgress(`正在识别 ${index + 1} / ${ids.length} 条…`);
        try {
          const response = await fetch(`/api/pending-inputs/parse?id=${ids[index]}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categories: categories.map((item) => item.name), paymentMethods: paymentMethods.map((item) => item.name) }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "识别失败。");
          setPendingInputs((current) => current.map((item) => item._id === data._id ? data : item));
          setDrafts((current) => {
            const keys = new Set(current.map(pendingKey));
            const retained = current.filter((item) => item.amount || item.category || item.paymentMethod || item.note || item.originalText);
            return [...retained, ...data.drafts.filter((draft: Draft) => !keys.has(pendingKey(draft)))];
          });
          succeeded++;
        } catch { failed++; }
      }
      await loadPendingInputs();
      setPendingProgress(`已识别 ${succeeded} 条${failed ? `，${failed} 条失败并保留，可稍后重试` : "，请确认账单后录入"}。`);
      if (succeeded) setDraftRevision((value) => value + 1);
    } finally { setPendingBusy(false); pendingLock.current = false; }
  }

  async function refresh() {
    const response = await fetch("/api/transactions");
    if (!response.ok) throw new Error("读取数据失败，请检查 MongoDB 配置。");
    setTransactions(await response.json());
  }

  useEffect(() => {
    const stored = readStoredLists();
    if (stored) {
      if (Array.isArray(stored.categories)) setCategories(stored.categories);
      if (Array.isArray(stored.paymentMethods)) setPaymentMethods(stored.paymentMethods);
    }

    (async () => {
      try {
        const response = await fetch("/api/transactions");
        if (!response.ok) throw new Error("读取数据失败，请检查 MongoDB 配置。");
        setTransactions(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "读取数据失败。");
      }
    })();
  }, []);

  const loadTransactionPresets = useCallback(async () => {
    setPresetsLoading(true);
    setPresetError("");
    try {
      const response = await fetch("/api/transaction-presets");
      if (!response.ok) throw new Error("读取账单预设失败，请稍后重试。");
      setTransactionPresets(await response.json());
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : "读取账单预设失败。");
    } finally { setPresetsLoading(false); }
  }, []);

  useEffect(() => { void loadTransactionPresets(); }, [loadTransactionPresets]);
  useEffect(() => {
    if (!draftRevision) return;
    draftAreaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (carouselRef.current) carouselRef.current.scrollTo({ left: carouselRef.current.scrollWidth, behavior: "smooth" });
  }, [draftRevision]);

  function openPresetFromDraft(draft: Draft) {
    setPresetFormError("");
    setPresetForm({ name: suggestPresetName(draft), draft: { ...draft, tags: [...draft.tags] } });
  }

  function editPreset(preset: TransactionPreset) {
    setPresetFormError("");
    setPresetForm({ id: preset._id, name: preset.name, draft: presetToDraft(preset) });
  }

  function usePreset(preset: TransactionPreset) {
    const draft = presetToDraft(preset);
    setDrafts((current) => {
      const onlyEmptyDraft = current.length === 1 && !current[0].amount && !current[0].category && !current[0].paymentMethod && !current[0].merchant && !current[0].note;
      return onlyEmptyDraft ? [draft] : [...current, draft];
    });
    setDraftRevision((value) => value + 1);
    setError("");
    setMessage(`已载入「${preset.name}」，请确认后录入。`);
  }

  async function savePreset(payload: Omit<TransactionInput, "amountCny" | "fxRateToCny">) {
    if (!presetForm) return;
    if (!presetForm.name.trim()) { setPresetFormError("请填写预设名称。"); return; }
    setPresetSaving(true);
    setPresetFormError("");
    try {
      const response = await fetch(presetForm.id ? `/api/transaction-presets?id=${presetForm.id}` : "/api/transaction-presets", {
        method: presetForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, name: presetForm.name })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存预设失败。");
      setTransactionPresets((current) => [data, ...current.filter((item) => item._id !== data._id)]);
      setPresetError("");
      setPresetForm(null);
      setMessage("账单预设已保存，未录入流水。");
    } catch (err) {
      setPresetFormError(err instanceof Error ? err.message : "保存预设失败。");
    } finally { setPresetSaving(false); }
  }

  async function deletePreset(preset: TransactionPreset) {
    setDeletingPresetId(preset._id);
    setPresetError("");
    try {
      const response = await fetch(`/api/transaction-presets?id=${preset._id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除预设失败。");
      setTransactionPresets((current) => current.filter((item) => item._id !== preset._id));
      setMessage("预设已删除。");
      return true;
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : "删除预设失败。");
      return false;
    } finally { setDeletingPresetId(null); }
  }

  function persistModelLists(nextCategories = categories, nextPaymentMethods = paymentMethods) {
    localStorage.setItem(
      "ai-ledger-model-lists",
      JSON.stringify({
        categories: nextCategories,
        paymentMethods: nextPaymentMethods
      })
    );
  }

  async function parseText() {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    setMessage("");
    setParseError("");

    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          categories: categories.map((item) => item.name),
          paymentMethods: paymentMethods.map((item) => item.name)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "识别失败。");
      setDrafts((current) => [...current.filter((item) => item.amount || item.category || item.paymentMethod || item.note || item.originalText), ...getDraftsFromParseResponse(data)]);
      setText("");
      setDraftRevision((value) => value + 1);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "识别失败。");
    } finally {
      setLoading(false);
    }
  }

  function startManualEntry() {
    setError("");
    setMessage("");
    setDrafts((current) => [...current.filter((item) => item.amount || item.category || item.paymentMethod || item.note || item.originalText), {
      type: "expense",
      amount: null,
      currency: "HKD",
      date: ledgerToday(),
      category: null,
      paymentMethod: null,
      merchant: null,
      tags: [],
      note: null,
      confidence: 1,
      needsReview: true
    }]);
    setDraftRevision((value) => value + 1);
  }

  async function createTransaction(payload: Omit<TransactionInput, "amountCny" | "fxRateToCny">, draft?: Draft) {
    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, pendingInputId: draft?.pendingInputId, pendingDraftId: draft?.pendingDraftId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "保存失败。");
    return data;
  }

  async function saveTransaction(payload: Omit<TransactionInput, "amountCny" | "fxRateToCny">, draftIndex?: number) {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const draft = drafts[draftIndex ?? 0];
      await createTransaction(payload, draft);
      if (typeof draftIndex === "number") {
        setDrafts((current) => current.filter((_, index) => index !== draftIndex));
      } else {
        setDrafts([]);
      }
      setMessage("账单已录入。");
      await refresh();
      await loadPendingInputs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function saveAllDrafts() {
    if (!drafts.length) return;
    if (drafts.some((item) => !Number(item.amount || 0))) {
      setError("请先补全每一张账单的金额，再一键全部录入。");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const batch = drafts.map((item) => ({ ...item, localDraftId: item.localDraftId || makeId("draft") }));
      setDrafts(batch);
      for (const item of batch) {
        await createTransaction(draftToPayload(item), item);
        setDrafts((current) => current.filter((draft) => draft.localDraftId !== item.localDraftId));
      }
      setMessage(`${drafts.length} 张账单已录入。`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      await loadPendingInputs();
      setSaving(false);
    }
  }

  async function updateTransaction(payload: Omit<TransactionInput, "amountCny" | "fxRateToCny">) {
    if (!editingDraft) return;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/transactions?id=${editingDraft._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败。");

      setTransactions((current) => current.map((item) => (item._id === data._id ? data : item)));
      setEditingDraft(null);
      setMessage("账单已更新。");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTransaction(id: string) {
    const previous = transactions;
    setTransactions((current) => current.filter((item) => item._id !== id));
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除失败。");
      if (editingDraft?._id === id) {
        setEditingDraft(null);
      }
      setMessage("账单已删除。");
      await refresh();
    } catch (err) {
      setTransactions(previous);
      setError(err instanceof Error ? err.message : "删除失败。");
    }
  }

  function updateCategory(id: string, name: string) {
    const next = categories.map((item) => (item.id === id ? { ...item, name } : item));
    setCategories(next);
    persistModelLists(next, paymentMethods);
  }

  function updatePaymentMethod(id: string, name: string) {
    const next = paymentMethods.map((item) => (item.id === id ? { ...item, name } : item));
    setPaymentMethods(next);
    persistModelLists(categories, next);
  }

  function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const next = [...categories, { id: makeId("category"), name }];
    setCategories(next);
    setNewCategoryName("");
    persistModelLists(next, paymentMethods);
    setMessage("分类已更新，并会参与后续 AI 识别。");
  }

  function addPaymentMethod() {
    const name = newPaymentMethodName.trim();
    if (!name) return;
    const next = [...paymentMethods, { id: makeId("payment"), name }];
    setPaymentMethods(next);
    setNewPaymentMethodName("");
    persistModelLists(categories, next);
    setMessage("支付方式已更新，并会参与后续 AI 识别。");
  }

  function removeCategory(id: string) {
    const next = categories.filter((item) => item.id !== id);
    setCategories(next);
    persistModelLists(next, paymentMethods);
  }

  function removePaymentMethod(id: string) {
    const next = paymentMethods.filter((item) => item.id !== id);
    setPaymentMethods(next);
    persistModelLists(categories, next);
  }

  function resetModelLists() {
    setCategories(defaultCategories);
    setPaymentMethods(defaultPaymentMethods);
    setNewCategoryName("");
    setNewPaymentMethodName("");
    localStorage.removeItem("ai-ledger-model-lists");
    localStorage.removeItem("ai-ledger-custom-lists");
    setMessage("模型列表已恢复为默认值。");
  }

  function updateDraftAt(index: number, nextDraft: Draft | null) {
    setDrafts((current) => {
      if (!nextDraft) {
        return current.filter((_, itemIndex) => itemIndex !== index);
      }

      return current.map((item, itemIndex) => (itemIndex === index ? nextDraft : item));
    });
  }

  async function removeDraftAt(index: number) {
    const draft = drafts[index];
    if (draft?.pendingInputId && draft.pendingDraftId) {
      const response = await fetch(`/api/pending-inputs?id=${draft.pendingInputId}&draftId=${draft.pendingDraftId}`, { method: "DELETE" });
      if (!response.ok) { setPendingError("移除暂存账单失败，请重试。"); return; }
    }
    setDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
    await loadPendingInputs();
  }

  const visibleTransactions = useMemo(() => transactions.slice(0, 80), [transactions]);
  const merchantSuggestions = useMemo(() => {
    const scores = new Map<string, { count: number; recent: number }>();

    transactions.forEach((item, index) => {
      const merchant = item.merchant?.trim();
      if (!merchant) return;
      const current = scores.get(merchant) || { count: 0, recent: 0 };
      scores.set(merchant, {
        count: current.count + 1,
        recent: Math.max(current.recent, transactions.length - index)
      });
    });

    return Array.from(scores.entries())
      .sort((a, b) => b[1].count - a[1].count || b[1].recent - a[1].recent)
      .slice(0, 8)
      .map(([name]) => name);
  }, [transactions]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">TCCA</div>
          <div className="tagline">一句话记账</div>
        </div>
        <nav className="tabs desktop-tabs" aria-label="页面">
          {tabs.map((item) => (
            <button key={item.key} className={`tab ${tab === item.key ? "active" : ""}`} onClick={() => setTab(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      {tab === "entry" ? (
        <div className="entry-grid">
            <section className="command-panel">
              <div className="panel-head">
                <span>AI 识别</span>
                <div className="panel-actions">
                  <span>{text.length} 字</span>
                  <button className="text-button" type="button" disabled={loading || saving || pendingBusy} onClick={startManualEntry}>
                    手动录入
                  </button>
                </div>
              </div>
              <textarea
                className="command-input"
                aria-label="记账文字"
                value={text}
                disabled={loading}
                onChange={(event) => setText(event.target.value)}
                placeholder=""
                autoFocus
              />
              <div className="action-row">
                <button type="button" className="text-button" disabled={loading || pendingSaving || !text.trim()} onClick={savePendingText}>{pendingSaving ? "暂存中…" : "暂存文字"}</button>
                <button className="primary-button" disabled={loading || saving || pendingBusy || pendingSaving || !text.trim()} onClick={parseText}>
                  {loading ? "识别中..." : "识别账单"}
                </button>
              </div>
              {parseError ? <div className="parse-failure" role="alert"><p>{parseError}</p><span>输入已保留，可点「暂存文字」，稍后批量识别。</span></div> : null}
            </section>

          <div className="draft-area" ref={draftAreaRef}>
            {drafts.length > 1 ? (
              <section className="multi-draft-area">
                <div className="panel multi-draft-toolbar">
                  <div>
                    <strong>{drafts.length} 张待确认账单</strong>
                    <p className="hint">左右滑动检查，每张都可以单独修改或录入。</p>
                  </div>
                </div>
                <div className="draft-carousel" ref={carouselRef} aria-label="多账单待确认列表">
                  {drafts.map((item, index) => (
                    <div className="draft-slide" key={`${item.originalText || "draft"}-${index}`}>
                      <div className="draft-slide-meta">
                        <span>
                          {index + 1} / {drafts.length}
                        </span>
                        <button className="text-button" type="button" onClick={() => removeDraftAt(index)}>
                          删除这张
                        </button>
                      </div>
                      <TransactionEditor
                        key={`draft-${draftRevision}-${index}`}
                        onSavePreset={openPresetFromDraft}
                        draft={item}
                        categories={categories}
                        paymentMethods={paymentMethods}
                        merchantSuggestions={merchantSuggestions}
                        onChange={(nextDraft) => updateDraftAt(index, nextDraft)}
                        onSave={(payload) => saveTransaction(payload, index)}
                        saving={saving}
                        idSuffix={`draft-${index}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="panel multi-draft-actions">
                  <button className="primary-button" disabled={saving || drafts.some((item) => !Number(item.amount || 0))} onClick={saveAllDrafts}>
                    {saving ? "录入中..." : "全部录入"}
                  </button>
                </div>
              </section>
            ) : (
              <TransactionEditor
                key={`draft-${draftRevision}`}
                onSavePreset={openPresetFromDraft}
                draft={drafts[0] || null}
                categories={categories}
                paymentMethods={paymentMethods}
                merchantSuggestions={merchantSuggestions}
                onChange={(nextDraft) => setDrafts(nextDraft ? [nextDraft] : [])}
                onSave={(payload) => saveTransaction(payload)}
                saving={saving}
              />
            )}
          </div>

          <TransactionPresetList
            presets={transactionPresets}
            loading={presetsLoading}
            error={presetError}
            disabled={saving || loading || presetSaving}
            deletingId={deletingPresetId}
            onRetry={loadTransactionPresets}
            onUse={usePreset}
            onEdit={editPreset}
            onDelete={deletePreset}
          />
          <PendingInputList
            inputs={pendingInputs}
            loading={pendingLoading}
            busy={pendingBusy || loading || saving || pendingSaving}
            processing={pendingBusy}
            error={pendingError}
            progress={pendingProgress}
            onRefresh={loadPendingInputs}
            onProcess={processPendingInputs}
            onView={(input) => {
              draftAreaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              const index = drafts.findIndex((draft) => draft.pendingInputId === input._id);
              const slide = carouselRef.current?.children[index] as HTMLElement | undefined;
              if (slide) carouselRef.current?.scrollTo({ left: slide.offsetLeft - (carouselRef.current.firstElementChild as HTMLElement).offsetLeft, behavior: "smooth" });
            }}
            onEdit={(input) => { setPendingEdit(input); setPendingEditError(""); }}
            onDelete={deletePendingInput}
          />
        </div>
      ) : null}

      {tab === "analytics" ? <AnalyticsPanel selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} displayCurrency={analysisCurrency} onCurrencyChange={setAnalysisCurrency} /> : null}

      {tab === "records" ? (
        <section className="panel">
          <div className="panel-head">
            <span>流水</span>
            <span>{visibleTransactions.length} 条</span>
          </div>
          <div className="record-list">
            {visibleTransactions.map((item) => (
              <article className="record-card" key={item._id}>
                <div className="record-main">
                  <div className="record-title-row">
                    <h3>{item.category}</h3>
                    {item.merchant ? <span>{item.merchant}</span> : null}
                  </div>
                  <p>
                    {item.date} · {item.paymentMethod} · {item.currency} {item.amount}
                  </p>
                  {item.note ? <p>{item.note}</p> : null}
                </div>
                <div className="record-side">
                  <div className="record-actions">
                    <button className="text-button" onClick={() => setEditingDraft(transactionToDraft(item))}>
                      编辑
                    </button>
                    <button className="text-button danger-text" onClick={() => deleteTransaction(item._id)}>
                      删除
                    </button>
                  </div>
                  <strong className={item.type === "expense" ? "negative" : "positive"}>
                    {item.type === "expense" ? "-" : "+"}
                    {money(item.amountCny)}
                  </strong>
                  <button className="text-button" onClick={() => deleteTransaction(item._id)}>
                    删除
                  </button>
                </div>
              </article>
            ))}
            {!visibleTransactions.length ? <p className="empty">还没有流水。先用一句话录入第一笔。</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className="panel settings-panel">
          <div className="panel-head">
            <span>设置</span>
            <button className="text-button" onClick={resetModelLists}>
              恢复默认
            </button>
          </div>

          <details className="setting-group">
            <summary>
              <span>消费分类</span>
              <small>{categories.length} 项</small>
            </summary>
            <div className="model-list">
              {categories.map((item) => (
                <div className="model-row" key={item.id}>
                  <input className="input" value={item.name} onChange={(event) => updateCategory(item.id, event.target.value)} />
                  <button className="text-button" onClick={() => removeCategory(item.id)}>
                    删除
                  </button>
                </div>
              ))}
            </div>
            <div className="model-row add-row">
              <input className="input" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="新增分类" />
              <button className="primary-button" onClick={addCategory}>
                添加
              </button>
            </div>
          </details>

          <details className="setting-group">
            <summary>
              <span>支付方式</span>
              <small>{paymentMethods.length} 项</small>
            </summary>
            <div className="model-list">
              {paymentMethods.map((item) => (
                <div className="model-row" key={item.id}>
                  <input className="input" value={item.name} onChange={(event) => updatePaymentMethod(item.id, event.target.value)} />
                  <button className="text-button" onClick={() => removePaymentMethod(item.id)}>
                    删除
                  </button>
                </div>
              ))}
            </div>
            <div className="model-row add-row">
              <input className="input" value={newPaymentMethodName} onChange={(event) => setNewPaymentMethodName(event.target.value)} placeholder="新增支付方式" />
              <button className="primary-button" onClick={addPaymentMethod}>
                添加
              </button>
            </div>
          </details>
        </section>
      ) : null}

      {pendingEdit ? <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pending-edit-title"><form className="modal-panel pending-edit" onSubmit={(event) => { event.preventDefault(); void editPendingText(event.currentTarget); }}><div className="modal-head"><strong id="pending-edit-title">编辑暂存文字</strong><button type="button" className="text-button" disabled={pendingSaving} onClick={() => setPendingEdit(null)}>关闭</button></div><label className="field"><span>原文</span><textarea className="textarea" aria-label="暂存原文" name="text" maxLength={12000} required value={pendingEdit.text} onChange={(event) => setPendingEdit({ ...pendingEdit, text: event.target.value })} /></label><label className="field"><span>参考日期（用于理解今天／昨天）</span><input className="input" aria-label="暂存参考日期" name="referenceDate" type="date" required value={pendingEdit.referenceDate} onChange={(event) => setPendingEdit({ ...pendingEdit, referenceDate: event.target.value })} /></label>{pendingEditError ? <p role="alert" className="preset-error">{pendingEditError}</p> : null}<button className="button" type="submit" disabled={pendingSaving}>{pendingSaving ? "保存中…" : "保存文字"}</button></form></div> : null}

      {presetForm ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="preset-dialog-title">
          <div className="modal-panel preset-modal">
            <div className="modal-head">
              <strong id="preset-dialog-title">{presetForm.id ? "编辑账单预设" : "存为账单预设"}</strong>
              <button type="button" className="text-button" disabled={presetSaving} onClick={() => setPresetForm(null)}>关闭</button>
            </div>
            <div className="preset-form-intro">
              <label className="field" htmlFor="preset-name"><span>预设名称</span><input id="preset-name" className="input" autoFocus maxLength={80} value={presetForm.name} onChange={(event) => setPresetForm((current) => current ? { ...current, name: event.target.value } : null)} placeholder="例如：上班地铁" /></label>
              <p className="hint">保存预设不会录入流水；使用时日期设为当天。</p>
              {presetFormError ? <div className="preset-error" role="alert">{presetFormError}</div> : null}
            </div>
            {presetForm.id ? <TransactionEditor
              draft={presetForm.draft}
              categories={categories}
              paymentMethods={paymentMethods}
              merchantSuggestions={merchantSuggestions}
              onChange={(draft) => setPresetForm((current) => current && draft ? { ...current, draft } : current)}
              onSave={savePreset}
              saving={presetSaving}
              showDate={false}
              idSuffix="preset-editor"
              title="预设内容"
              meta="可重复使用"
              saveLabel="保存预设修改"
            /> : (
              <div className="preset-create-body">
                <div className="preset-create-summary">
                  <strong>{presetForm.draft.currency || "HKD"} {Number(presetForm.draft.amount || 0).toFixed(2)}</strong>
                  <span>{presetForm.draft.category || "未分类"} · {presetForm.draft.paymentMethod || "未指定"}{presetForm.draft.merchant ? ` · ${presetForm.draft.merchant}` : ""}</span>
                  {presetForm.draft.note ? <span>{presetForm.draft.note}</span> : null}
                </div>
                <button type="button" className="button" disabled={presetSaving} onClick={() => savePreset(draftToPayload(presetForm.draft))}>{presetSaving ? "保存中…" : "保存预设"}</button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {editingDraft ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="编辑账单">
          <div className="modal-panel">
            <div className="modal-head">
              <strong>编辑账单</strong>
              <button className="text-button" onClick={() => setEditingDraft(null)}>
                关闭
              </button>
            </div>
            <TransactionEditor
              draft={editingDraft}
              categories={categories}
              paymentMethods={paymentMethods}
              merchantSuggestions={merchantSuggestions}
              onChange={(nextDraft) => setEditingDraft(nextDraft ? { ...nextDraft, _id: editingDraft._id } : null)}
              onSave={updateTransaction}
              saving={saving}
              idSuffix={`edit-${editingDraft._id}`}
              title="账单内容"
              meta="Edit"
              saveLabel="保存修改"
            />
          </div>
        </div>
      ) : null}

      <footer className="footer">
        Rates by{" "}
        <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">
          Exchange Rate API
        </a>
      </footer>

      <nav className="mobile-tabs" aria-label="移动端页面">
        {tabs.map((item) => (
          <button key={item.key} className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>
            {item.label}
          </button>
        ))}
      </nav>
    </main>
  );
}
