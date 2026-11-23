export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.REPORTS_WORKER_ENABLED === "true") {
    const { startReportWorker } = await import("./lib/reportWorker");
    startReportWorker();
  }
}
