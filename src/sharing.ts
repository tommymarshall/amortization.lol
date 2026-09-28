import { compare, formatMonth, money, monthIndex, paymentAt, validate, type Inputs, type Mode } from './mortgage';

export type Draft = { [K in keyof Inputs]-?: string };
export const initial: Draft = { amount: '400000', rate: '2', years: '30', start: '2021-09', comparisonRate: '7', comparisonYears: '', price: '600000', downPayment: '120000', newYears: '30', homeValue: '', annualInsurance: '', newAnnualInsurance: '' };
export const keys = Object.keys(initial) as (keyof Draft)[];
export const optionalKeys: (keyof Draft)[] = ['comparisonYears', 'homeValue', 'annualInsurance', 'newAnnualInsurance'];
export function parse(draft: Draft): Inputs {
  return Object.fromEntries(keys.map(key => [key, key === 'start' ? draft[key] : draft[key].trim() === '' ? (optionalKeys.includes(key) ? undefined : NaN) : Number(draft[key].replaceAll(',', ''))])) as unknown as Inputs;
}

export interface SharedComparison { draft: Draft; mode: Mode; includeHousingCosts: boolean; asOf: string }

// The fragment stays in the browser rather than being sent to the web server.
export function comparisonLink(scenario: SharedComparison, baseUrl: string): string {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = new URLSearchParams({ comparison: JSON.stringify({ v: 1, ...scenario }) }).toString();
  return url.href;
}

export function readComparisonLink(hash: string): SharedComparison | null {
  try {
    if (hash.length > 8192) return null;
    const raw = new URLSearchParams(hash.replace(/^#/, '')).get('comparison');
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (value?.v !== 1 || !['rate', 'purchase'].includes(value.mode) || typeof value.includeHousingCosts !== 'boolean' || typeof value.asOf !== 'string') return null;
    const asOf = monthIndex(value.asOf);
    if (asOf < monthIndex('1900-01') || asOf > monthIndex('2100-12')) return null;
    if (!keys.every(key => typeof value.draft?.[key] === 'string' && value.draft[key].length <= 80)) return null;
    const draft = Object.fromEntries(keys.map(key => [key, value.draft[key]])) as Draft;
    if (Object.keys(validate(parse(draft), value.mode, value.asOf, value.includeHousingCosts)).length) return null;
    return { draft, mode: value.mode, includeHousingCosts: value.includeHousingCosts, asOf: value.asOf };
  } catch { return null; }
}

const difference = (amount: number) => Math.abs(amount) < .005 ? 'no difference' : `${money(Math.abs(amount), 2)} ${amount > 0 ? 'more' : 'less'}`;

export function comparisonMessage(scenario: SharedComparison): string {
  const { mode, asOf, includeHousingCosts } = scenario;
  const inputs = parse(scenario.draft);
  const data = compare(inputs, mode, asOf, includeHousingCosts);
  const current = paymentAt(data, 'current', 0).total;
  const alternate = paymentAt(data, 'alternate', 0).total;
  const opening = mode === 'purchase' ? [] : ['Same mortgage. Very different rate. Guess which one your budget would notice?'];
  const scenarioText = mode === 'purchase'
    ? `Current loan: ${money(inputs.amount)} original at ${inputs.rate}% for ${inputs.years} years, started ${formatMonth(monthIndex(inputs.start), true)}. New home: ${money(inputs.price)} price, ${money(inputs.downPayment)} down, ${inputs.comparisonRate}% for ${inputs.newYears} years.`
    : `Our current loan: ${money(inputs.amount)} at ${inputs.rate}% for ${inputs.years} years.`;
  const horizon = mode === 'purchase' ? 'over the remaining loan terms' : 'over the full loan terms';
  const payoff = (length: number) => length ? formatMonth(data.start + length - 1, true) : 'already paid off';
  const currentPayoff = payoff(data.current.length);
  const alternatePayoff = payoff(data.alternate.length);
  const payoffLine = currentPayoff === alternatePayoff
    ? `Both loans paid off ${currentPayoff}.`
    : `Payoff: current loan ${currentPayoff}; ${mode === 'purchase' ? 'new home' : 'alternative'} ${alternatePayoff}.`;
  const monthlyReaction = Math.abs(alternate - current) < .005
    ? 'Well, look at that: the monthly payment stays put.'
    : alternate > current
      ? '😅'
      : 'A little more breathing room in the monthly budget ✨.';
  return [
    ...opening,
    scenarioText,
    `Monthly payment is ${money(current, 2)} for our current loan vs. ${money(alternate, 2)} for ${mode === 'purchase' ? 'the new home' : 'the alternative'} — ${difference(alternate - current)}. ${monthlyReaction}`,
    `Difference in interest amount is ${difference(data.alternateInterest - data.currentInterest)} ${horizon} (${money(data.currentInterest, 2)} current vs. ${money(data.alternateInterest, 2)} ${mode === 'purchase' ? 'new home' : 'alternative'}).`,
    payoffLine,
    includeHousingCosts ? 'Payments include estimated property taxes and insurance.' : "And that doesn't include taxes or insurance.",
  ].join('\n\n');
}
