// Descarga precio/%diario/%semanal de las 9 empresas de fábrica directamente desde Yahoo
// Finance (sin proxy CORS: aquí se ejecuta en GitHub Actions, no en el navegador) y guarda el
// resultado en data/prices-snapshot.json. La web lo lee al abrir para mostrar cifras recientes
// de inmediato, mientras de fondo sigue pidiendo los precios en vivo como hasta ahora (ver
// loadPriceSnapshot() en index.html).
//
// Solo cubre las empresas de fábrica (BUILTIN_KEYS): las añadidas por cada usuario viven en su
// localStorage, no en este repositorio, así que no se pueden precalcular aquí.
//
// Símbolos de Yahoo = mismo mapa YF_TICKER que usa index.html (grep "const YF_TICKER" si cambia).
const YF_TICKER = {
  CSU: 'CNSWF', ASML: 'ASML.AS', AMZN: 'AMZN', MSFT: 'MSFT', AAPL: 'AAPL',
  GOOGL: 'GOOGL', META: 'META', NVDA: 'NVDA', WDC: 'WDC',
};

function parseYF(data) {
  const q = data?.chart?.result?.[0];
  if (!q) return null;
  const meta = q.meta;
  let c = meta.regularMarketPrice || meta.previousClose;
  let pc = meta.previousClose || meta.chartPreviousClose;
  const closesRaw = (q.indicators?.quote?.[0]?.close || []).filter((v) => v != null);
  let oldest = closesRaw.length >= 6 ? closesRaw[closesRaw.length - 6] : null;
  let cur = meta.currency || null, div = 1;
  if (cur === 'GBp' || cur === 'ZAc' || cur === 'ILA') {
    div = 100;
    cur = cur === 'GBp' ? 'GBP' : cur === 'ZAc' ? 'ZAR' : 'ILS';
  }
  if (div !== 1) { c /= div; if (pc) pc /= div; if (oldest) oldest /= div; }
  const dp = pc ? ((c - pc) / pc) * 100 : 0;
  const wp = oldest ? ((c - oldest) / oldest) * 100 : null;
  const round = (v, dec) => (v == null ? null : Math.round(v * 10 ** dec) / 10 ** dec);
  return c > 0 ? { c: round(c, 2), dp: round(dp, 2), wp: round(wp, 2) } : null;
}

async function fetchOne(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; valueinvestjlh-snapshot/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} para ${symbol}`);
  const data = await r.json();
  const parsed = parseYF(data);
  if (!parsed) throw new Error(`Sin datos utilizables para ${symbol}`);
  return parsed;
}

async function main() {
  const prices = {};
  const errors = [];
  for (const [key, symbol] of Object.entries(YF_TICKER)) {
    try {
      prices[key] = await fetchOne(symbol);
    } catch (e) {
      errors.push(`${key} (${symbol}): ${e.message}`);
    }
    // Pequeña pausa entre peticiones, cortesía con la API gratuita de Yahoo.
    await new Promise((r) => setTimeout(r, 300));
  }
  if (Object.keys(prices).length === 0) {
    console.error('No se pudo descargar ningún precio:', errors.join(' · '));
    process.exit(1);
  }
  if (errors.length) console.warn('Avisos:', errors.join(' · '));
  const snapshot = { generatedAt: new Date().toISOString(), prices };
  const fs = await import('node:fs/promises');
  await fs.writeFile('data/prices-snapshot.json', JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`Guardado data/prices-snapshot.json con ${Object.keys(prices).length}/${Object.keys(YF_TICKER).length} empresas.`);
}

main();
