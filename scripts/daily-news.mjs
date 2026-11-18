#!/usr/bin/env node
// Genera data/daily-news.json: la noticia más relevante (o la más reciente dentro de los últimos
// 7 días si no hay nada fresco) de cada empresa de data/news-companies.json, usando Finnhub y el
// mismo criterio de relevancia/impacto que fetchDashNews()/scoreNews()/newsImpact() en index.html.
// Lo ejecuta a diario .github/workflows/daily-news.yml — si cambias ese criterio en el front,
// actualízalo también aquí (están duplicados a propósito: uno corre en el navegador, otro en CI).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
if (!FINNHUB_KEY) {
  console.error('Falta la variable de entorno FINNHUB_API_KEY.');
  process.exit(1);
}

const COMPANIES_PATH = path.join(ROOT, 'data', 'news-companies.json');
const OUT_PATH = path.join(ROOT, 'data', 'daily-news.json');

const companies = JSON.parse(fs.readFileSync(COMPANIES_PATH, 'utf8'));
const ALL = [
  ...companies.cartera.map(c => ({ ...c, group: 'cartera' })),
  ...companies.seguimiento.map(c => ({ ...c, group: 'seguimiento' })),
];

// ── Mismos criterios que index.html (ver scoreNews/newsImpact ahí) ──
const NEWS_BLOCK = /(stocks? to (watch|buy|sell)|best stocks|top \d+ stocks|stocks? that|market wrap|premarket|pre-market|after hours|movers|trending tickers|dow jones|s&p 500|nasdaq (today|closes|futures)|futures (rise|fall|mixed|edge)|jim cramer|analyst (ratings|roundup)|things to know|here'?s what|magnificent seven|7 stocks|cup of joe|stock market today)/i;
const NEWS_PAYWALL = /wall street journal|\bwsj\.com\b|financial times|\bft\.com\b|bloomberg|barrons?\.com|barron'?s|seekingalpha\.com|seeking alpha|\bimf\b\.org/i;
const NEWS_EVENTS = [
  { re: /\b(q[1-4]\b|quarter|quarterly|earnings|results|eps|revenue|beat|beats|misses?|topped|profit)\b/i, w: 30 },
  { re: /\b(guidance|forecast|outlook|raises?|lifts?|cuts? (its )?(guidance|forecast|outlook)|lowered)\b/i, w: 28 },
  { re: /\b(acqui|merger|takeover|to buy|buys|acquires?|deal to buy|stake in)\b/i, w: 30 },
  { re: /\b(dividend)\b/i, w: 22 },
  { re: /\b(buyback|repurchase|share ?repurchase)\b/i, w: 22 },
  { re: /\b(ceo|cfo|coo|chief executive|chairman|steps down|resigns?|resignation|appoints?|names? .{0,20}(ceo|cfo)|successor)\b/i, w: 24 },
  { re: /\b(contract|order worth|awarded|partnership|supply deal|multi-?year|billion.{0,12}(deal|contract|order))\b/i, w: 20 },
  { re: /\b(lawsuit|sues?|sued|litigation|antitrust|monopoly|fine|penalty|settlement|probe|investigat|subpoena)\b/i, w: 22 },
  { re: /\b(launch|unveil|unveils?|announces?|debut|new .{0,15}(chip|gpu|product|model|service|iphone|phone))\b/i, w: 16 },
  { re: /\b(regulat|approval|approved|ban|banned|sanction|tariff|export control|license)\b/i, w: 18 },
  { re: /\b(upgrade|downgrade|price target|initiat(es|ed) coverage|raised to|cut to|overweight|underweight)\b/i, w: 14 },
];
const NEWS_POS = /\b(beat|beats|beaten|surge|surges|soar|soars|jump|jumps|rally|rallies|record (revenue|profit|quarter|sales)|raises? (guidance|forecast|outlook|dividend)|hikes? dividend|dividend (increase|hike|boost)|upgrade|upgraded|outperform|overweight|strong (demand|results|growth|quarter)|wins?|won|awarded|secures?|expands?|expansion|approval|approved|buyback|repurchase|tops? (estimates|expectations)|better.than.expected|accelerat)\b/i;
const NEWS_NEG = /\b(miss|misses|missed|fall|falls|plunge|plunges|drop|drops|slump|slumps|tumble|tumbles|sink|sinks|cuts? (guidance|forecast|outlook|dividend)|slash|lawsuit|sued|sues?|probe|investigat|antitrust|monopoly|fine|penalty|recall|downgrade|downgraded|underperform|underweight|weak (demand|results|guidance)|layoffs?|job cuts|warns?|warning|delays?|halts?|ban|banned|sanction|loss|losses|bankrupt|slows?|slowdown|worse.than.expected|disappoint)\b/i;

function isPaywalled(n) {
  return NEWS_PAYWALL.test(((n.source || '') + ' ' + (n.url || '')).toLowerCase());
}
function newsImpact(n) {
  const t = (n.headline || '') + ' . ' + (n.summary || '');
  const pos = NEWS_POS.test(t), neg = NEWS_NEG.test(t);
  if (pos && !neg) return 'pos';
  if (neg && !pos) return 'neg';
  return 'neu';
}
// Finnhub ya filtra por símbolo (a diferencia de fetchDashNews, aquí no hay que descartar por
// "aparece en varias empresas"), así que el score solo prioriza tipo de evento y frescura.
function scoreNews(n) {
  const head = n.headline || '', sum = n.summary || '';
  if (head.length < 14) return -999;
  if (isPaywalled(n)) return -999;
  if (NEWS_BLOCK.test(head)) return -999;
  let score = 10;
  const rel = (n.related || '').split(',').filter(Boolean).length;
  if (rel >= 4) score -= 12;
  NEWS_EVENTS.forEach(ev => { if (ev.re.test(head)) score += ev.w; else if (ev.re.test(sum)) score += ev.w * 0.5; });
  const hrs = n.datetime ? (Date.now() - n.datetime * 1000) / 3600000 : 1e9;
  if (hrs <= 24) score += 10; else if (hrs <= 48) score += 5;
  return score;
}

async function translateToSpanish(text) {
  if (!text) return null;
  for (let i = 0; i < 2; i++) {
    try {
      const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=' + encodeURIComponent(text);
      const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
      if (r.ok) {
        const j = await r.json();
        const t = j[0].map(x => x[0]).join('').trim();
        if (t) return t;
      }
    } catch (e) { /* reintenta */ }
  }
  return null;
}

async function fetchCompanyNews(symbol) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${FINNHUB_KEY}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('Finnhub ' + r.status);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

// Elige la mejor noticia: prioriza algo fresco (≤48h) sobre puntuación bruta; si no hay nada
// fresco, se queda con la más relevante de los últimos 7 días y la marca como "previa".
function pickBest(news) {
  const scored = news.map(n => ({ n, score: scoreNews(n) })).filter(x => x.score > -900);
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || (b.n.datetime || 0) - (a.n.datetime || 0));
  const freshList = scored.filter(x => x.n.datetime && (Date.now() - x.n.datetime * 1000) / 3600000 <= 48);
  const best = freshList.length ? freshList[0] : scored[0];
  const hrs = best.n.datetime ? (Date.now() - best.n.datetime * 1000) / 3600000 : null;
  return { n: best.n, stale: hrs === null || hrs > 48, staleDays: hrs !== null ? Math.round(hrs / 24) : null };
}

async function main() {
  const items = [];
  const noNews = [];
  for (const co of ALL) {
    try {
      const news = await fetchCompanyNews(co.finnhubSymbol);
      const picked = pickBest(news);
      if (!picked) { noNews.push(co.key); continue; }
      const { n, stale, staleDays } = picked;
      const headlineEs = (await translateToSpanish(n.headline)) || n.headline;
      items.push({
        key: co.key,
        name: co.name,
        ticker: co.ticker,
        group: co.group,
        headline: headlineEs,
        url: n.url || '',
        source: n.source || '',
        datetime: n.datetime || null,
        impact: newsImpact(n),
        stale,
        staleDays,
      });
    } catch (e) {
      console.error('Error con', co.key, '-', e.message);
      noNews.push(co.key);
    }
    await new Promise(r => setTimeout(r, 300)); // no saturar el límite gratuito de Finnhub
  }
  // Frescas primero, luego por fecha descendente
  items.sort((a, b) => (a.stale === b.stale ? 0 : a.stale ? 1 : -1) || (b.datetime || 0) - (a.datetime || 0));
  const out = { generatedAt: new Date().toISOString(), items, noNews };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`Resumen generado: ${items.length} empresa(s) con noticia, ${noNews.length} sin noticia reciente (${noNews.join(', ')}).`);
}

main().catch(e => { console.error(e); process.exit(1); });
