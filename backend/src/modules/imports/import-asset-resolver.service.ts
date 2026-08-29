import type { MarketSymbolSearchResult } from '../market-data/market-data.types.js';
import type { MarketDataProvider } from '../market-data/providers/market-data-provider.interface.js';
import { TwelveDataProvider } from '../market-data/providers/twelve-data.provider.js';
import type { NormalizedImportOperation } from './import.types.js';

export interface ResolvedImportAsset {
  symbol: string;
  providerSymbol: string;
  assetName: string;
  assetType: NormalizedImportOperation['assetType'];
  exchange?: string;
  currencyCode: string;
  marketDataMatch: NonNullable<NormalizedImportOperation['marketDataMatch']>;
}

const suffixCountries: Record<string, string> = {
  US: 'united states', UK: 'united kingdom', DE: 'germany', PL: 'poland', FR: 'france', IT: 'italy', ES: 'spain', NL: 'netherlands', CA: 'canada', AU: 'australia',
};

const legalWords = new Set(['the', 'inc', 'incorporated', 'corp', 'corporation', 'company', 'co', 'ltd', 'limited', 'plc', 'sa', 'spa', 'ag', 'nv', 'holding', 'holdings', 'group']);

function words(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((word) => word && !legalWords.has(word));
}

function nameSimilarity(left: string, right: string) {
  const a = new Set(words(left));
  const b = new Set(words(right));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / Math.max(a.size, b.size);
}

function meaningfulName(operation: NormalizedImportOperation) {
  const name = operation.assetName.trim();
  if (!name || /por revisar/i.test(name)) return undefined;
  const identifiers = [operation.sourceSymbol, operation.symbol, operation.providerSymbol].map((value) => value.toUpperCase());
  return identifiers.includes(name.toUpperCase()) ? undefined : name;
}

function canonicalSymbol(source: string) {
  return source.trim().toUpperCase().replace(/\.(US|UK|DE|PL|FR|IT|ES|NL|CA|AU)$/i, '');
}

function assetType(value: string): NormalizedImportOperation['assetType'] {
  const type = value.toLowerCase();
  if (type.includes('etf') || type.includes('exchange-traded')) return 'ETF';
  if (type.includes('fund')) return 'FUND';
  if (type.includes('bond')) return 'BOND';
  if (type.includes('crypto') || type.includes('digital currency')) return 'CRYPTO';
  if (type.includes('forex') || type.includes('physical currency')) return 'FOREX';
  if (type.includes('stock') || type.includes('depositary') || type.includes('reit')) return 'STOCK';
  return 'OTHER';
}

function inferredCountry(sourceSymbol: string) {
  const suffix = sourceSymbol.toUpperCase().match(/\.([A-Z]{2})$/)?.[1];
  return suffix ? suffixCountries[suffix] : undefined;
}

export class ImportAssetResolverService {
  private readonly searchCache = new Map<string, { expiresAt: number; values: MarketSymbolSearchResult[] }>();

  constructor(private readonly provider: MarketDataProvider = new TwelveDataProvider()) {}

  async resolve(operation: NormalizedImportOperation): Promise<ResolvedImportAsset | null> {
    const querySymbol = canonicalSymbol(operation.sourceSymbol || operation.symbol || operation.providerSymbol);
    if (!querySymbol) return null;
    const companyName = meaningfulName(operation);
    const expectedCountry = inferredCountry(operation.sourceSymbol);
    const expectedExchange = operation.exchange?.toLowerCase();
    const expectedCurrency = operation.currencyCode.toUpperCase();
    const results = await this.search(querySymbol);

    const candidates = results.map((result, index) => {
      const exactSymbol = result.symbol.toUpperCase() === querySymbol;
      const similarity = companyName ? nameSimilarity(companyName, result.name) : 0;
      const countryMatch = expectedCountry && result.country?.toLowerCase() === expectedCountry;
      const exchangeMatch = expectedExchange && result.exchange?.toLowerCase() === expectedExchange;
      const currencyMatch = result.currency.toUpperCase() === expectedCurrency;
      const score = (exactSymbol ? 60 : 0) + similarity * 35 + (countryMatch ? 22 : 0) + (exchangeMatch ? 20 : 0) + (currencyMatch ? 12 : 0) + Math.max(0, 10 - index);
      return { result, exactSymbol, similarity, score };
    }).filter((candidate) => (candidate.exactSymbol || candidate.similarity >= 0.8) && (!companyName || candidate.similarity >= 0.55)).sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (!best || best.score < 70) return null;
    const differentCompanyRunnerUp = candidates.find((candidate, index) => index > 0 && nameSimilarity(candidate.result.name, best.result.name) < 0.55);
    if (differentCompanyRunnerUp && best.score - differentCompanyRunnerUp.score < 8) return null;
    return this.toResolved(best.result, Math.min(100, Math.round(best.score)));
  }

  private async search(symbol: string) {
    const cached = this.searchCache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) return cached.values;
    const values = await this.provider.searchSymbols(symbol, 30);
    this.searchCache.set(symbol, { values, expiresAt: Date.now() + 60 * 60_000 });
    return values;
  }

  private toResolved(result: MarketSymbolSearchResult, confidence: number): ResolvedImportAsset {
    const symbol = result.symbol.toUpperCase();
    const providerSymbol = result.exchange ? `${symbol}:${result.exchange}` : symbol;
    return {
      symbol,
      providerSymbol,
      assetName: result.name,
      assetType: assetType(result.instrumentType),
      exchange: result.exchange ?? undefined,
      currencyCode: result.currency.toUpperCase(),
      marketDataMatch: {
        provider: 'TWELVE_DATA', symbol, providerSymbol, name: result.name, exchange: result.exchange ?? undefined,
        country: result.country ?? undefined, currency: result.currency.toUpperCase(), confidence,
      },
    };
  }
}

export const importAssetResolverService = new ImportAssetResolverService();
