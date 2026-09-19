import { NextResponse } from "next/server";
import { demoAssets } from "@/lib/demo-data";
import { createAsset, hasDatabase, listAssets } from "@/lib/db";

export const runtime = "edge";

export async function GET() {
  const assets = await listAssets();
  return NextResponse.json({
    assets: assets || demoAssets,
    source: hasDatabase() ? "postgres" : "demo"
  });
}

export async function POST(request) {
  const payload = await request.json();
  const required = ["id", "name", "category", "department", "location", "custodian"];
  const missing = required.filter((field) => !String(payload[field] || "").trim());
  if (missing.length) {
    return NextResponse.json({ error: "Required fields are missing.", missing }, { status: 422 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const asset = await createAsset({
    ...payload,
    status: payload.status || "Operational",
    value: Number(payload.value) || 0,
    serviceDue: payload.serviceDue || "Not scheduled",
    risk: payload.risk || "Watch"
  });
  return NextResponse.json({ asset }, { status: 201 });
}
