import { NextResponse } from "next/server";
import { getRunRecord } from "@/lib/run-service";

interface EventRouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, { params }: EventRouteProps) {
  const { id } = await params;
  const record = await getRunRecord(id);

  if (!record) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  return NextResponse.json(record.events);
}
