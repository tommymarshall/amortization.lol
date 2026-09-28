# amortization.lol

An account-free mortgage comparison app built with React, TypeScript, Vite, and Three.js. All calculations run in the browser.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` generates a static deployment in `dist/`; `npm run preview` serves that build. Deploy `dist/` to any static web host. No database, server secrets, or backend are required.

## Features

- Editable original loan amount, interest rate, term, and first-payment month.
- **Different rate:** holds original principal and start month constant, with an independent alternative rate and term. A blank alternative term matches the original term.
- **Buy today:** compares the existing loan's remaining schedule with a new home price, down payment, rate, and term. New loan payments begin in the current month.
- Light Three.js chart with animated balance/payment/interest curves, a highlighted gap, and shared monthly scrubbing. A connected callout shows the net total interest difference. An SVG fallback works without WebGL.
- Principal and interest breakdowns, remaining balances, total interest, and payoff dates.
- Optional estimated property taxes and homeowners insurance, reflected in payment totals, charts, breakdowns, and CSV exports.
- Optional browser-local persistence and a downloadable monthly CSV.
- “Send this to your spouse” opens an editable message with monthly payments, actual first-year payment differences, interest totals and payoff dates. Native sharing is available on supported devices; copying the message and link works elsewhere, with manual selection if clipboard access is unavailable. No messages are sent automatically.
- Shared links restore the comparison inputs, mode, housing-cost settings and calculation month. Inputs live in the URL fragment, not a server database; anyone given the link can read them. Opening a shared comparison does not overwrite locally saved inputs unless the recipient opts in to saving it.
- Responsive layout, native keyboard controls, reduced-motion support, and calculation details.

## Calculation assumptions

US fixed-rate monthly amortization; use the note interest rate, not APR. Payments and interest round to cents, with a final payoff adjustment. Existing payments before the comparison month are assumed paid as scheduled. Current-month payments are not yet counted. Original and comparison rates stay fixed.

The taxes/insurance checkbox defaults off. When enabled, annual property taxes are estimated at **0.9% of home value**, using [ATTOM's 2025 US effective rate](https://www.attomdata.com/news/market-trends/home-sales-prices/2025-annual-tax-report/). Annual homeowners insurance defaults to an editable **$1,800/year ($150/month)** planning allowance. Users can enter separate annual premiums for their current and next home; different-rate scenarios use the same current premium. Blank values use the default and zero is accepted. Insurance is not multiplied by property market value. The default is not a current Virginia average or quote; for historical context, [NAIC reported $1,537/year for Virginia HO-3 policies in 2023](https://content.naic.org/sites/default/files/publication-hmr-zu-homeowners-report.pdf#page=128). Annual taxes and premiums are divided by 12 and rounded to cents. Current home value defaults to the original loan / 0.8 (assuming 20% down), with an optional value override. Different-rate scenarios use the same property value; a new purchase uses its full price. These flat estimates apply across the timeline, including after loan payoff; they do not reconstruct historic bills or predict inflation. No external services are called to calculate them.

PMI, HOA, extra payments, missed payments, selling/closing costs, refinancing, and appreciation are excluded. The new down payment is entered directly, without estimating sale proceeds. This compares housing cash flows, not total moving costs or investment returns.

The chart shows balances **before** each month's payment. After a loan is paid off, its principal, interest, and balance are zero through the shared comparison horizon. Enabled tax and insurance estimates continue. In the payment chart, the top curve includes those costs; the principal band remains accurate and dashed baselines identify the ongoing costs. Loan amortization, payoff dates, and total interest never change when toggling these estimates.

The interest view excludes principal and housing costs. Its monthly differences sum to the interest callout: alternative interest minus current interest, across both full terms in the rate comparison or remaining schedules from today in the purchase comparison. Crossing curves contribute positive and negative differences; the callout reports the net, not the absolute area. In balance/payment views the highlighted gap compares those plotted values, while the callout still reports interest calculated from the amortization schedules. Scrubbing does not change this full-horizon total.

Google Fonts serves Instrument Sans and Instrument Serif; the page falls back to system fonts if unavailable. Financial inputs are never sent to a server. Persistence is opt-in.

## Verification

```sh
npm test
npm run build
```

Tests cover reference payments, zero interest, cent rounding, principal conservation, date boundaries, same-rate equality, paid-off loans, and the alignment of existing/new loan schedules.

The earlier interaction study is preserved in `output/`; the web app lives in `src/`.
