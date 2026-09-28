export type Mode = 'rate' | 'purchase';
export type ChartView = 'balance' | 'payment' | 'interest';
export interface Loan { amount: number; rate: number; months: number }
export interface Payment {
  number: number;
  openingBalance: number;
  balance: number;
  principal: number;
  interest: number;
  total: number;
}
export interface Inputs {
  amount: number;
  rate: number;
  years: number;
  start: string;
  comparisonRate: number;
  comparisonYears?: number;
  price: number;
  downPayment: number;
  newYears: number;
  homeValue?: number;
  annualInsurance?: number;
  newAnnualInsurance?: number;
}
// Tax assumption: ATTOM's 2025 US effective rate (published April 2026).
// Insurance is an editable $150/month planning allowance, not a current state average.
// Context: NAIC's 2023 Virginia HO-3 average was $1,537/year; market value is not rebuild cost.
export const HOUSING_ASSUMPTIONS = { propertyTaxRate: 0.009, annualInsurance: 1800, assumedLoanToValue: 0.8 } as const;
export interface HousingCosts { taxes: number; insurance: number; total: number }
export const zeroPayment: Payment = { number: 0, openingBalance: 0, balance: 0, principal: 0, interest: 0, total: 0 };
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function estimateHousingCosts(homeValue: number, enabled = true, annualInsurance: number = HOUSING_ASSUMPTIONS.annualInsurance): HousingCosts {
  if (!enabled) return { taxes: 0, insurance: 0, total: 0 };
  if (!Number.isFinite(homeValue) || homeValue <= 0) throw new Error('Invalid home value');
  if (!Number.isFinite(annualInsurance) || annualInsurance < 0) throw new Error('Invalid insurance premium');
  const taxes = cents(homeValue * HOUSING_ASSUMPTIONS.propertyTaxRate / 12);
  const insurance = cents(annualInsurance / 12);
  return { taxes, insurance, total: cents(taxes + insurance) };
}

export function monthlyPayment({ amount, rate, months }: Loan): number {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(rate) || rate < 0 || !Number.isInteger(months) || months < 1) throw new Error('Invalid loan');
  if (amount === 0) return 0;
  const r = rate / 1200;
  return r === 0 ? amount / months : amount * r / -Math.expm1(-months * Math.log1p(r));
}

/** Scheduled monthly payments, rounded to cents; the last payment clears rounding residue. */
export function amortize(loan: Loan): Payment[] {
  const payment = cents(monthlyPayment(loan));
  let balance = cents(loan.amount);
  const rows: Payment[] = [];
  if (!balance) return rows;
  for (let i = 0; i < loan.months && balance > 0; i++) {
    const interest = cents(balance * loan.rate / 1200);
    const principal = i === loan.months - 1 ? balance : Math.min(balance, cents(payment - interest));
    if (principal < 0) throw new Error('Payment must cover interest');
    const openingBalance = balance;
    balance = Math.max(0, cents(balance - principal));
    rows.push({ number: i + 1, openingBalance, balance, principal, interest, total: cents(principal + interest) });
  }
  return rows;
}

export function monthIndex(month: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month');
  const [year, m] = month.split('-').map(Number);
  return year * 12 + m - 1;
}
export function monthString(index: number): string {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}
export function currentMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
export function formatMonth(index: number, short = false): string {
  return new Date(Math.floor(index / 12), index % 12, 1).toLocaleDateString('en-US', { month: short ? 'short' : 'long', year: 'numeric' });
}
export function validate(inputs: Inputs, mode: Mode, today: string, includeHousingCosts = false): Partial<Record<keyof Inputs, string>> {
  const errors: Partial<Record<keyof Inputs, string>> = {};
  const range = (key: keyof Inputs, min: number, max: number, label: string) => {
    const value = inputs[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) errors[key] = `${label} must be between ${min.toLocaleString()} and ${max.toLocaleString()}.`;
  };
  range('amount', 100, 100000000, 'Loan amount');
  range('rate', 0, 30, 'Rate');
  range('comparisonRate', 0, 30, 'Rate');
  range('years', 1, 50, 'Term');
  if (includeHousingCosts && inputs.homeValue !== undefined) range('homeValue', 100, 1000000000, 'Home value');
  if (includeHousingCosts && inputs.annualInsurance !== undefined) range('annualInsurance', 0, 1000000, 'Annual premium');
  if (includeHousingCosts && mode === 'purchase' && inputs.newAnnualInsurance !== undefined) range('newAnnualInsurance', 0, 1000000, 'Annual premium');
  if (!Number.isInteger(inputs.years)) errors.years = 'Enter a whole number of years.';
  if (mode === 'rate' && inputs.comparisonYears !== undefined) {
    range('comparisonYears', 1, 50, 'Term');
    if (!Number.isInteger(inputs.comparisonYears)) errors.comparisonYears = 'Enter a whole number of years.';
  }
  try {
    const start = monthIndex(inputs.start);
    if (start < monthIndex('1900-01') || start > monthIndex('2100-12')) errors.start = 'Choose a date between 1900 and 2100.';
    else if (mode === 'purchase' && start > monthIndex(today)) errors.start = 'Your current mortgage must have started by this month.';
  } catch { errors.start = 'Choose the month of your first payment.'; }
  if (mode === 'purchase') {
    range('price', 100, 100000000, 'Home price');
    range('downPayment', 0, 100000000, 'Down payment');
    if (inputs.downPayment >= inputs.price) errors.downPayment = 'Down payment must be less than the home price.';
    range('newYears', 1, 50, 'Term');
    if (!Number.isInteger(inputs.newYears)) errors.newYears = 'Enter a whole number of years.';
    if (inputs.price - inputs.downPayment < 100) errors.downPayment = 'The new loan must be at least $100.';
  }
  return errors;
}

export function compare(inputs: Inputs, mode: Mode, today: string, includeHousingCosts = false) {
  if (Object.keys(validate(inputs, mode, today, includeHousingCosts)).length) throw new Error('Check the loan inputs');
  const original = amortize({ amount: inputs.amount, rate: inputs.rate, months: inputs.years * 12 });
  const elapsed = Math.max(0, Math.min(original.length, monthIndex(today) - monthIndex(inputs.start)));
  const current = mode === 'rate' ? original : original.slice(elapsed);
  const alternate = amortize({
    amount: mode === 'rate' ? inputs.amount : cents(inputs.price - inputs.downPayment),
    rate: inputs.comparisonRate,
    months: (mode === 'rate' ? inputs.comparisonYears ?? inputs.years : inputs.newYears) * 12,
  });
  const start = monthIndex(mode === 'rate' ? inputs.start : today);
  const horizon = Math.max(current.length, alternate.length, 1);
  const homeValue = inputs.homeValue ?? inputs.amount / HOUSING_ASSUMPTIONS.assumedLoanToValue;
  const currentCosts = estimateHousingCosts(homeValue, includeHousingCosts, inputs.annualInsurance);
  const alternateCosts = estimateHousingCosts(mode === 'rate' ? homeValue : inputs.price, includeHousingCosts, mode === 'rate' ? inputs.annualInsurance : inputs.newAnnualInsurance);
  const total = (rows: Payment[], key: 'interest' | 'total') => cents(rows.reduce((sum, p) => sum + p[key], 0));
  return {
    original, current, alternate, elapsed, start, horizon, currentCosts, alternateCosts, includeHousingCosts,
    currentInterest: total(current, 'interest'), alternateInterest: total(alternate, 'interest'),
    currentTotal: cents(total(current, 'total') + currentCosts.total * horizon),
    alternateTotal: cents(total(alternate, 'total') + alternateCosts.total * horizon),
  };
}
export type Comparison = ReturnType<typeof compare>;
export function paymentAt(data: Comparison, loan: 'current' | 'alternate', month: number) {
  const payment = data[loan][month] || zeroPayment;
  const costs = loan === 'current' ? data.currentCosts : data.alternateCosts;
  return { ...payment, mortgagePayment: payment.total, taxes: costs.taxes, insurance: costs.insurance, total: cents(payment.total + costs.total) };
}
export type HousingPayment = ReturnType<typeof paymentAt>;
export const money = (n: number, digits = 0) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
export const compactMoney = (n: number) => '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
