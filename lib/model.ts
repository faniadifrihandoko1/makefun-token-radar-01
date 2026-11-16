// lib/model.ts — the radar-2 value model for the token launch radar.
//
// The model reads only the sealed snapshot's own figures: a protocol's TVL,
// its seven-day change, how long it has run with no token recorded, and how
// many chains it runs on. Nothing here names a protocol, and nothing here
// predicts whether or when a token is issued: the implied value is the
// entry's own claim about what a launch would be worth if the record
// stayed as it is.

/** One protocol of the sealed snapshot, exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot: the fetch, its floor, its protocols, its watchlist. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's arithmetic for one protocol, as the board shows it. */
export interface ModelDetail {
  base_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  age_days: number | null;
  chain_count: number;
}

/** One ranked row of the board. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: string;
  age_days: number | null;
  momentum: string;
  implied_value_usd: number;
  model: ModelDetail;
  farm_steps: string[];
}

/** One protocol whose token already trades, for the dashboard's live list. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

/** What buildRadar returns: the ranked board and the live list beside it. */
export interface RadarBoard {
  rows: BoardRow[];
  live: LiveRow[];
  watchlistSize: number;
  earlySize: number;
  liveSize: number;
}

/** The model's name, as the dashboard states it. */
export const MODEL_VERSION = 'radar-2';

/** The model's constants, as data.js states them. */
export const MODEL_CONSTANTS = {
  base_multiple: 0.3,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 200,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_step: 0.04,
  breadth_cap: 5,
} as const;

/** How many live-token protocols the dashboard lists. */
export const LIVE_SIZE = 24;

/** A protocol the radar will not rank as an early launch: a wrapped, staked
 *  or bridged product of a token that already trades, a versioned build, or
 *  an exchange's own product. The watchlist the snapshot carries was built
 *  with this same rule plus DefiLlama's parent record, which the snapshot
 *  does not carry, so the board reads the watchlist as given and applies
 *  this rule only to the protocols below the floor. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_NAMES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];
const VERSION_TAIL = /\s+(?:v\d+(?:\.\d+)*|\d+\.\d+)\s*$/i;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** The snapshot's text as a Snapshot, or an error when it is not one. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('parseSnapshot: the snapshot is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('parseSnapshot: the snapshot is not an object');
  }
  const snap = raw as Record<string, unknown>;
  if (typeof snap.as_of !== 'string') throw new Error('parseSnapshot: as_of is not a string');
  if (typeof snap.source !== 'string') throw new Error('parseSnapshot: source is not a string');
  if (typeof snap.floor_usd !== 'number') throw new Error('parseSnapshot: floor_usd is not a number');
  if (!Array.isArray(snap.protocols)) throw new Error('parseSnapshot: protocols is not an array');
  if (!Array.isArray(snap.watchlist)) throw new Error('parseSnapshot: watchlist is not an array');
  for (const p of snap.protocols as Record<string, unknown>[]) {
    if (typeof p !== 'object' || p === null) throw new Error('parseSnapshot: a protocol is not an object');
    if (typeof p.slug !== 'string') throw new Error('parseSnapshot: a protocol has no slug');
    if (typeof p.name !== 'string') throw new Error('parseSnapshot: a protocol has no name');
    if (!Array.isArray(p.chains)) throw new Error(`parseSnapshot: ${p.slug} has no chains`);
    if (typeof p.tvl_usd !== 'number') throw new Error(`parseSnapshot: ${p.slug} has no tvl_usd`);
  }
  return raw as unknown as Snapshot;
}

/** Whole days from a UTC day string to another, or null when unlisted. */
function ageInDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const [ay, am, ad] = asOf.split('-').map(Number);
  const [ly, lm, ld] = listedAt.split('-').map(Number);
  const ms = Date.UTC(ay, am - 1, ad) - Date.UTC(ly, lm - 1, ld);
  return Math.round(ms / 86400000);
}

/** A growth figure clamped to the model's floor and cap. */
function clampedGrowth(change7d: number | null): number {
  if (change7d === null) return 0;
  return Math.min(MODEL_CONSTANTS.growth_cap, Math.max(MODEL_CONSTANTS.growth_floor, change7d));
}

/** A multiplier rounded to four decimals, as the board shows it. */
function rounded4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

/** A protocol's momentum from its seven-day change, or Unreported. */
function momentumLabel(change7d: number | null): string {
  if (change7d === null) return 'Unreported';
  if (change7d >= 20) return 'Surging';
  if (change7d >= 5) return 'Rising';
  if (change7d > -5) return 'Steady';
  if (change7d >= -15) return 'Cooling';
  return 'Falling';
}

/** Whether the protocol records a token already. */
function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Whether the protocol is a wrapped, staked or bridged product, a
 *  versioned build, or an exchange's own product. */
function isExcluded(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSION_TAIL.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  for (const exchange of EXCHANGE_NAMES) {
    if (p.name.startsWith(exchange)) return true;
  }
  return false;
}

/** A protocol's implied value and the model's arithmetic behind it. The
 *  value multiplies the unrounded multipliers; the board shows them rounded
 *  to four decimals. */
function scoreProtocol(p: SnapshotProtocol, asOf: string): { implied: number; detail: ModelDetail } {
  const age = ageInDays(p.listed_at, asOf);
  const effectiveAge = age === null ? MODEL_CONSTANTS.unknown_age_days : age;
  const growthPct = clampedGrowth(p.change_7d);
  const growthMultiplier = 1 + (growthPct / 100) * MODEL_CONSTANTS.growth_weight;
  const maturityMultiplier =
    MODEL_CONSTANTS.maturity_floor +
    (Math.min(effectiveAge, MODEL_CONSTANTS.maturity_days) / MODEL_CONSTANTS.maturity_days) *
      MODEL_CONSTANTS.maturity_range;
  const breadthMultiplier =
    1 + MODEL_CONSTANTS.breadth_step * Math.min(p.chains.length - 1, MODEL_CONSTANTS.breadth_cap);
  const implied = Math.round(
    p.tvl_usd * MODEL_CONSTANTS.base_multiple * growthMultiplier * maturityMultiplier * breadthMultiplier,
  );
  return {
    implied,
    detail: {
      base_multiple: MODEL_CONSTANTS.base_multiple,
      growth_pct: growthPct,
      growth_multiplier: rounded4(growthMultiplier),
      maturity_multiplier: rounded4(maturityMultiplier),
      breadth_multiplier: breadthMultiplier,
      age_days: age,
      chain_count: p.chains.length,
    },
  };
}

/** The deposit tier for a farm plan, from the protocol's TVL. */
function depositTier(tvlUsd: number): { deposit: number; gas: number } {
  if (tvlUsd >= 1000000000) return { deposit: 150, gas: 8 };
  if (tvlUsd >= 100000000) return { deposit: 100, gas: 4 };
  return { deposit: 50, gas: 4 };
}

/** How long a farm plan holds, from how long the protocol has run. */
function holdDays(age: number | null): number {
  if (age === null || age >= 365) return 30;
  if (age >= 180) return 45;
  return 60;
}

/** Which kind of second step a protocol's farm plan takes, from its kind. */
type PlanKind =
  | 'vault'
  | 'liquidity'
  | 'supply'
  | 'margin'
  | 'yield'
  | 'stake'
  | 'stable'
  | 'cover'
  | 'market'
  | 'default';

function planKind(category: string | null): PlanKind {
  switch (category) {
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return 'vault';
    case 'Dexs':
    case 'Indexes':
    case 'Leveraged Farming':
    case 'Yield':
    case 'Yield Aggregator':
      return 'liquidity';
    case 'CDP':
    case 'Collateral Markets':
    case 'Lending':
    case 'Uncollateralized Lending':
      return 'supply';
    case 'Derivatives':
    case 'Interest Rate Derivatives':
      return 'margin';
    case 'RWA':
      return 'yield';
    case 'Restaking':
    case 'Staking Pool':
      return 'stake';
    case 'Dual-Token Stablecoin':
    case 'Stablecoin Wrapper':
      return 'stable';
    case 'Insurance':
      return 'cover';
    case 'Prediction Market':
      return 'market';
    default:
      return 'default';
  }
}

/** The seven-step farm plan for one protocol: what to do, what it costs,
 *  and how long it takes, each step shaped by the protocol's own figures. */
function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains[0];
  const { deposit, gas } = depositTier(p.tvl_usd);
  const hold = holdDays(age);
  const kind = planKind(p.category);
  let second: string;
  switch (kind) {
    case 'vault':
      second = `Deposit $${deposit} into a ${p.name} vault on ${chain} and keep the shares. Cost: $${deposit} of capital and about $${gas} of gas. Time: 15 minutes to set up.`;
      break;
    case 'liquidity':
      second = `Provide $${deposit} of liquidity to ${p.name}'s main pool on ${chain} and keep the position open. Cost: $${deposit} of capital and about $${gas} of gas. Time: 15 minutes to set up.`;
      break;
    case 'supply':
      second = `Supply $${deposit} of USDC to ${p.name} on ${chain} and keep the position open. Cost: $${deposit} of capital and about $${gas} of gas. Time: 15 minutes to set up.`;
      break;
    case 'margin':
      second = `Deposit $${deposit} of USDC as margin on ${p.name} and open one small hedge. Cost: $${deposit} of capital and about $${gas} of gas. Time: 15 minutes to set up.`;
      break;
    case 'yield':
      second = `Mint $${deposit} of the protocol's yield asset on ${chain} and hold it. Cost: $${deposit} of capital and about $${gas} of gas. Time: 15 minutes to set up.`;
      break;
    case 'stake':
      second = `Stake $${deposit} of the chain's staking asset through ${p.name} and keep the receipt. Cost: $${deposit} of capital and about $${gas} of gas. Time: 15 minutes to set up.`;
      break;
    case 'stable':
      second = `Mint or deposit $${deposit} of the stable asset through ${p.name} on ${chain}. Cost: $${deposit} of capital and about $${gas} of gas. Time: 15 minutes to set up.`;
      break;
    case 'cover':
      second = `Buy $${deposit} of cover from ${p.name} on ${chain} and keep the policy. Cost: $${deposit} of capital and about $${gas} of gas. Time: 15 minutes to set up.`;
      break;
    case 'market':
      second = `Fund $${deposit} and place one market position on ${p.name}. Cost: $${deposit} of capital and about $${gas} of gas. Time: 15 minutes to set up.`;
      break;
    default:
      second = `Deposit $${deposit} of USDC into ${p.name} on ${chain} and keep the position open. Cost: $${deposit} of capital and about $${gas} of gas. Time: 15 minutes to set up.`;
      break;
  }
  let fourth: string;
  switch (kind) {
    case 'vault':
      fourth = `Move a small part of the vault shares to a second vault the same curator runs. Cost: about $3 of gas for the extra transaction. Time: 10 minutes.`;
      break;
    case 'liquidity':
      fourth = `Swap a small amount through the pool once, in each direction, to leave a trading trace. Cost: about $3 of gas for the extra transaction. Time: 10 minutes.`;
      break;
    case 'supply':
      fourth = `Borrow a small amount against the deposit once, then repay it the same week. Cost: about $3 of gas for the extra transaction. Time: 10 minutes.`;
      break;
    case 'margin':
      fourth = `Close the hedge once and open a fresh one, so the wallet shows two round trips. Cost: about $3 of gas for the extra transaction. Time: 10 minutes.`;
      break;
    case 'market':
      fourth = `Settle one market and place a second, smaller position on a different outcome. Cost: about $3 of gas for the extra transaction. Time: 10 minutes.`;
      break;
    default:
      fourth = `Make one swap through the protocol once, so the wallet shows more than a deposit. Cost: about $3 of gas for the extra transaction. Time: 10 minutes.`;
      break;
  }
  return [
    `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.`,
    second,
    `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    fourth,
    `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. Cost: the $${deposit} stays in the position. Time: ${hold} days.`,
    `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.`,
  ];
}

/** One board row for a protocol, ranked later. */
function toRow(p: SnapshotProtocol, snapshot: Snapshot): BoardRow {
  const { implied, detail } = scoreProtocol(p, snapshot.as_of);
  return {
    rank: 0,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: detail.age_days,
    momentum: momentumLabel(p.change_7d),
    implied_value_usd: implied,
    model: detail,
    farm_steps: farmSteps(p, detail.age_days),
  };
}

/**
 * The ranked board for a snapshot: every protocol on its watchlist, plus
 * every pre-token protocol below the floor that is not a wrapped, staked or
 * bridged product, a versioned build or an exchange's product, ranked by
 * implied value; and the live list beside it, the largest live-token
 * protocols by market cap, exchanges left out.
 */
export function buildRadar(snapshot: Snapshot): RadarBoard {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlistSet = new Set(snapshot.watchlist);
  const board: BoardRow[] = [];
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) board.push(toRow(p, snapshot));
  }
  let earlySize = 0;
  for (const p of snapshot.protocols) {
    if (hasToken(p)) continue;
    if (p.tvl_usd >= snapshot.floor_usd) continue;
    if (watchlistSet.has(p.slug)) continue;
    if (isExcluded(p)) continue;
    board.push(toRow(p, snapshot));
    earlySize++;
  }
  board.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  board.forEach((row, i) => {
    row.rank = i + 1;
  });
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_SIZE)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));
  return {
    rows: board,
    live,
    watchlistSize: snapshot.watchlist.length,
    earlySize,
    liveSize: live.length,
  };
}

/**
 * The board's gate, as the scorer states it: the first violation, or null
 * when the board passes. A board the gate refuses is not written.
 */
export function boardIssue(board: RadarBoard, snapshot: Snapshot): string | null {
  const rows = board.rows;
  if (rows.length < 100 || rows.length > 4000) {
    return `board holds ${rows.length} rows, needs 100 to 4000`;
  }
  const seen = new Set<string>();
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const row of rows) {
    if (seen.has(row.slug)) return `board names ${row.slug} twice`;
    seen.add(row.slug);
    if (!known.has(row.slug)) return `board names ${row.slug}, which the snapshot does not list`;
    if (row.implied_value_usd <= 0 || !Number.isInteger(row.implied_value_usd)) {
      return `${row.slug} has no positive whole implied value`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `${row.slug} holds ${row.farm_steps.length} farm steps, needs 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `${row.slug} holds a farm step of ${trimmed.length} characters, needs 20 to 600`;
      }
    }
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].rank !== i + 1) return `row ${rows[i].slug} is ranked ${rows[i].rank}, needs ${i + 1}`;
    if (i > 0 && rows[i].implied_value_usd > rows[i - 1].implied_value_usd) {
      return `row ${rows[i].slug} is worth more than the row ranked above it`;
    }
  }
  if (new Set(rows.map((r) => r.implied_value_usd)).size === 1 && rows.length > 1) {
    return 'every row holds the same implied value, so the board ranks nothing';
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `board leaves out ${slug} of the watchlist`;
  }
  return null;
}

/** The dashboard's data file: the board slimmed to what the page shows,
 *  beside the live list and the model's own numbers. */
export function dataScript(board: RadarBoard, snapshot: Snapshot): string {
  const rows = board.rows.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    mcap_usd: r.mcap_usd,
    listed_at: r.listed_at,
    age_days: r.age_days,
    momentum: r.momentum,
    implied_value_usd: r.implied_value_usd,
    growth_multiplier: r.model.growth_multiplier,
    maturity_multiplier: r.model.maturity_multiplier,
    breadth_multiplier: r.model.breadth_multiplier,
  }));
  const payload = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL_CONSTANTS,
    model_version: MODEL_VERSION,
    watchlist_size: board.watchlistSize,
    board_size: board.rows.length,
    early_size: board.earlySize,
    live_size: board.liveSize,
    rows,
    live: board.live,
  };
  return `window.RADAR=${JSON.stringify(payload)};\n`;
}
