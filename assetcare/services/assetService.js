import schema from "../models/assetSchema.json" with { type: "json" };

export const requiredFields = [
  "assetId",
  "assetName",
  "assetCategory",
  "location",
  "department",
  "custodian",
  "operationalStatus",
  "purchaseDate",
  "purchaseValue",
  "lastVerifiedDate"
];

function dateOnly(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function normalizeAsset(asset) {
  return Object.fromEntries(
    Object.keys(schema).map((field) => [
      field,
      asset[field] === undefined || asset[field] === null || asset[field] === ""
        ? "NOT PROVIDED"
        : asset[field]
    ])
  );
}

export function validateAsset(asset) {
  return requiredFields.filter((field) => {
    const value = asset[field];
    return value === "NOT PROVIDED" || value === "" || value === undefined;
  });
}

export function getExceptions(asset, today = new Date()) {
  const exceptions = [];
  const dueDates = [
    ["warrantyEndDate", "Warranty expired"],
    ["amcCmcEndDate", "AMC/CMC expired"],
    ["nextPreventiveMaintenanceDate", "Preventive maintenance overdue"],
    ["nextCalibrationDate", "Calibration overdue"]
  ];

  for (const [field, label] of dueDates) {
    if (asset[field] !== "NOT PROVIDED" && dateOnly(asset[field]) < today) {
      exceptions.push(label);
    }
  }
  if (asset.operationalStatus !== "Operational") exceptions.push(asset.operationalStatus);
  if (asset.lastVerifiedDate !== "NOT PROVIDED" && dateOnly(asset.lastVerifiedDate) < new Date(today.getFullYear(), today.getMonth(), 1)) {
    exceptions.push("Not verified this month");
  }
  return exceptions;
}

export function summarizeAssets(assets) {
  const totalValue = assets.reduce((sum, asset) => sum + (Number(asset.purchaseValue) || 0), 0);
  const byCategory = {};
  for (const asset of assets) {
    byCategory[asset.assetCategory] = (byCategory[asset.assetCategory] || 0) + 1;
  }
  return {
    totalAssets: assets.length,
    totalAcquisitionValue: totalValue,
    medicalAssets: assets.filter((asset) => asset.medicalOrNonMedical === "Medical").length,
    nonMedicalAssets: assets.filter((asset) => asset.medicalOrNonMedical === "Non-medical").length,
    operationalAssets: assets.filter((asset) => asset.operationalStatus === "Operational").length,
    categoryCounts: byCategory
  };
}
