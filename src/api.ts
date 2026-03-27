function buildUrl(base: string, network: string): string {
  const trimmed = base.replace(/\/$/, "");
  return network === "mainnet" ? trimmed : `${trimmed}/${network}`;
}

export function getEnsApiUrl(options: {
  ensApi?: string;
  network: string;
}): string {
  const base =
    options.ensApi || process.env.OBJEKT_ENS_API || "https://ens.objekt.sh";
  return buildUrl(base, options.network);
}

export function getApiUrl(options: { api?: string; network: string }): string {
  const base = options.api || process.env.OBJEKT_API || "https://api.objekt.sh";
  return buildUrl(base, options.network);
}
