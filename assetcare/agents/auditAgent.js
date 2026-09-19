import { summarizeAssets } from "../services/assetService.js";

export function buildAuditReport(assets, findings) {
  return {
    generatedAt: new Date().toISOString(),
    auditType: "Monthly Self-Audit",
    summary: summarizeAssets(assets),
    exceptionCount: findings.filter((finding) => finding.exceptions.length > 0).length,
    incompleteAssetCount: findings.filter((finding) => !finding.isValid).length,
    findings
  };
}
