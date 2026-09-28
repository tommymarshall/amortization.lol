import { describe, expect, it } from 'vitest';
import { chartValue } from './chart';
import { compare, type Inputs } from './mortgage';

const inputs: Inputs = { amount: 400000, rate: 2, years: 30, start: '2021-09', comparisonRate: 7, comparisonYears: 15, price: 600000, downPayment: 120000, newYears: 30 };

describe('interest comparison chart', () => {
  it('plots interest without principal, taxes, or insurance in either mode', () => {
    for (const mode of ['rate', 'purchase'] as const) {
      const data = compare(inputs, mode, '2026-09', true);
      for (const loan of ['current', 'alternate'] as const) {
        expect(chartValue(data, 'interest', loan, 0)).toBe(data[loan][0].interest);
        expect(chartValue(data, 'payment', loan, 0)).toBe(data[loan][0].total + data[loan === 'current' ? 'currentCosts' : 'alternateCosts'].total);
        expect(chartValue(data, 'interest', loan, data[loan].length)).toBe(0);
      }
    }
  });
  it('reconciles the net monthly interest gaps with full-term or remaining interest totals', () => {
    for (const mode of ['rate', 'purchase'] as const) {
      const data = compare(inputs, mode, '2026-09', true);
      const netGap = Array.from({ length: data.horizon }, (_, month) => chartValue(data, 'interest', 'alternate', month) - chartValue(data, 'interest', 'current', month)).reduce((sum, value) => sum + value, 0);
      expect(netGap).toBeCloseTo(data.alternateInterest - data.currentInterest, 2);
    }
  });
  it('nets positive and negative gaps when a shorter loan has a higher rate', () => {
    const data = compare({ ...inputs, comparisonRate: 3 }, 'rate', '2026-09');
    expect(chartValue(data, 'interest', 'alternate', 0)).toBeGreaterThan(chartValue(data, 'interest', 'current', 0));
    expect(chartValue(data, 'interest', 'alternate', 180)).toBeLessThan(chartValue(data, 'interest', 'current', 180));
    expect(data.alternateInterest).toBeLessThan(data.currentInterest);
  });
  it('keeps zero-interest curves and totals at zero with unequal terms and housing costs', () => {
    const data = compare({ ...inputs, rate: 0, comparisonRate: 0 }, 'rate', '2026-09', true);
    expect(data.alternateInterest - data.currentInterest).toBe(0);
    for (const month of [0, 100.5, 180, 359, 360]) {
      expect(chartValue(data, 'interest', 'current', month)).toBe(0);
      expect(chartValue(data, 'interest', 'alternate', month)).toBe(0);
    }
  });
});
