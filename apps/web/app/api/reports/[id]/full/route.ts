import { NextResponse } from "next/server";
import { buildPortableRunReport, renderPortableRunReportJson, renderPortableRunReportMarkdown } from "@/lib/full-report";
import { getRunRecord } from "@/lib/run-service";

interface FullReportRouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: FullReportRouteProps) {
  const { id } = await params;
  const record = getRunRecord(id);

  if (!record) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "markdown";

  if (format === "json") {
    return new NextResponse(renderPortableRunReportJson(record), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="chaos-swarm-${id}-full-report.json"`,
        "cache-control": "no-store",
      },
    });
  }

  if (format !== "markdown" && format !== "md") {
    return NextResponse.json(
      {
        error: "Unsupported format. Use format=markdown or format=json.",
        supportedFormats: ["markdown", "json"],
        preview: buildPortableRunReport(record),
      },
      { status: 400 },
    );
  }

  return new NextResponse(renderPortableRunReportMarkdown(record), {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="chaos-swarm-${id}-full-report.md"`,
      "cache-control": "no-store",
    },
  });
}
