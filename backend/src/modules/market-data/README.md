# Market Data

Módulo de precios con arquitectura `route → controller → service → repository → provider`. Solamente `providers/twelve-data.provider.ts` conoce el contrato HTTP de Twelve Data.

## Configuración

Registra una API key de Twelve Data exclusivamente en `backend/.env`:

```env
TWELVE_DATA_API_KEY=tu_clave
TWELVE_DATA_BASE_URL=https://api.twelvedata.com
MARKET_DATA_PROVIDER=twelve-data
MARKET_QUOTE_CACHE_SECONDS=60
MARKET_CLOSED_CACHE_SECONDS=900
```

La clave no se devuelve, registra ni envía al frontend. Si está vacía y existe una cotización guardada, la API devuelve ese valor con `stale: true`.

## Caché

1. Busca `latest_market_quotes`.
2. Reutiliza 60 segundos durante mercado abierto o 900 segundos cuando está cerrado.
3. Consulta Twelve Data solo si venció.
4. Guarda `provider_timestamp` y `fetched_at` por separado.
5. Si el proveedor falla, conserva la última cotización conocida.

Los símbolos siempre se resuelven en `asset_provider_symbols`. Por ejemplo, `xtb/NVDA.US` apunta al activo NVDA y desde allí al símbolo `twelve-data/NVDA`.

## Endpoints

Todos requieren `Authorization: Bearer <accessToken>`:

```http
GET /api/market-data/assets/:assetId/quote
GET /api/market-data/quotes?assetIds=uuid1,uuid2
GET /api/market-data/assets/:assetId/history?interval=1day&from=2026-01-01&to=2026-07-12
GET /api/portfolios/:portfolioId/live-summary
GET /api/portfolios/:portfolioId/positions/live
```

Respuesta de cotización abreviada:

```json
{
  "data": {
    "assetId": "uuid",
    "symbol": "NVDA",
    "providerSymbol": "NVDA",
    "currency": "USD",
    "price": 195,
    "providerTimestamp": "2026-07-12T15:30:00.000Z",
    "fetchedAt": "2026-07-12T15:30:05.000Z",
    "isDelayed": false,
    "delayMinutes": 0,
    "stale": false
  }
}
```

## Fechas

- `transactions.executed_at`: ejecución original del broker; Twelve Data nunca la modifica.
- `latest_market_quotes.provider_timestamp`: instante del precio en el proveedor.
- `latest_market_quotes.fetched_at`: instante en que el backend lo consultó.
- `market_prices.price_datetime`: instante o fecha de la vela histórica.
- `portfolio_snapshots.snapshot_date`: balance diario.

Todas se almacenan como `TIMESTAMPTZ` en UTC.

## Pruebas

```bash
npm test -w backend -- --run
```

Las pruebas usan mocks; nunca consumen créditos reales de Twelve Data.

