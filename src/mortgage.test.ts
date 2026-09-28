import { describe, expect, it } from 'vitest';
import { amortize, compare, estimateHousingCosts, formatMonth, monthIndex, monthString, monthlyPayment, paymentAt, validate, type Inputs } from './mortgage';

const base: Inputs = { amount: 400000, rate: 2, years: 30, start: '2021-09', comparisonRate: 7, price: 600000, downPayment: 120000, newYears: 30 };

describe('fixed-rate mortgage calculations', () => {
  it('matches the established 400k, 30-year examples at 2% and 7%', () => {
    expect(monthlyPayment({ amount: 400000, rate: 2, months: 360 })).toBeCloseTo(1478.477890755, 7);
    expect(monthlyPayment({ amount: 400000, rate: 7, months: 360 })).toBeCloseTo(2661.209980717, 7);
  });
  it('repays principal exactly, reconciles each payment, and clears the final balance', () => {
    for (const rate of [0, .0001, 2, 7, 12, 30]) {
      const rows = amortize({ amount: 400000.12, rate, months: 360 });
      expect(rows.reduce((sum, p) => sum + p.principal, 0)).toBeCloseTo(400000.12, 2);
      expect(rows.at(-1)?.balance).toBe(0);
      for (const row of rows) {
        expect(row.interest).toBeGreaterThanOrEqual(0);
        expect(row.principal).toBeGreaterThanOrEqual(0);
        expect(row.principal + row.interest).toBeCloseTo(row.total, 2);
        expect(row.openingBalance - row.principal).toBeCloseTo(row.balance, 2);
      }
    }
  });
  it('handles zero interest and adjusts the last payment for cents rounding', () => {
    const rows = amortize({ amount: 1000, rate: 0, months: 12 });
    expect(rows[0].total).toBe(83.33);
    expect(rows.at(-1)?.total).toBe(83.37);
    expect(rows.every(p => p.interest === 0)).toBe(true);
  });
  it('rejects invalid core loan inputs', () => {
    expect(() => amortize({ amount: 100000, rate: -1, months: 360 })).toThrow();
    expect(() => amortize({ amount: NaN, rate: 2, months: 360 })).toThrow();
    expect(() => amortize({ amount: 100000, rate: 2, months: 0 })).toThrow();
  });
});

describe('comparison timelines', () => {
  it('defaults to the original term when no alternative term is supplied', () => {
    const comparison = compare(base, 'rate', '2026-09');
    expect(comparison.current).toHaveLength(360);
    expect(comparison.alternate).toHaveLength(360);
    expect(comparison.start).toBe(monthIndex('2021-09'));
    expect(comparison.current[0].openingBalance).toBe(comparison.alternate[0].openingBalance);
    expect(comparison.current[0].total).toBe(1478.48);
    expect(comparison.alternate[0].total).toBe(2661.21);
  });
  it('has no differences when both rates match', () => {
    const comparison = compare({ ...base, comparisonRate: 2 }, 'rate', '2026-09');
    expect(comparison.current).toEqual(comparison.alternate);
    expect(comparison.currentInterest).toBe(comparison.alternateInterest);
  });
  it('aligns a seasoned mortgage and a new purchase at the same calendar month', () => {
    const comparison = compare(base, 'purchase', '2026-09');
    expect(comparison.elapsed).toBe(60);
    expect(comparison.current).toHaveLength(300);
    expect(comparison.current[0].number).toBe(61);
    expect(comparison.current[0].openingBalance).toBe(comparison.original[59].balance);
    expect(comparison.alternate[0].openingBalance).toBe(480000);
    expect(comparison.alternate[0].number).toBe(1);
    expect(comparison.alternate[0].total).toBe(3193.45);
    expect(comparison.start).toBe(monthIndex('2026-09'));
    expect(comparison.horizon).toBe(360);
    expect(comparison.currentInterest).toBeCloseTo(comparison.current.reduce((sum, p) => sum + p.interest, 0), 2);
  });
  it('keeps an already-paid mortgage at zero instead of restarting it', () => {
    const comparison = compare({ ...base, start: '1990-01' }, 'purchase', '2026-09');
    expect(comparison.current).toEqual([]);
    expect(comparison.currentInterest).toBe(0);
    expect(comparison.currentTotal).toBe(0);
  });
  it('uses a shared horizon when the new loan is shorter than the old one', () => {
    const comparison = compare({ ...base, newYears: 15 }, 'purchase', '2026-09');
    expect(comparison.current).toHaveLength(300);
    expect(comparison.alternate).toHaveLength(180);
    expect(comparison.horizon).toBe(300);
  });
  it('compares a 15-year alternative against the original 30-year loan', () => {
    const comparison = compare({ ...base, comparisonRate: 2, comparisonYears: 15 }, 'rate', '2026-09');
    expect(comparison.current).toHaveLength(360);
    expect(comparison.alternate).toHaveLength(180);
    expect(comparison.horizon).toBe(360);
    expect(comparison.alternate[0].openingBalance).toBe(400000);
    expect(comparison.alternate[0].total).toBe(2574.03);
    expect(comparison.alternateInterest).toBeLessThan(comparison.currentInterest);
    expect(comparison.alternate.at(-1)?.balance).toBe(0);
    expect(paymentAt(comparison, 'alternate', 180).total).toBe(0);
    expect(formatMonth(comparison.start + comparison.alternate.length - 1, true)).toBe('Aug 2036');
  });
  it('extends the timeline for a longer alternative and retains housing costs after either payoff', () => {
    const comparison = compare({ ...base, years: 15, comparisonYears: 30 }, 'rate', '2026-09', true);
    expect(comparison.current).toHaveLength(180);
    expect(comparison.alternate).toHaveLength(360);
    expect(comparison.horizon).toBe(360);
    expect(paymentAt(comparison, 'current', 180)).toMatchObject({ mortgagePayment: 0, interest: 0, total: 525 });
    expect(paymentAt(comparison, 'alternate', 180).mortgagePayment).toBeGreaterThan(0);
    const withoutCosts = compare({ ...base, years: 15, comparisonYears: 30 }, 'rate', '2026-09');
    expect(comparison.alternateInterest - comparison.currentInterest).toBe(withoutCosts.alternateInterest - withoutCosts.currentInterest);
  });
  it('keeps the alternative term independent from the buy-today term', () => {
    const inputs = { ...base, comparisonYears: 15, newYears: 20 };
    expect(compare(inputs, 'rate', '2026-09').alternate).toHaveLength(180);
    expect(compare(inputs, 'purchase', '2026-09').alternate).toHaveLength(240);
  });
});

describe('dates and validation', () => {
  it('handles year boundaries and labels the actual last payment month', () => {
    expect(monthString(monthIndex('2026-12') + 1)).toBe('2027-01');
    expect(formatMonth(monthIndex('2021-09') + 359, true)).toBe('Aug 2051');
    expect(() => monthIndex('2026-13')).toThrow();
    expect(() => monthIndex('')).toThrow();
  });
  it('rejects blank, negative, impossible dates, fractional years, and a full-price down payment', () => {
    expect(validate({ ...base, amount: NaN, rate: -1, years: 1.5, start: '', downPayment: 600000 }, 'purchase', '2026-09')).toMatchObject({ amount: expect.any(String), rate: expect.any(String), years: expect.any(String), start: expect.any(String), downPayment: expect.any(String) });
  });
  it('allows a future original comparison but requires an existing mortgage in buy-today mode', () => {
    expect(validate({ ...base, start: '2027-01' }, 'rate', '2026-09').start).toBeUndefined();
    expect(validate({ ...base, start: '2027-01' }, 'purchase', '2026-09').start).toBeTruthy();
  });
  it('validates the alternative term only when active, and allows a blank matching-term default', () => {
    for (const comparisonYears of [0, -1, 51, 15.5, NaN, Infinity]) {
      expect(validate({ ...base, comparisonYears }, 'rate', '2026-09').comparisonYears).toBeTruthy();
      expect(validate({ ...base, comparisonYears }, 'purchase', '2026-09').comparisonYears).toBeUndefined();
    }
    for (const comparisonYears of [undefined, 1, 15, 30, 50]) {
      expect(validate({ ...base, comparisonYears }, 'rate', '2026-09').comparisonYears).toBeUndefined();
    }
  });
});

describe('optional property taxes and homeowners insurance', () => {
  it('uses independent annual premiums and keeps insurance independent of property value', () => {
    expect(estimateHousingCosts(500000, true, 1200).insurance).toBe(100);
    expect(estimateHousingCosts(1000000, true, 1200).insurance).toBe(100);
    expect(estimateHousingCosts(500000, true, 0).insurance).toBe(0);
    expect(estimateHousingCosts(500000, true, 1234).insurance).toBe(102.83);
    const input = { ...base, annualInsurance: 1200, newAnnualInsurance: 2100 };
    const purchase = compare(input, 'purchase', '2026-09', true);
    expect(purchase.currentCosts.insurance).toBe(100);
    expect(purchase.alternateCosts.insurance).toBe(175);
    const rate = compare(input, 'rate', '2026-09', true);
    expect(rate.currentCosts.insurance).toBe(100);
    expect(rate.alternateCosts.insurance).toBe(100);
  });
  it('checks active premium overrides, while allowing zero and blank defaults', () => {
    expect(validate({ ...base, annualInsurance: -1 }, 'rate', '2026-09', true).annualInsurance).toBeTruthy();
    expect(validate({ ...base, annualInsurance: NaN }, 'rate', '2026-09', true).annualInsurance).toBeTruthy();
    expect(validate({ ...base, newAnnualInsurance: -1 }, 'purchase', '2026-09', true).newAnnualInsurance).toBeTruthy();
    expect(validate({ ...base, newAnnualInsurance: -1 }, 'rate', '2026-09', true).newAnnualInsurance).toBeUndefined();
    expect(validate({ ...base, annualInsurance: 0 }, 'rate', '2026-09', true).annualInsurance).toBeUndefined();
    expect(validate(base, 'rate', '2026-09', true).annualInsurance).toBeUndefined();
    expect(validate({ ...base, annualInsurance: -1 }, 'rate', '2026-09', false).annualInsurance).toBeUndefined();
  });
  it('converts annual taxes and the flat insurance allowance to monthly cents', () => {
    expect(estimateHousingCosts(500000)).toEqual({ taxes: 375, insurance: 150, total: 525 });
    expect(estimateHousingCosts(600000)).toEqual({ taxes: 450, insurance: 150, total: 600 });
    expect(estimateHousingCosts(500000, false)).toEqual({ taxes: 0, insurance: 0, total: 0 });
  });
  it('leaves the original loan-only numbers intact when unchecked', () => {
    const data = compare(base, 'rate', '2026-09');
    const payment = paymentAt(data, 'current', 0);
    expect(payment.total).toBe(1478.48);
    expect(payment.mortgagePayment).toBe(payment.total);
    expect(payment.taxes).toBe(0);
    expect(payment.insurance).toBe(0);
    expect(data.currentCosts.total).toBe(0);
  });
  it('adds identical home costs to both rate scenarios without changing their difference', () => {
    const off = compare(base, 'rate', '2026-09');
    const on = compare(base, 'rate', '2026-09', true);
    expect(on.currentCosts).toEqual(on.alternateCosts);
    expect(paymentAt(on, 'current', 0).total).toBe(2003.48);
    expect(paymentAt(on, 'alternate', 0).total).toBe(3186.21);
    expect(paymentAt(on, 'alternate', 0).total - paymentAt(on, 'current', 0).total).toBeCloseTo(paymentAt(off, 'alternate', 0).total - paymentAt(off, 'current', 0).total, 2);
    expect(on.current).toEqual(off.current);
    expect(on.alternate).toEqual(off.alternate);
    expect(on.currentInterest).toBe(off.currentInterest);
    expect(on.alternateInterest).toBe(off.alternateInterest);
  });
  it('uses home price, not mortgage size or down payment, for a new purchase', () => {
    const data = compare({ ...base, homeValue: 450000 }, 'purchase', '2026-09', true);
    const biggerDownPayment = compare({ ...base, homeValue: 450000, downPayment: 200000 }, 'purchase', '2026-09', true);
    expect(data.currentCosts).toEqual({ taxes: 337.5, insurance: 150, total: 487.5 });
    expect(data.alternateCosts.total).toBe(600);
    expect(data.alternateCosts).toEqual(biggerDownPayment.alternateCosts);
    expect(paymentAt(data, 'alternate', 0).total).toBe(3793.45);
  });
  it('keeps home costs after payoff without creating principal or interest', () => {
    const data = compare(base, 'purchase', '2026-09', true);
    expect(paymentAt(data, 'current', 300)).toMatchObject({ total: 525, mortgagePayment: 0, principal: 0, interest: 0, balance: 0, taxes: 375, insurance: 150 });
    const alreadyPaid = compare({ ...base, start: '1990-01' }, 'purchase', '2026-09', true);
    expect(paymentAt(alreadyPaid, 'current', 0).total).toBe(525);
    expect(alreadyPaid.currentTotal).toBeCloseTo(525 * alreadyPaid.horizon, 2);
  });
  it('reconciles every monthly total with the four parts and shared-horizon total', () => {
    const data = compare({ ...base, newYears: 15, homeValue: 543210 }, 'purchase', '2026-09', true);
    for (const loan of ['current', 'alternate'] as const) {
      let total = 0;
      for (let i = 0; i < data.horizon; i++) {
        const payment = paymentAt(data, loan, i);
        expect(payment.total).toBeCloseTo(payment.principal + payment.interest + payment.taxes + payment.insurance, 2);
        total += payment.total;
      }
      expect(total).toBeCloseTo(loan === 'current' ? data.currentTotal : data.alternateTotal, 2);
    }
  });
  it('validates custom home values only when costs are enabled', () => {
    for (const value of [0, -100, NaN, Infinity]) {
      expect(validate({ ...base, homeValue: value }, 'rate', '2026-09', true).homeValue).toBeTruthy();
      expect(validate({ ...base, homeValue: value }, 'rate', '2026-09', false).homeValue).toBeUndefined();
    }
    expect(validate(base, 'rate', '2026-09', true).homeValue).toBeUndefined();
  });
});
