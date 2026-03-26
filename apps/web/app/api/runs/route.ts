import { after, NextResponse } from "next/server";
import { createRun } from "@/lib/run-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const createdRun = await createRun(body);
    after(createdRun.start);

    return NextResponse.json(
      {
        runId: createdRun.record.id,
        status: createdRun.record.status,
        reportId: createdRun.record.id,
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
