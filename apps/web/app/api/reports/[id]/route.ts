import { NextResponse } from "next/server";
import { getRunRecord } from "@/lib/run-service";

interface ReportRouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, { params }: ReportRouteProps) {
  const { id } = await params;
  const record = getRunRecord(id);

  if (!record) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  return NextResponse.json(record.report);
}
