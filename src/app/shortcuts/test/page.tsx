import { notFound } from "next/navigation";
import { ShortcutTest } from "@/components/ShortcutTest";

export const dynamic = "force-dynamic";

export default function ShortcutTestPage() {
  if (process.env.TCCA_LOCAL_PREVIEW !== "true") notFound();
  return <ShortcutTest />;
}
