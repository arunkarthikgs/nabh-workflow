import { normalizeAsset } from "../services/assetService.js";

export function applyAssetCareCompliance(assets) {
  return assets.map(normalizeAsset);
}
