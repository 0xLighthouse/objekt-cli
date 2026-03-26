import { getEnsApiUrl } from "./api";

interface PricingTier {
  ratePerMb?: number;
  cost?: string;
}

interface PricingResponse {
  tiers: Record<string, PricingTier>;
}

export async function estimateUpload(options: {
  ensApi?: string;
  api?: string;
  network: string;
  storage: string;
  bytes: number;
  file: string;
}): Promise<{
  file: string;
  size: string;
  storage: string;
  cost: string;
}> {
  const baseUrl =
    options.ensApi || options.api
      ? getEnsApiUrl(options as { ensApi?: string; network: string })
      : getEnsApiUrl(options as { ensApi?: string; network: string });

  const res = await fetch(`${baseUrl}/pricing`);
  if (!res.ok) throw new Error("Failed to fetch pricing");
  const pricing = (await res.json()) as PricingResponse;

  const tierInfo = pricing.tiers[options.storage];
  if (!tierInfo) throw new Error(`Unknown storage: ${options.storage}`);

  const mb = options.bytes / (1024 * 1024);
  const sizeStr =
    options.bytes < 1024 * 1024
      ? `${Math.round(options.bytes / 1024)}KB`
      : `${mb.toFixed(2)}MB`;

  let cost: string;
  if (tierInfo.ratePerMb) {
    const total = Math.ceil(mb * tierInfo.ratePerMb * 100) / 100;
    cost = `$${total.toFixed(2)} USDC`;
  } else {
    cost = tierInfo.cost ?? "free";
  }

  return {
    file: options.file,
    size: sizeStr,
    storage: options.storage,
    cost,
  };
}
