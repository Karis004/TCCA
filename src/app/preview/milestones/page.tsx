import { notFound } from "next/navigation";
import { MilestonePreview } from "@/components/preview/MilestonePreview";
import "./preview.css";

export const dynamic = "force-dynamic";

export default function MilestonePreviewPage() {
  if (process.env.TCCA_LOCAL_PREVIEW !== "true") notFound();
  return <MilestonePreview />;
}
