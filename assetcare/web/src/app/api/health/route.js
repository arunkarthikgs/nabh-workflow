import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";

export const runtime = "edge";

export function GET() {
  return NextResponse.json({ status: "ok", database: hasDatabase() ? "configured" : "demo-mode" });
}
