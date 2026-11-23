import { getDb } from "@/lib/mongodb";
import { reportCalendarDay } from "@/lib/reportPeriods";
import { reportDocuments, runNextReport, scheduleClosedReports } from "@/lib/reportStore";

let started = false;

export function startReportWorker() {
  if (started) return;
  started = true;
  let indexed = false;
  let scheduledMonth: string | undefined;
  const tick = async () => {
    let delay = 60_000;
    try {
      const db = await getDb();
      if (!indexed) {
        await Promise.all([
          reportDocuments(db).createIndex({ userId: 1, "period.end": -1, publishedAt: -1 }),
          reportDocuments(db).createIndex({ userId: 1, status: 1, readAt: 1 }),
          reportDocuments(db).createIndex({ status: 1, nextAttemptAt: 1, leaseUntil: 1 }),
          db.collection("report_clues").createIndex({ userId: 1, transactionId: 1 }, { unique: true }),
          db.collection("report_clues").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
        ]);
        indexed = true;
      }
      const now = new Date();
      const month = reportCalendarDay(now).slice(0, 7);
      if (scheduledMonth !== month) {
        await scheduleClosedReports(db, now);
        scheduledMonth = month;
      }
      if (await runNextReport(db)) delay = 1_000;
    } catch {
      console.error("TCCA report worker could not complete a cycle.");
    } finally {
      setTimeout(tick, delay).unref();
    }
  };
  setTimeout(tick, 5_000).unref();
}
