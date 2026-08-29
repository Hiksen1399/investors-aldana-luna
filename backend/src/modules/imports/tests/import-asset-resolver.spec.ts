import { describe, expect, it, vi } from 'vitest';
import type { MarketDataProvider } from '../../market-data/providers/market-data-provider.interface.js';
import { ImportAssetResolverService } from '../import-asset-resolver.service.js';
import { parseHapiEmail } from '../parsers/hapi-email.parser.js';

const result = (overrides: Record<string, unknown> = {}) => ({
  symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNGS', country: 'United States', currency: 'USD', instrumentType: 'Common Stock', ...overrides,
});

function provider(results: ReturnType<typeof result>[]): MarketDataProvider {
  return {
    name: 'TWELVE_DATA',
    searchSymbols: vi.fn().mockResolvedValue(results),
    getQuote: vi.fn(), getQuotes: vi.fn(), getHistoricalPrices: vi.fn(),
  };
}

const operation = (text: string) => parseHapiEmail(text)[0]!.normalized;

describe('ImportAssetResolverService', () => {
  it('enlaza el ticker y el nombre con la empresa oficial de Twelve Data', async () => {
    const market = provider([
      result(),
      result({ name: 'NVIDIA Corp CEDEAR', exchange: 'BCBA', micCode: 'XBUE', country: 'Argentina', currency: 'ARS', instrumentType: 'Depositary Receipt' }),
    ]);
    const resolver = new ImportAssetResolverService(market);
    const resolved = await resolver.resolve(operation('Compra\nTicker: NVDA\nEmpresa: NVIDIA\nCantidad: 2\nPrecio: 190\nMoneda: USD\nOrden: H-1'));
    expect(resolved).toMatchObject({ symbol: 'NVDA', providerSymbol: 'NVDA:NASDAQ', assetName: 'NVIDIA Corporation', exchange: 'NASDAQ', currencyCode: 'USD' });
    expect(resolved?.marketDataMatch).toMatchObject({ provider: 'TWELVE_DATA', country: 'United States', confidence: 100 });
    expect(market.searchSymbols).toHaveBeenCalledWith('NVDA', 30);
  });

  it('no enlaza otra empresa aunque el ticker coincida', async () => {
    const resolver = new ImportAssetResolverService(provider([result()]));
    await expect(resolver.resolve(operation('Compra\nTicker: NVDA\nEmpresa: Tesla Motors\nCantidad: 1\nPrecio: 190\nOrden: H-2'))).resolves.toBeNull();
  });

  it('usa el sufijo del broker para elegir el país correcto', async () => {
    const resolver = new ImportAssetResolverService(provider([
      result({ symbol: 'IGLN', name: 'iShares Physical Gold ETC', exchange: 'LSE', micCode: 'XLON', country: 'United Kingdom', instrumentType: 'ETF' }),
      result({ symbol: 'IGLN', name: 'iShares Physical Gold ETC', exchange: 'BMV', micCode: 'XMEX', country: 'Mexico', currency: 'MXN', instrumentType: 'ETF' }),
    ]));
    const imported = operation('Compra\nTicker: IGLN.UK\nCantidad: 1\nPrecio: 84\nMoneda: USD\nOrden: H-3');
    const resolved = await resolver.resolve(imported);
    expect(resolved).toMatchObject({ symbol: 'IGLN', providerSymbol: 'IGLN:LSE', assetType: 'ETF', exchange: 'LSE' });
  });
});
