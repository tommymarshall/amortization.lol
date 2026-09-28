import { describe, expect, it } from 'vitest';
import { compare, money, paymentAt } from './mortgage';
import { comparisonLink, comparisonMessage, initial, parse, readComparisonLink, type SharedComparison } from './sharing';

const scenario: SharedComparison = { draft: { ...initial }, mode: 'purchase', includeHousingCosts: false, asOf: '2026-09' };

describe('shared comparisons', () => {
  it('restores all inputs, mode, housing costs and calculation month without server query parameters', () => {
    const shared = { ...scenario, includeHousingCosts: true, draft: { ...initial, annualInsurance: '0', newAnnualInsurance: '2400', comparisonYears: '15' } };
    const url = new URL(comparisonLink(shared, 'https://example.com/?unrelated=secret#old'));
    expect(url.search).toBe('');
    expect(readComparisonLink(url.hash)).toEqual(shared);
    const reopened = readComparisonLink(url.hash)!;
    expect(comparisonMessage(reopened)).toBe(comparisonMessage(shared));
  });

  it('rejects broken, unsupported, out-of-range and oversized links', () => {
    for (const hash of ['#comparison=%7B', '#comparison=null', '#comparison=' + 'x'.repeat(9000)]) expect(readComparisonLink(hash)).toBeNull();
    for (const bad of [{ ...scenario, asOf: '2026-99' }, { ...scenario, mode: 'unknown' }, { ...scenario, draft: { ...initial, comparisonRate: '999' } }]) {
      expect(readComparisonLink('#' + new URLSearchParams({ comparison: JSON.stringify({ v: 1, ...bad }) }))).toBeNull();
    }
    expect(readComparisonLink('#' + new URLSearchParams({ comparison: JSON.stringify({ v: 2, ...scenario }) }))).toBeNull();
  });

  it('shares purchase payments and remaining interest with their actual comparison period', () => {
    const data = compare(parse(initial), 'purchase', scenario.asOf);
    const message = comparisonMessage(scenario);
    expect(message).toContain(`Monthly payment is ${money(paymentAt(data, 'current', 0).total, 2)}`);
    expect(message).toContain(`Difference in interest amount is`);
    expect(message).toContain(`${money(data.currentInterest, 2)} current vs. ${money(data.alternateInterest, 2)} new home`);
    expect(message).not.toContain('Sep 2026');
    expect(message).not.toContain('That house is cute.');
    expect(message).toContain("And that doesn't include taxes or insurance.");
    expect(message).not.toContain('PMI, HOA, closing, selling and moving costs');
  });

  it('labels rate comparisons as hypothetical full-term comparisons, including lower and equal costs', () => {
    const lower = comparisonMessage({ ...scenario, mode: 'rate', draft: { ...initial, comparisonRate: '1' } });
    expect(lower).toContain('less per month');
    expect(lower).toContain('over the full loan terms');
    expect(lower).toContain('not the cost of moving today');
    const equal = comparisonMessage({ ...scenario, mode: 'rate', draft: { ...initial, comparisonRate: '2' } });
    expect(equal).toContain('no difference per month');
    expect(equal).not.toContain('more per month');
    expect(equal).toContain('Both loans paid off Aug 2051.');
    expect(equal).not.toContain('Payoff: current loan');
  });

  it('includes housing costs in payments while keeping interest unchanged', () => {
    const shared = { ...scenario, includeHousingCosts: true, draft: { ...initial, annualInsurance: '0', newAnnualInsurance: '3600' } };
    const data = compare(parse(shared.draft), shared.mode, shared.asOf, true);
    const message = comparisonMessage(shared);
    expect(message).toContain(money(paymentAt(data, 'alternate', 0).total, 2));
    expect(message).toContain('Payments include estimated property taxes and insurance.');
    expect(message).toContain(`Difference in interest amount is`);
    expect(message).toContain(`${money(data.currentInterest, 2)} current`);
  });

  it('keeps the share text focused on monthly payments when the current loan pays off soon', () => {
    const shared = { ...scenario, draft: { ...initial, start: '1997-03' } };
    const data = compare(parse(shared.draft), shared.mode, shared.asOf);
    expect(data.current.length).toBeLessThan(12);
    const message = comparisonMessage(shared);
    expect(message).not.toContain('Across the first 12 months');
    expect(message).toContain(`Monthly payment is ${money(paymentAt(data, 'current', 0).total, 2)}`);
    expect(message).toContain('😅');
  });

  it('handles a paid-off current mortgage without claiming there is still a payment', () => {
    const message = comparisonMessage({ ...scenario, draft: { ...initial, start: '1990-01' } });
    expect(message).toContain('Monthly payment is $0.00 for our current loan');
    expect(message).toContain('current loan already paid off');
  });
});
