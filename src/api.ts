function buildUrl(base: string, network: string): string {
  const trimmed = base.replace(/\/$/, "");
  return network === "mainnet" ? trimmed : `${trimmed}/${network}`;
}

function isTestnet(options: { testnet?: boolean }): boolean {
  return options.testnet ?? process.env.OBJEKT_TESTNET === "true";
}

export function getEnsApiUrl(options: {
  ensApi?: string;
  network: string;
  testnet?: boolean;
}): string {
  const defaultBase = isTestnet(options)
    ? "https://stage.ens.objekt.sh"
    : "https://ens.objekt.sh";
  const base = options.ensApi || process.env.OBJEKT_ENS_API || defaultBase;
  return buildUrl(base, options.network);
}

export function getApiUrl(options: {
  api?: string;
  network: string;
  testnet?: boolean;
}): string {
  const defaultBase = isTestnet(options)
    ? "https://stage.api.objekt.sh"
    : "https://api.objekt.sh";
  const base = options.api || process.env.OBJEKT_API || defaultBase;
  return buildUrl(base, options.network);
}
