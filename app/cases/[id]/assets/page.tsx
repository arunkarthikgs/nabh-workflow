import Link from "next/link";
import { db } from "@/lib/db";
import { 
  ArrowLeft, 
  Share2, 
  ShieldCheck, 
  Clock, 
  PlusCircle, 
  AlertCircle,
  Building2,
  Stethoscope
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CaseAssetsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  let caseData: any = null;
  let dbError: string | null = null;

  try {
    if (id === "active") {
      caseData = await db.case.findFirst({
        orderBy: { createdAt: "desc" },
        include: {
          physician: true,
          organization: true,
          assets: true,
        },
      });
    } else {
      caseData = await db.case.findUnique({
        where: { id },
        include: {
          physician: true,
          organization: true,
          assets: true,
        },
      });
    }
  } catch (err: any) {
    console.error("Failed to load case data:", err);
    dbError = err.message || "Failed to retrieve case records.";
  }

  if (!caseData) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 text-slate-900 flex items-center justify-center">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-600 mb-4">
            <Share2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">No Active Case Found</h2>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            {dbError
              ? `Database notice: ${dbError}`
              : "There are currently no clinical cases recorded in the database to display in the Publishing Studio."}
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/cases/new"
              className="flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-700 transition shadow-sm"
            >
              <PlusCircle className="h-4 w-4" /> Ingest New Clinical Case
            </Link>
            <Link
              href="/"
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <ArrowLeft className="h-4 w-4" /> Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isApproved = caseData.status === "APPROVED";

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700">
            <Link href="/" className="flex items-center gap-1 hover:underline">
              <ArrowLeft className="h-3 w-3" /> Dashboard
            </Link>
            <span>/</span>
            <Link href={`/cases/${caseData.id}/review`} className="hover:underline">
              Audit Review
            </Link>
            <span>/</span>
            <span>Studio</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Omnichannel Publishing Studio
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  {caseData.organization?.name || "Hospital Network"}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Stethoscope className="h-3.5 w-3.5 text-slate-400" />
                  {caseData.physician?.name || "Attending RMP"}
                  {caseData.physician?.specialty && (
                    <span className="text-slate-400 font-normal">
                      ({caseData.physician.specialty})
                    </span>
                  )}
                </span>
              </div>
            </div>

            {isApproved ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <ShieldCheck className="h-4 w-4" /> Signed-Off by Attending RMP
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                <Clock className="h-4 w-4" /> Pending Safety Gate Sign-Off
              </span>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-xs">
            <span className="font-semibold text-slate-800">Clinical Case Title: </span>
            {caseData.title}
          </div>
        </div>

        {caseData.assets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <Share2 className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-700">No assets compiled yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              This case needs to pass through the regulatory safety gate before omnichannel publication assets are compiled.
            </p>
            <div className="mt-5">
              <Link
                href={`/cases/${caseData.id}/review`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 transition"
              >
                Go to Safety Gate Audit
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {caseData.assets.map((asset: any) => {
              const contentObj = asset.content;

              return (
                <div
                  key={asset.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-bold text-teal-800 border border-teal-200">
                        {asset.channelName || asset.channelKey}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {asset.channelKey}
                      </span>
                    </div>

                    <span className="text-[11px] text-slate-400">
                      Generated {new Date(asset.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 border border-slate-200 whitespace-pre-wrap overflow-x-auto">
                    {typeof contentObj === "object"
                      ? JSON.stringify(contentObj, null, 2)
                      : String(contentObj)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
