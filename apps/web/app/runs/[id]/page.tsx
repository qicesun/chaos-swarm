import { notFound } from "next/navigation";
import { getRunRecord } from "@/lib/run-service";
import { RunMonitor } from "./run-monitor";

interface RunDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RunDetailPage({ params }: RunDetailPageProps) {
  const { id } = await params;
  const run = await getRunRecord(id);

  if (!run) {
    notFound();
  }

  return <RunMonitor initialRun={run} />;
}
