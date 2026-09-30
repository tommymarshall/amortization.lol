import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Share2,
  X,
} from "lucide-react";
import MortgageChart from "./MortgageChart";
import {
  compare,
  compactMoney,
  currentMonth,
  formatMonth,
  HOUSING_ASSUMPTIONS,
  money,
  monthIndex,
  monthString,
  paymentAt,
  validate,
  zeroPayment,
  type ChartView,
  type Comparison,
  type HousingPayment,
  type Mode,
} from "./mortgage";

import ShareDialog from "./ShareDialog";
import {
  comparisonLink,
  comparisonMessage,
  initial,
  keys,
  optionalKeys,
  parse,
  readComparisonLink,
  type Draft,
  type SharedComparison,
} from "./sharing";

const STORAGE = "parallel-mortgage-v1";
const compactLoanAmount = (amount: number) =>
  compactMoney(amount).replace(/[KMB]$/, (unit) => unit.toLowerCase());

function load(): {
  draft: Draft;
  mode: Mode;
  remember: boolean;
  includeHousingCosts: boolean;
  shared?: SharedComparison;
  invalidShare?: boolean;
} {
  const shared = readComparisonLink(window.location.hash);
  if (shared) return { ...shared, remember: false, shared };
  if (new URLSearchParams(window.location.hash.slice(1)).has("comparison"))
    return {
      draft: initial,
      mode: "purchase",
      remember: false,
      includeHousingCosts: false,
      invalidShare: true,
    };
  try {
    const item = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (
      item?.version === 1 &&
      keys.every(
        (key) =>
          optionalKeys.includes(key) || typeof item.draft?.[key] === "string",
      )
    )
      return {
        draft: Object.fromEntries(
          keys.map((key) => [
            key,
            typeof item.draft[key] === "string"
              ? item.draft[key]
              : initial[key],
          ]),
        ) as Draft,
        mode: item.mode === "purchase" ? "purchase" : "rate",
        remember: true,
        includeHousingCosts: item.includeHousingCosts === true,
      };
  } catch {
    /* Storage is optional. */
  }
  return {
    draft: initial,
    mode: "purchase",
    remember: false,
    includeHousingCosts: false,
  };
}

function Field({
  name,
  label,
  value,
  onChange,
  error,
  prefix,
  suffix,
  type = "text",
  hint,
  placeholder,
}: {
  name: keyof Draft;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  prefix?: string;
  suffix?: string;
  type?: string;
  hint?: ReactNode;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const numeric = Number(value.replaceAll(",", ""));
  const display =
    prefix === "$" && !editing && value.trim() && Number.isFinite(numeric)
      ? numeric.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : value;
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <label htmlFor={name}>
        {label}
        {hint && <span>{hint}</span>}
      </label>
      <div className="input-shell">
        {prefix && <span className="input-affix">{prefix}</span>}
        <input
          id={name}
          name={name}
          type={type}
          inputMode={type === "text" ? "decimal" : undefined}
          value={display}
          placeholder={placeholder}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : undefined}
          autoComplete="off"
          min={type === "month" ? "1900-01" : undefined}
          max={type === "month" ? "2100-12" : undefined}
        />
        {suffix && <span className="input-affix suffix">{suffix}</span>}
      </div>
      {error && (
        <p className="field-message" id={`${name}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function RateField({ max, ...props }: React.ComponentProps<typeof Field> & { max: number }) {
  const numeric = Number(props.value.replaceAll(",", ""));
  const value = Number.isFinite(numeric) ? Math.min(max, Math.max(0, numeric)) : 0;
  return (
    <div className="rate-field">
      <Field {...props} />
      <div className="rate-slider">
        <input
          aria-label={props.name === "rate" ? "Current interest rate" : "Comparison interest rate"}
          type="range"
          min="0"
          max={max}
          step="0.05"
          value={value}
          onChange={(e) => props.onChange(e.target.value)}
          style={{ "--fill": `${value / max * 100}%` } as React.CSSProperties}
        />
        <div className="range-labels"><span>0%</span><span>{max}%</span></div>
      </div>
    </div>
  );
}

function PaymentCard({
  kind,
  title,
  rate,
  payment,
  maxPayment,
  index,
  totalCount,
  includeHousingCosts,
}: {
  kind: "current" | "alternate";
  title: string;
  rate: number;
  payment: HousingPayment;
  maxPayment: number;
  index: number;
  totalCount: number;
  includeHousingCosts: boolean;
}) {
  const paidOff = !payment.mortgagePayment;
  return (
    <section
      className={`payment-card ${kind}`}
      aria-label={`${title} payment details`}
    >
      <div className="payment-card-title">
        <h3>
          <i className="loan-dot" />
          {title}
        </h3>
        <span className="rate-tag">{rate.toFixed(2)}%</span>
      </div>
      <div className="payment-number">
        {money(payment.total)}
        <span>/ month</span>
      </div>
      <div className="payment-progress-label">
        <span>
          {paidOff ? (
            <>
              <Check size={12} /> Paid off
            </>
          ) : (
            `Payment ${payment.number} of ${totalCount}`
          )}
        </span>
        <span>
          {paidOff
            ? includeHousingCosts
              ? "Taxes & insurance"
              : "100%"
            : `${Math.round((payment.principal / payment.total) * 100)}% principal`}
        </span>
      </div>
      <div className="payment-track" aria-hidden="true">
        <div
          className="payment-bar"
          style={{
            width: `${maxPayment ? (payment.total / maxPayment) * 100 : 0}%`,
          }}
        >
          <div
            className="principal-fill"
            style={{
              width: `${payment.total ? (payment.principal / payment.total) * 100 : 0}%`,
            }}
          />
          <div
            className="interest-fill"
            style={{
              width: `${payment.total ? (payment.interest / payment.total) * 100 : 0}%`,
            }}
          />
          {includeHousingCosts && (
            <>
              <div
                className="tax-fill"
                style={{
                  width: `${payment.total ? (payment.taxes / payment.total) * 100 : 0}%`,
                }}
              />
              <div
                className="insurance-fill"
                style={{
                  width: `${payment.total ? (payment.insurance / payment.total) * 100 : 0}%`,
                }}
              />
            </>
          )}
        </div>
      </div>
      <div className="payment-components">
        <div>
          <span>
            <i className="key principal-key" />
            Principal
          </span>
          <strong>{money(payment.principal, 2)}</strong>
        </div>
        <div>
          <span>
            <i className="key interest-key" />
            Interest
          </span>
          <strong>{money(payment.interest, 2)}</strong>
        </div>
      </div>
      {includeHousingCosts && (
        <div className="payment-components housing-components">
          <div>
            <span>
              <i className="key tax-key" />
              Property taxes
            </span>
            <strong>{money(payment.taxes, 2)}</strong>
          </div>
          <div>
            <span>
              <i className="key insurance-key" />
              Home insurance
            </span>
            <strong>{money(payment.insurance, 2)}</strong>
          </div>
        </div>
      )}
      <div className="remaining-row">
        <span>Balance before payment</span>
        <strong>{money(payment.openingBalance)}</strong>
      </div>
      <span className="sr-only">Selected comparison month {index + 1}.</span>
    </section>
  );
}

function downloadComparison(data: Comparison, mode: Mode) {
  const rows = [
    [
      "Month",
      "Current monthly total",
      "Current principal",
      "Current interest",
      "Current property tax estimate",
      "Current insurance estimate",
      "Current closing balance",
      "Comparison monthly total",
      "Comparison principal",
      "Comparison interest",
      "Comparison property tax estimate",
      "Comparison insurance estimate",
      "Comparison closing balance",
    ],
  ];
  for (let i = 0; i < data.horizon; i++) {
    const a = paymentAt(data, "current", i),
      b = paymentAt(data, "alternate", i);
    rows.push([
      monthString(data.start + i),
      ...[
        a.total,
        a.principal,
        a.interest,
        a.taxes,
        a.insurance,
        a.balance,
        b.total,
        b.principal,
        b.interest,
        b.taxes,
        b.insurance,
        b.balance,
      ].map((n) => n.toFixed(2)),
    ]);
  }
  const blob = new Blob([rows.map((row) => row.join(",")).join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `amortization-lol-${mode}-comparison.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [saved] = useState(load);
  const [draft, setDraft] = useState<Draft>(saved.draft);
  const [mode, setMode] = useState<Mode>(saved.mode);
  const [remember, setRemember] = useState(saved.remember);
  const [includeHousingCosts, setIncludeHousingCosts] = useState(
    saved.includeHousingCosts,
  );
  const [view, setView] = useState<ChartView>("balance");
  const [selected, setSelected] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [sharedAsOf, setSharedAsOf] = useState<string | null>(
    saved.shared?.asOf ?? null,
  );
  const [invalidShare, setInvalidShare] = useState(saved.invalidShare ?? false);
  const [sharing, setSharing] = useState<{
    message: string;
    url: string;
  } | null>(null);
  const storageTouched = useRef(!saved.shared && !saved.invalidShare);
  const dialog = useRef<HTMLDialogElement>(null);
  const today = sharedAsOf ?? currentMonth();
  const timeLabel = sharedAsOf ? "As shared" : "Today";
  const inputs = useMemo(() => parse(draft), [draft]);
  const errors = useMemo(
    () => validate(inputs, mode, today, includeHousingCosts),
    [inputs, mode, today, includeHousingCosts],
  );
  const data = useMemo(
    () =>
      Object.keys(errors).length
        ? null
        : compare(inputs, mode, today, includeHousingCosts),
    [inputs, mode, today, errors, includeHousingCosts],
  );
  const month = data
    ? Math.max(
        0,
        Math.min(
          selected ?? (mode === "rate" ? data.elapsed : 0),
          data.horizon - 1,
        ),
      )
    : 0;
  const emptyHousingPayment = {
    ...zeroPayment,
    mortgagePayment: 0,
    taxes: 0,
    insurance: 0,
  };
  const current = data
    ? paymentAt(data, "current", month)
    : emptyHousingPayment;
  const alternate = data
    ? paymentAt(data, "alternate", month)
    : emptyHousingPayment;
  const initialDifference = data
    ? paymentAt(data, "alternate", 0).total -
      paymentAt(data, "current", 0).total
    : 0;
  const monthDifference = alternate.total - current.total;
  const alternateTitle = mode === "rate" ? "Alternative" : "New home";
  const rateMax = Math.max(
    12,
    Number.isFinite(inputs.comparisonRate)
      ? Math.ceil(inputs.comparisonRate / 5) * 5
      : 12,
    Number.isFinite(inputs.rate) ? Math.ceil(inputs.rate / 5) * 5 : 12,
  );
  const interestDifference = data
    ? data.alternateInterest - data.currentInterest
    : 0;
  const f = (name: keyof Draft) => ({
    name,
    value: draft[name],
    onChange: (value: string) => setDraft((d) => ({ ...d, [name]: value })),
    error: errors[name],
  });

  useEffect(() => {
    if (!storageTouched.current) return;
    try {
      if (remember)
        localStorage.setItem(
          STORAGE,
          JSON.stringify({ version: 1, draft, mode, includeHousingCosts }),
        );
      else localStorage.removeItem(STORAGE);
      setSaveError(false);
    } catch {
      setSaveError(remember);
    }
  }, [remember, draft, mode, includeHousingCosts]);
  useEffect(() => {
    if (helpOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [helpOpen]);
  function changeMode(next: Mode) {
    setMode(next);
    setSelected(null);
  }
  function reset() {
    setDraft(initial);
    setSelected(null);
    setMode("purchase");
    setView("balance");
    setIncludeHousingCosts(false);
    setSharedAsOf(null);
    setInvalidShare(false);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
  function openSharing() {
    const scenario: SharedComparison = {
      draft: { ...draft },
      mode,
      includeHousingCosts,
      asOf: today,
    };
    setSharing({
      message: comparisonMessage(scenario),
      url: comparisonLink(scenario, window.location.href),
    });
  }
  useEffect(() => {
    function restoreShared() {
      const scenario = readComparisonLink(window.location.hash);
      if (!scenario) {
        setInvalidShare(
          new URLSearchParams(window.location.hash.slice(1)).has("comparison"),
        );
        return;
      }
      storageTouched.current = false;
      setDraft(scenario.draft);
      setMode(scenario.mode);
      setIncludeHousingCosts(scenario.includeHousingCosts);
      setSharedAsOf(scenario.asOf);
      setRemember(false);
      setSelected(null);
      setSharing(null);
      setInvalidShare(false);
    }
    window.addEventListener("hashchange", restoreShared);
    return () => window.removeEventListener("hashchange", restoreShared);
  }, []);
  const differenceWord =
    Math.abs(initialDifference) < 0.005
      ? "the same"
      : initialDifference > 0
        ? "more"
        : "less";

  return (
    <div className="app">
      <main>
        <div className="page-heading">
          <h1>amortization.lol</h1>
          <p>This is why you'll never leave your house</p>
        </div>
        {sharedAsOf && (
          <p className="shared-notice">
            Shared comparison · {formatMonth(monthIndex(sharedAsOf))}. Figures
            use this comparison month.
          </p>
        )}
        {invalidShare && (
          <p className="shared-notice" role="status">
            This comparison link couldn’t be read. Check the inputs before
            sharing again.
          </p>
        )}
        <div className="content-card">
          <div className="comparison-toolbar">
            <div className="mode-switch" aria-label="Comparison mode">
            <button
              aria-pressed={mode === "purchase"}
              onClick={() => changeMode("purchase")}
            >
              Buy today
            </button>
            <button
              aria-pressed={mode === "rate"}
              onClick={() => changeMode("rate")}
            >
              Compare rates
            </button>
            </div>
            <div className="header-actions">
              <button className="text-button" onClick={reset}>
                <RotateCcw size={14} />
                Reset
              </button>
              <button className="text-button" onClick={() => setHelpOpen(true)}>
                Assumptions
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
          <div className="workspace">
            <aside className="inputs-panel" aria-label="Mortgage inputs">
              <section className="input-section">
                <h2>Current loan</h2>
                <Field {...f("amount")} label="Original amount" prefix="$" />
                <Field {...f("start")} label="First payment" type="month" />
                <div className="field-pair">
                  <RateField {...f("rate")} label="Interest rate" suffix="%" max={rateMax} />
                  <Field {...f("years")} label="Term" suffix="years" />
                </div>
              </section>
              <section className="input-section comparison-fields">
                <h2>{mode === "rate" ? "Alternative loan" : "New home"}</h2>
                {mode === "purchase" && (
                  <>
                    <Field {...f("price")} label="Purchase price" prefix="$" />
                    <Field
                      {...f("downPayment")}
                      label="Down payment"
                      prefix="$"
                      hint={
                        Number.isFinite(inputs.downPayment / inputs.price)
                          ? `${((inputs.downPayment / inputs.price) * 100).toFixed(0)}% · ${inputs.price > inputs.downPayment ? `${compactLoanAmount(inputs.price - inputs.downPayment)} loan` : "—"}`
                          : undefined
                      }
                    />
                  </>
                )}
                <RateField
                  {...f("comparisonRate")}
                  label="Interest rate"
                  suffix="%"
                  max={rateMax}
                />
                <Field
                  {...f(mode === "rate" ? "comparisonYears" : "newYears")}
                  label="Term"
                  suffix="years"
                  placeholder={mode === "rate" ? draft.years : undefined}
                  hint={
                    mode === "rate" && !draft.comparisonYears.trim()
                      ? "Same as current"
                      : undefined
                  }
                />
              </section>
              <section
                className="housing-controls"
                aria-label="Additional housing costs"
              >
                <label className="housing-toggle">
                  <input
                    type="checkbox"
                    checked={includeHousingCosts}
                    onChange={(e) => setIncludeHousingCosts(e.target.checked)}
                    aria-describedby={
                      includeHousingCosts ? "housing-assumptions" : undefined
                    }
                  />
                  <span>Include taxes &amp; insurance</span>
                </label>
                {includeHousingCosts && (
                  <>
                    <p id="housing-assumptions" className="input-note">
                      {(HOUSING_ASSUMPTIONS.propertyTaxRate * 100).toFixed(1)}%
                      annual tax ·{" "}
                      {money(HOUSING_ASSUMPTIONS.annualInsurance / 12)}/mo
                      insurance default
                    </p>
                    <div className="housing-value">
                      <Field
                        {...f("homeValue")}
                        label="Current home value"
                        prefix="$"
                        hint="Optional"
                        placeholder={
                          Number.isFinite(inputs.amount)
                            ? (
                                inputs.amount /
                                HOUSING_ASSUMPTIONS.assumedLoanToValue
                              ).toLocaleString("en-US", {
                                maximumFractionDigits: 0,
                              })
                            : "Auto estimate"
                        }
                      />
                      <p className="input-note">
                        Auto estimate assumes 20% down.
                      </p>
                      <Field
                        {...f("annualInsurance")}
                        label="Current insurance"
                        prefix="$"
                        suffix="/ year"
                        hint="Optional"
                        placeholder={HOUSING_ASSUMPTIONS.annualInsurance.toLocaleString(
                          "en-US",
                        )}
                      />
                      {mode === "purchase" && (
                        <Field
                          {...f("newAnnualInsurance")}
                          label="New home insurance"
                          prefix="$"
                          suffix="/ year"
                          hint="Optional"
                          placeholder={HOUSING_ASSUMPTIONS.annualInsurance.toLocaleString(
                            "en-US",
                          )}
                        />
                      )}
                    </div>
                  </>
                )}
              </section>
              <label className="remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => {
                    storageTouched.current = true;
                    setRemember(e.target.checked);
                  }}
                />
                <span>Save on this device</span>
              </label>
              {saveError && (
                <p className="field-message">Couldn’t save your inputs.</p>
              )}
            </aside>
            <div className="results-panel">
              {!data ? (
                <div className="empty-state" role="status">
                  <h2>Check your inputs.</h2>
                  <p>Correct the highlighted fields.</p>
                </div>
              ) : (
                <>
                  <section
                    className="comparison-figure"
                    aria-label="Mortgage visualization"
                  >
                    <div className="result-headline">
                      <div className="result-headline-top">
                        <span className="figure-label">
                          Starting monthly difference
                        </span>
                        <button
                          className="primary-button share-button"
                          onClick={openSharing}
                        >
                          <Share2 size={15} />
                          Share with spouse
                        </button>
                      </div>
                      <h2>
                        {Math.abs(initialDifference) < 0.005 ? (
                          <>Same payment</>
                        ) : (
                          <>
                            <span>{money(Math.abs(initialDifference))}</span>{" "}
                            <em>{differenceWord}</em>
                            <span className="per-month"> / mo</span>
                          </>
                        )}
                      </h2>
                    </div>
                    <div className="chart-section">
                      <div className="chart-toolbar">
                        <div className="chart-tabs" aria-label="Graph view">
                          <button
                            aria-pressed={view === "balance"}
                            onClick={() => setView("balance")}
                          >
                            Balance
                          </button>
                          <button
                            aria-pressed={view === "payment"}
                            onClick={() => setView("payment")}
                          >
                            Payments
                          </button>
                          <button
                            aria-pressed={view === "interest"}
                            onClick={() => setView("interest")}
                          >
                            Interest
                          </button>
                        </div>
                        <span className="chart-unit">USD</span>
                      </div>
                      <div className="chart-legend">
                        <span>
                          <i className="legend-line current-line" />
                          Current · {inputs.rate}% · {inputs.years}y
                        </span>
                        <span>
                          <i className="legend-line alternate-line" />
                          {alternateTitle} · {inputs.comparisonRate}% ·{" "}
                          {mode === "rate"
                            ? (inputs.comparisonYears ?? inputs.years)
                            : inputs.newYears}
                          y
                        </span>
                      </div>
                      <p className="chart-cost-note">
                        {view === "balance"
                          ? "Shaded gap: remaining balance difference"
                          : view === "interest"
                            ? "Shaded gap: monthly interest difference"
                            : `Lower curves: interest${includeHousingCosts ? " + taxes & insurance" : ""} · Bands: principal`}
                      </p>
                      <MortgageChart
                        data={data}
                        view={view}
                        selected={month}
                        onSelect={setSelected}
                        today={monthIndex(today)}
                        mode={mode}
                      />
                      <div className="timeline">
                        <div className="timeline-head">
                          <div className="selected-date">
                            <strong>
                              {formatMonth(data.start + month, true)}
                            </strong>
                            <span>
                              {mode === "rate"
                                ? `Year ${Math.floor(month / 12) + 1}`
                                : month === 0
                                  ? timeLabel
                                  : `+${Math.floor(month / 12)}y ${month % 12}m`}
                            </span>
                          </div>
                          <div className="timeline-actions">
                            <button
                              onClick={() =>
                                setSelected(
                                  mode === "rate"
                                    ? Math.min(data.elapsed, data.horizon - 1)
                                    : 0,
                                )
                              }
                              className="today-button"
                            >
                              {timeLabel}
                            </button>
                            <button
                              className="icon-button"
                              aria-label="Previous month"
                              disabled={month === 0}
                              onClick={() => setSelected(month - 1)}
                            >
                              <ChevronLeft size={18} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label="Next month"
                              disabled={month >= data.horizon - 1}
                              onClick={() => setSelected(month + 1)}
                            >
                              <ChevronRight size={18} />
                            </button>
                          </div>
                        </div>
                        <input
                          className="time-range"
                          aria-label="Explore monthly payments"
                          aria-valuetext={formatMonth(data.start + month)}
                          type="range"
                          min="0"
                          max={data.horizon - 1}
                          step="1"
                          value={month}
                          onChange={(e) => setSelected(Number(e.target.value))}
                          style={
                            {
                              "--fill": `${(month / Math.max(data.horizon - 1, 1)) * 100}%`,
                            } as React.CSSProperties
                          }
                        />
                      </div>
                    </div>
                  </section>
                  <section
                    className="breakdown"
                    aria-labelledby="breakdown-title"
                  >
                    <div className="breakdown-header">
                      <h2 id="breakdown-title">Monthly breakdown</h2>
                      <span>{formatMonth(data.start + month, true)}</span>
                    </div>
                    {includeHousingCosts && (
                      <p className="breakdown-note">
                        Includes estimated taxes &amp; insurance.
                      </p>
                    )}
                    <div className="payment-cards">
                      <PaymentCard
                        kind="current"
                        title="Current"
                        rate={inputs.rate}
                        payment={current}
                        maxPayment={Math.max(current.total, alternate.total)}
                        index={month}
                        includeHousingCosts={includeHousingCosts}
                        totalCount={data.original.length}
                      />
                      <PaymentCard
                        kind="alternate"
                        title={alternateTitle}
                        rate={inputs.comparisonRate}
                        payment={alternate}
                        maxPayment={Math.max(current.total, alternate.total)}
                        index={month}
                        includeHousingCosts={includeHousingCosts}
                        totalCount={data.alternate.length}
                      />
                      <div
                        className={`payment-difference ${Math.abs(monthDifference) < 0.005 ? "same-cost" : monthDifference > 0 ? "alternate-costs-more" : "current-costs-more"}`}
                        role="status"
                        aria-label={
                          Math.abs(monthDifference) < 0.005
                            ? "The monthly payments are the same."
                            : `${monthDifference > 0 ? alternateTitle : "Current loan"} costs more this month.`
                        }
                      >
                        <span>Difference</span>
                        <strong>
                          {Math.abs(monthDifference) < 0.005
                            ? "$0"
                            : `${money(Math.abs(monthDifference))} ${monthDifference > 0 ? "more" : "less"}`}
                        </strong>
                      </div>
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
          {data && (
            <section className="big-picture" aria-labelledby="totals-title">
              <div className="big-picture-heading">
                <h2 id="totals-title">Loan totals</h2>
                <span>
                  {mode === "rate"
                    ? "Full loan term"
                    : sharedAsOf
                      ? `From ${formatMonth(monthIndex(sharedAsOf), true)}`
                      : "From today"}
                </span>
              </div>
              <div className="interest-summary">
                <h3>Total interest</h3>
                <div>
                  <span>Current</span>
                  <strong>{money(data.currentInterest)}</strong>
                </div>
                <div>
                  <span>{alternateTitle}</span>
                  <strong>{money(data.alternateInterest)}</strong>
                </div>
                <p>
                  {Math.abs(interestDifference) < 0.005 ? (
                    "$0 difference"
                  ) : (
                    <>
                      <strong>{money(Math.abs(interestDifference))}</strong>{" "}
                      {interestDifference > 0 ? "more" : "less"}
                    </>
                  )}
                </p>
              </div>
              <div className="payoff-summary">
                <h3>Paid off by</h3>
                <div>
                  <span>Current</span>
                  <strong>
                    {data.current.length
                      ? formatMonth(data.start + data.current.length - 1, true)
                      : "Paid off"}
                  </strong>
                </div>
                <div>
                  <span>{alternateTitle}</span>
                  <strong>
                    {formatMonth(data.start + data.alternate.length - 1, true)}
                  </strong>
                </div>
                <button
                  className="text-button"
                  onClick={() => downloadComparison(data, mode)}
                >
                  <Download size={14} />
                  Export CSV
                </button>
              </div>
            </section>
          )}
        </div>
        <footer>
          <span>US fixed-rate mortgages</span>
          <span>Calculated in your browser</span>
          <span>
            Created by{" "}
            <a
              href="https://x.com/tommyjmarshall"
              target="_blank"
              rel="noreferrer"
            >
              @tommyjmarshall
            </a>
          </span>
        </footer>
      </main>
      {sharing && <ShareDialog {...sharing} onClose={() => setSharing(null)} />}
      <dialog
        ref={dialog}
        aria-labelledby="assumptions-title"
        onCancel={() => setHelpOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) setHelpOpen(false);
        }}
      >
        <div className="dialog-content">
          <button
            className="icon-button dialog-close"
            onClick={() => setHelpOpen(false)}
            aria-label="Close calculation details"
          >
            <X size={22} />
          </button>
          <h2 id="assumptions-title">Assumptions</h2>
          <h3>Mortgage</h3>
          <p>
            Fixed-rate US loans with monthly payments. Use the original loan
            amount, note interest rate (not APR), term, and first-payment month.
            Payments round to cents; the final payment clears the balance.
          </p>
          <p>
            “Compare rates” keeps the original amount and start month, with an
            independent alternative rate and term. A blank alternative term
            matches the current loan. “Buy today” compares your remaining loan
            with a new loan starting this month. Earlier scheduled payments are
            assumed paid. Extra payments, missed payments, refinancing, PMI,
            HOA, closing and selling costs, and appreciation are excluded.
          </p>
          <h3>Taxes &amp; insurance</h3>
          <p>
            Optional annual property tax:{" "}
            {(HOUSING_ASSUMPTIONS.propertyTaxRate * 100).toFixed(1)}% of home
            value, based on{" "}
            <a
              href="https://www.attomdata.com/news/market-trends/home-sales-prices/2025-annual-tax-report/"
              target="_blank"
              rel="noreferrer"
            >
              ATTOM’s 2025 national effective rate
            </a>
            . Home value defaults to the original loan ÷ 80%; a new home uses
            its purchase price.
          </p>
          <p>
            Blank insurance premiums use{" "}
            {money(HOUSING_ASSUMPTIONS.annualInsurance)}/year (
            {money(HOUSING_ASSUMPTIONS.annualInsurance / 12)}/month). This is a
            planning allowance, not a current average or quote. For context,{" "}
            <a
              href="https://content.naic.org/sites/default/files/publication-hmr-zu-homeowners-report.pdf#page=128"
              target="_blank"
              rel="noreferrer"
            >
              Virginia’s average HO-3 premium was $1,537 in 2023
            </a>
            .
          </p>
          <p>
            Both rate scenarios use the same home value and premium. Estimates
            stay flat and continue after loan payoff. They do not recreate
            historical bills.
          </p>
          <h3>Reading the graph</h3>
          <p>
            Balances are shown before each payment. In the payment view, the top
            curve is the monthly total; the band beneath it is principal. The
            lower curve is interest plus included taxes and insurance. Dashed
            baselines show tax and insurance costs. The interest view shows only
            monthly interest.
          </p>
          <p>
            The highlighted gap compares the two plotted values. The interest
            callout sums scheduled interest for each loan, then subtracts
            current from alternative. It covers both full terms in “Compare
            rates,” or remaining payments from today in “Buy today.” It excludes
            principal, taxes and insurance, and stays fixed as you scrub. When
            curves cross, the total is the net difference.
          </p>
          <h3>Saved inputs</h3>
          <p>
            “Save on this device” stores inputs in this browser. Uncheck it to
            remove them. Sharing includes a link containing the comparison
            inputs and month so your recipient sees the same numbers. Shared
            inputs replace the view without changing saved inputs unless you
            choose to save them.
          </p>
          <button className="primary-button" onClick={() => setHelpOpen(false)}>
            Close
            <Check size={15} />
          </button>
        </div>
      </dialog>
    </div>
  );
}
