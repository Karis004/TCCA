export function shortcutInputId(hash: string) {
  return /^#shortcut=([a-f0-9]{24})$/.exec(hash)?.[1];
}

export function shortcutPaymentMethod(value: string | null | undefined, methods: string[] = []) {
  const candidate = value?.trim().toLowerCase();
  return candidate ? methods.find(method => method.trim().toLowerCase() === candidate) ?? null : null;
}
