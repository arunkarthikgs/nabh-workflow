import { getExceptions, validateAsset } from "../services/assetService.js";

export function validateAssetRegister(assets) {
  return assets.map((asset) => ({
    assetId: asset.assetId,
    missingFields: validateAsset(asset),
    exceptions: getExceptions(asset),
    isValid: validateAsset(asset).length === 0
  }));
}
