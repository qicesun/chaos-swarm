import { NextResponse } from "next/server";
import { getRunRecord } from "@/lib/run-service";

interface RunRouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, { params }: RunRouteProps) {
  const { id } = await params;
  const record = getRunRecord(id);

  if (!record) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: record.id,
    status: record.status,
    scenarioId: record.scenarioId,
    scenarioName: record.scenarioName,
    summary: record.summary,
    personaSummary: record.personaSummary,
    stageSummary: record.stageSummary,
    warnings: record.warnings,
  });
}
