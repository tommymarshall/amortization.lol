import { zeroPayment, type ChartView, type Comparison } from './mortgage';

/** Plot values in dollars. Interest stays separate from optional housing costs. */
export function chartValue(data: Comparison, view: ChartView, loan: 'current' | 'alternate', month: number, inner = false) {
  const rows = data[loan];
  const index = Math.floor(month), fraction = month - index;
  const a = rows[index] || zeroPayment, b = rows[index + 1] || zeroPayment;
  const costs = loan === 'current' ? data.currentCosts : data.alternateCosts;
  if (view === 'payment' && !inner) return a.total + costs.total;
  const key = view === 'balance' ? 'openingBalance' : 'interest';
  return a[key] + (b[key] - a[key]) * fraction + (view === 'payment' ? costs.total : 0);
}
