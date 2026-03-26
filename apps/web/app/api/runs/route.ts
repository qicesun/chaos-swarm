import { NextResponse } from "next/server";
import { createRun } from "@/lib/run-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const record = await createRun(body);

    return NextResponse.json(
      {
        runId: record.id,
        status: record.status,
        reportId: record.id,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create run.",
      },
      { status: 400 },
    );
  }
}
