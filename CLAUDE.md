# ValueInvest JLH — mapa del código

App de análisis de inversión value. **Un único `index.html`** (~6.600 líneas: HTML + CSS + JS
en el mismo archivo, sin build). Se despliega tal cual en GitHub Pages:
`jllopherranz.github.io/valueinvestjlh` (repo git en esta carpeta `APP/`).

> **Cómo usar este mapa:** los números de línea son **orientativos** (se desplazan al editar).
> Para localizar algo, **grep por el nombre de la función/símbolo**, no por la línea.
> Ej: `grep -n "function renderCartera" index.html`.

---

## Reglas de oro (no romper)

1. **Datos válidos = del Excel del usuario.** El histórico y las proyecciones "buenas" vienen de su
   hoja de Google Drive (import). Nunca inventar datos como si fueran suyos. Las empresas añadidas
   **sin** Excel se marcan `estimated:true` y muestran un **banner ámbar "NO son de tu Excel"**
   (`estimatedBanner()`); sus proyecciones se rellenan por márgenes o consenso FMP.
2. **Secretos fuera del código.** API keys van en `localStorage`, no commiteadas.
   ⚠️ Ojo: existe una **Finnhub key hardcodeada** en el arranque (init IIFE, `localStorage.setItem('finnhub_api_key',…)`) — deuda técnica de seguridad conocida, no propagar.
3. **Verificar antes de publicar.** Tras editar: extraer los `<script>` y `node --check`, luego probar
   en el navegador (preview_start "valueinvest" → `.claude/launch.json`, python http.server 8137).
   Solo entonces `git add index.html && git commit && git push`. Mensajes de commit en español,
   Co-Authored-By: Claude.

---

## Estructura del archivo (zonas)

| Líneas ≈ | Zona |
|---|---|
| 1–12 | `<head>` + CDNs: **Chart.js**, **tv.js** (TradingView), **xlsx** |
| 13–588 | `<style>` — **todo el CSS**. Modo oscuro vía `.dark` (var CSS en `:root` y `.dark`) |
| 590–882 | `<body>` HTML estático: cabecera+ticker, vista Dashboard/cartera, vista Seguimiento, modal Importar |
| 883–6567 | `<script>` principal — **toda la lógica** (ver índice abajo) |
| 6568–6586 | `<script>` bootstrap de modo oscuro (`_toggleDark`) |

Dentro del script principal el **init es un IIFE** `(function(){…})()` (≈5467): monta TABS, fija
`BUILTIN_KEYS`, `hydrateImportedIntoDB()`, `switchCo('MSFT')`, `setView('dash')`, arranca precios/noticias.

---

## Modelo de datos

- **`DB`** (≈885): objeto `{KEY: {…}}` con las **9 empresas de fábrica** (MSFT, ASML, AMZN, CSU, AAPL,
  GOOGL, META, NVDA, WDC). Campos por empresa: `name, ticker, tvSymbol, shares, price, color, wacc,
  sector`, series de 10 años (`sales, ebit, ebitda, netIncome, fcf, eps, fcfps, roic, ebitdaM, ebitM,
  fcfM, netDebt, years`), múltiplos históricos (`hEvF, hPER, hEvEbitda, hEvEbit`) y medianas
  (`medPER, medEvFcf, medEvEbitda, medEvEbit`, `med5*`), proyecciones (`pY, pS, pEB, pF, pEPS, pND`), `isD`.
- **`FICHA`** (≈1125): datos cualitativos/trimestrales/mercado por empresa. Clave = ticker. Se usa
  por `coKey` en `rResumen` (`fichaData = FICHA[coKey] || {}`) **sea la empresa de fábrica o añadida
  por el usuario** — no depende de `BUILTIN_KEYS`. Si no hay entrada, la pestaña Resumen cae en
  `rPerfilAuto()` (perfil 100% automático, sin análisis cualitativo). Hoy tienen `FICHA` las 9 de
  fábrica + todo `CATALOG` (ver sección "Ficha rica de contexto" más abajo).
- **`CATALOG`** (≈4717 → busca `const CATALOG=`): catálogo para importar (name, domain, color, sector,
  `tv`). `catalogFor(key)` resuelve alias (`TSMC→TSM`, `2330→TSM`) y sufijos de bolsa.
- **Empresas añadidas por el usuario**: guardadas en `localStorage` (`vi_import_*`), recuperadas a `DB`
  al cargar con `hydrateImportedIntoDB()` → `buildDbEntryFromImport()`.

### Ficha rica de contexto (`FICHA`) — cómo añadirla a una empresa nueva

El bloque "Contexto de empresa" (descripción, segmentos de negocio, rival principal, catalizadores,
riesgos) que ves arriba del todo en la pestaña Resumen viene de `FICHA[TICKER]`. Si el ticker no está
ahí, se pinta en su lugar `rPerfilAuto()`: solo cifras (ventas, FCF, ROIC, deuda) sacadas de sus
cuentas, sin nada cualitativo — y lo dice explícitamente en la propia ficha.

Para que una empresa nueva tenga la ficha "mejorada" (no la automática):

1. Si la empresa no está en `CATALOG` (grep `const CATALOG=`), añádela ahí primero (`name, domain,
   color, sector`, y `tv` si su símbolo de TradingView no es el ticker a secas).
2. Añade su entrada en `FICHA` con este esquema (copia el de `WDC:{exchange:` como plantilla):

   ```js
   TICKER:{exchange:'NASDAQ',
     businessLines:[{pct,name,desc}, ...],      // segmentos de negocio, pct suman ~100
     descRich:'<strong class="ficha-keyword" style="border-color:HEX">Nombre</strong> ...',
     position:'...', positionLabel:'...', share:'...',
     subsectors:[{rank,sector,share,note}, ...],
     rival:{name,ticker,color,why:['razón 1','razón 2','razón 3']},  // 1 rival principal
     catalysts:[{icon,title,color,text}, ...],   // 2-3 catalizadores
     risks:'riesgo 1 · riesgo 2 · riesgo 3',      // string, separado por " · "
     tvInterval:'W',
     // opcionales — solo si el dato es reciente y verificado, nunca inventado:
     lastQ:{label,salesYoY,epsYoY,salesVal,epsVal},
     nextQ:{label,salesEst,epsEst,guidance},
     ath:{price,date,dist52wHigh,dist52wLabel},
   },
   ```

3. `lastQ`/`nextQ`/`ath` son opcionales a propósito: son datos de mercado muy perecederos (se quedan
   desfasados en semanas). Si no tienes la cifra verificada y reciente, **omítelos** — la plantilla
   oculta esos bloques automáticamente cuando no existen.
4. Este texto (`descRich`, `risks`, `catalysts[].text`, etc.) es contenido redactado, no datos del
   Excel del usuario → no dispara el banner "NO son de tu Excel" (regla de oro 1), que aplica solo a
   las series financieras (`sales, ebit, fcf...`). Aun así tiene que ser real y verificable, no
   inventado — igual que el resto de `FICHA`.
5. Verifica con `node --check` (regla de oro 3) y mira la pestaña Resumen de esa empresa en el navegador.
- **Estado global** (≈1420): `co` (empresa activa), `price`, `curTab`, `tEVF/tPER/tEVE/tEVEI` (múltiplos
  objetivo activos), `_projSource` ('sheet'|'auto'), `_projManual`, `_webProj`, `BUILTIN_KEYS`.

---

## Índice de funciones por área (grep el nombre)

**Arranque / navegación**
`switchCo` (cambia empresa) · `setView` (dash/watch/analysis; oculta ticker en analysis) ·
`showTab` (pinta pestaña + `buildCharts`) · `startPriceRefresh` · `startDashRefresh`.
TABS: resumen, graficos, alertas(🔍 Análisis), valoracion, academia, tesis.

**Precio en vivo / mercado**
`fetchLivePrice`+`_fetchFinnhub` (cabecera, Finnhub tiempo real) · `fetchCarteraPrices`
(tabla cartera: Finnhub real-time, Yahoo para % semanal) · `fetchQuoteYF`+`_parseYF` (Yahoo, cierre diario) ·
`fetchDashPrices`+`updateDashMktTile` (ticker) · `fetchEuribor`+`_parseEcbCsv` (BCE) · `fetchFearGreed` ·
`_startTicker` (giratorio; clona items, sin rAF).

**Símbolos / logos** `tvSymbolFor`/`tvLinkFor` (TradingView; `TV_EMBED`/`TV_LINK`, Taiwán usa ADR) ·
`yfSymbolFor` (Yahoo; `YF_LOCAL`, `2330→2330.TW`) · `catalogFor` · `_domainFor`/`logoUrlFor` · `setLogo`.

**Cálculos (motor de valoración)** `calcISModel` (proyección a 5 años: hoja / web FMP / simulación) ·
`calcVerdict` (score MdS+MOAT+ROIC → COMPRAR/MANTENER/EVITAR) · `calcDCF` · `calcReverseDCF` ·
`calcStressDCF` · `calcMoat` · `calcFCFQuality` · `avgTargetsFor`/`evfTargetsFor` (precios objetivo) ·
`getCompanyMults`/`applyCompanyMults`/`baseMultsFor` · `computeMediansFor` · `recalc` (+`_refresh*` DOM).

**Proyecciones automáticas (sin Excel)** `ensureWebProj` (consenso FMP o modelo SEC) · `setProjSource` ·
`_preferFMPIfAvailable` · `_estimateProjections` (rellena pEB/pF/pEPS/pND por márgenes) ·
`autoISDFromFinancials` · `fetchFMPEstimates`. Marca `estimated`, banner `estimatedBanner()`.

**Render de pestañas** `rResumen` (≈3019, la más grande: banner empresa, KPIs, estilo, veredicto,
checklist, target 5Y, gráfico TradingView, análisis técnico, mi posición) · `rGraficos` · `rValoracion`
(≈3606: precio vs valor intrínseco, múltiplos hist, escenarios, tabla precios objetivo) · `rProyecciones` ·
`rMoat` · `rDCF` · `rAnalisis`/`rAlertas` · `rTesis`+`genTesis` (IA) · `rAcademia` · `rSidebarEmpresa`.

**Gráficos (Chart.js)** `buildCharts(tab)` (despacha por pestaña) · `buildFairValueChart`
(precio vs valor intrínseco, resumen∈valoracion) · `buildMultHistChart` · `computeTechnicals`+
`renderTechnicals`+`fetchDailyHistory`+`_sma`/`_rsi` (análisis técnico, en **resumen**) · `openMetricChart`.

**Cartera / dashboard** `renderDashboard` · `renderCartera` (tabla rica; columnas Precio, **Mi coste**,
Sem., Obj precio, Entrada, Obj 5Y, PEG) · `updateCarteraRow` · `carteraMetrics` · `getAllPortfolioCompanies` ·
`calcPortfolioVI` · `renderStyleCompare` (Growth vs Value, plegable) · `pegBar` · `showColInfo`/`showGvHelp`/`showCarteraHelp` (popups ayuda columnas).

**Mi posición / precios de compra** `getMiPosicion`/`saveMiPosicion`/`rMiPosicion` (dentro de análisis) ·
`getPositionFor`/`setCarteraPos` (columna "Mi coste" en cartera) · `_posKey`. Almacén: `pos_<KEY>`.

**Copia de seguridad (pasar al móvil)** `openBackupModal`/`_collectBackup`/`_encodeBackup`/`_decodeBackup`
(base64 url-safe, robusto a saltos del email) · `applyBackup`/`restoreFromFile`/`downloadBackup`.
Excluye empresas de fábrica del backup para achicar el código.

**Noticias** `fetchDashNews` (Finnhub company-news, ventana 3 semanas) · `scoreNews` (relevancia) ·
`newsImpact` (verde/ámbar/rojo) · `newsSim`/`newsTokens` (dedup por contexto) · `newsSourceRank`
(prioridad de fuente) · `_translateNews` (a español, cache).

**Importar** `openImportModal`/`doImport`/`parseExcelData` (Excel del usuario) ·
`buildImportFromFinancials` (auto SEC/Finnhub) · `buildDbEntryFromImport`+`_estimateProjections` ·
`hydrateImportedIntoDB` · `importFromLink`/`refreshAllImports` (re-descarga desde Drive) · `deleteCompanyFull`.

**Seguimiento (watchlist)** `renderWatchlist` · `computePreAnalysis` · `fetchFundamentals` ·
`promoteToAnalysis` (mueve de watchlist a análisis con datos auto).

---

## Claves de `localStorage`

Datos del usuario (van en la copia de seguridad): `vi_import_<KEY>` (empresas añadidas) ·
`pos_<KEY>` (precio de compra) · `vi_drive_<KEY>` (enlace Drive) · `vi_mults_<KEY>` (múltiplos editados) ·
`vi_watchlist` · `vi_hidden` · `finnhub_api_key` · `fmp_api_key`.
Cachés/ajustes (no críticos): `vi_autoval_*`, `vi_euribor`, `vi_feargreed`, `vi_news_es`,
`vi_lastpx_<KEY>`, `vi_view`, `vi_dark`, `vi_gv_open`.

---

## Fuentes de datos externas (todo cliente, con proxies CORS)

- **Finnhub** (`finnhub.io`): precio en vivo, cuentas anuales SEC, earnings, noticias. Key en localStorage.
- **Yahoo Finance** (chart API vía `corsproxy.io` / `allorigins.win`): cierre diario, histórico para técnico.
- **FMP** (`financialmodelingprep.com`): consenso de analistas (proyecciones web). Key opcional.
- **BCE** (`data-api.ecb.europa.eu`): Euríbor 12M. **CNN** fear&greed. **Google translate** gtx (noticias).
- **TradingView** widget embed: gráfico de cotización (bolsas no-US como Taiwán no cargan → se usa ADR).

---

## Convenciones y trampas

- **`_dm()`** es una **función** (`document.documentElement.classList.contains('dark')`) — llamar siempre
  `_dm()`, nunca `_dm` como booleano (siempre truthy).
- Los templates de render mezclan color claro/oscuro con `${_dm()?osc:claro}` **dentro de template
  literals** (backticks). Nunca meter `${_dm()…}` en reglas CSS de clase (rompe el CSS).
- Verificación JS: `python3` extrae los `<script>` inline (excluye los que llevan `</script>`), luego
  `node --check`. La app no tiene tests.
- Estilo de código: sin build, sin módulos; funciones globales que comparten estado global (`co`, `price`…).
  Al partir en varios `<script>` seguirían compartiendo scope global — pero **hoy es archivo único**.
- Empresas: 9 de fábrica (`BUILTIN_KEYS`) + añadidas por el usuario (localStorage). Al borrar, las de
  fábrica se **ocultan** (restaurables), las añadidas se **eliminan**.
