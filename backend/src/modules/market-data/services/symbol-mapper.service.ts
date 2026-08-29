import { MarketDataError } from '../market-data.errors.js';
import { marketDataRepository, type MarketDataRepository } from '../market-data.repository.js';

export class SymbolMapperService {
  constructor(private readonly repository: MarketDataRepository = marketDataRepository) {}

  async resolveAccessibleAsset(userId: string, assetId: string, provider: string) {
    const asset = await this.repository.findAccessibleAsset(userId, assetId, provider);
    if (!asset) throw new MarketDataError(404, 'No encontramos el activo en tus portafolios activos.', 'ASSET_NOT_FOUND');
    const mapping = asset.providerSymbols[0];
    if (!mapping) throw new MarketDataError(422, 'Este activo todavía no tiene un símbolo configurado para el proveedor.', 'SYMBOL_MAPPING_NOT_FOUND');
    return { asset, mapping };
  }

  async mapProviderSymbol(sourceProvider: string, sourceSymbol: string, targetProvider = 'twelve-data') {
    const mapping = await this.repository.findMappingBySource(sourceProvider, sourceSymbol, targetProvider);
    const target = mapping?.asset.providerSymbols[0];
    if (!mapping || !target) throw new MarketDataError(422, 'No existe un mapeo explícito para ese símbolo.', 'SYMBOL_MAPPING_NOT_FOUND');
    return { assetId: mapping.assetId, symbol: mapping.asset.ticker, providerSymbol: target.providerSymbol };
  }
}

export const symbolMapperService = new SymbolMapperService();

