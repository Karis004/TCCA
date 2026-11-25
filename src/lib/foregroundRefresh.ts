export function refreshOnForeground(refresh: () => void, page: Window, document: Document) {
  let timer: number | undefined;
  const schedule = () => {
    page.clearTimeout(timer);
    if (document.visibilityState !== "visible") return;
    timer = page.setTimeout(refresh, 150);
  };
  const restore = (event: PageTransitionEvent) => {
    if (event.persisted) schedule();
  };
  page.addEventListener("focus", schedule);
  document.addEventListener("visibilitychange", schedule);
  page.addEventListener("pageshow", restore);
  return () => {
    page.clearTimeout(timer);
    page.removeEventListener("focus", schedule);
    document.removeEventListener("visibilitychange", schedule);
    page.removeEventListener("pageshow", restore);
  };
}
