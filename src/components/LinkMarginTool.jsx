import { useMemo, useState } from "react";
import { useI18n } from "../i18n/index.js";

const POWER_OPTIONS = [10, 20, 24, 27, 30, 33, 37, 40];

const DEFAULTS = {
  txPowerA: 27,
  gainA: 2,
  lossA: 1,
  heightA: 3,
  divA: 2,
  txPowerB: 27,
  gainB: 2,
  lossB: 1,
  heightB: 3,
  divB: 2,
  frequency: 2450,
  rxSensitivity: -98,
  fadeMargin: 15,
  desiredRange: 2,
};

const ENVIRONMENTS = [
  { id: "rural", label: "Rural", sublabel: "Open", exponent: 2.0 },
  { id: "suburban", label: "Suburban", sublabel: "Mixed", exponent: 2.9 },
  { id: "urban", label: "Urban", sublabel: "Dense", exponent: 3.5 },
  { id: "maritime", label: "Maritime", sublabel: "Sea", exponent: 2.3 },
];

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dbmToWatts(dbm) {
  return 10 ** ((Number(dbm) - 30) / 10);
}

function formatPower(dbm) {
  const watts = dbmToWatts(dbm);
  const mw = watts * 1000;
  if (watts >= 1) {
    return `~ ${mw.toLocaleString(undefined, { maximumFractionDigits: 0 })} mW (${watts.toFixed(watts < 10 ? 1 : 0)} W)`;
  }
  return `~ ${mw.toFixed(mw < 10 ? 1 : 0)} mW (${watts.toFixed(2)} W)`;
}

function diversityGain(count) {
  return (Math.max(1, Math.round(numberValue(count, 1))) - 1) * 3;
}

function mapl({
  txPower,
  txGain,
  txLoss,
  rxGain,
  rxLoss,
  rxDiversity,
  fadeMargin,
  rxSensitivity,
}) {
  return (
    numberValue(txPower) +
    numberValue(txGain) -
    numberValue(txLoss) +
    numberValue(rxGain) -
    numberValue(rxLoss) +
    diversityGain(rxDiversity) -
    numberValue(fadeMargin) -
    numberValue(rxSensitivity)
  );
}

function rangeKmFromMapl(maplValue, frequencyMhz, exponent) {
  const frequency = Math.max(1, numberValue(frequencyMhz, 1));
  const denominator = 10 * exponent;
  return 10 ** ((maplValue - 32.45 - 20 * Math.log10(frequency)) / denominator);
}

function maplRequired(distanceKm, frequencyMhz, exponent) {
  const distance = Math.max(0.001, numberValue(distanceKm, 0.001));
  const frequency = Math.max(1, numberValue(frequencyMhz, 1));
  return 32.45 + 20 * Math.log10(frequency) + 10 * exponent * Math.log10(distance);
}

function formatKm(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 m";
  if (value < 0.1) return `${(value * 1000).toFixed(0)} m`;
  if (value < 1) return `${(value * 1000).toFixed(1)} m`;
  if (value < 10) return `${value.toFixed(2)} km`;
  return `${value.toFixed(1)} km`;
}

function formatDb(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dB` : "--";
}

function formatSignedDb(value) {
  const number = numberValue(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(1)} dB`;
}

function budgetRows(direction, values, t) {
  return [
    { label: t("linkMargin.budget.txPower", "{direction} Tx Power", { direction }), value: formatSignedDb(values.txPower) },
    { label: t("linkMargin.budget.txAntennaGain", "Tx Antenna Gain"), value: formatSignedDb(values.txGain) },
    { label: t("linkMargin.budget.txCableLoss", "Tx Cable Loss"), value: `-${numberValue(values.txLoss).toFixed(1)} dB` },
    { label: t("linkMargin.budget.rxAntennaGain", "Rx Antenna Gain"), value: formatSignedDb(values.rxGain) },
    { label: t("linkMargin.budget.rxCableLoss", "Rx Cable Loss"), value: `-${numberValue(values.rxLoss).toFixed(1)} dB` },
    { label: t("linkMargin.budget.rxDiversityGain", "Rx Diversity Gain"), value: formatSignedDb(values.rxDiversityGain) },
    { label: t("linkMargin.budget.rxSensitivity", "Rx Sensitivity"), value: `${numberValue(values.rxSensitivity).toFixed(1)} dBm` },
    { label: t("linkMargin.budget.fadeMargin", "Fade Margin"), value: `-${numberValue(values.fadeMargin).toFixed(1)} dB` },
    { label: "MAPL", value: formatDb(values.maplValue), total: true },
  ];
}

function radioHorizonKm(heightA, heightB) {
  return 3.57 * (Math.sqrt(Math.max(0, heightA)) + Math.sqrt(Math.max(0, heightB)));
}

function buildSuggestion(environment, desiredRange, deficit, actualRange, bottleneck, frequencyMhz, t) {
  const environmentLabel = t(
    `linkMargin.environments.${environment.id}.label`,
    environment.label,
  );
  if (deficit <= 0) {
    return {
      environment,
      ok: true,
      title: t("linkMargin.suggestion.achievableTitle", "{environment}: Achievable", {
        environment: environmentLabel,
      }),
      lines: [
        t("linkMargin.suggestion.rangeExceedsTarget", "Range {range} exceeds target {target}.", {
          range: formatKm(actualRange),
          target: formatKm(desiredRange),
        }),
        t("linkMargin.suggestion.surplus", "Surplus: +{margin} dB.", {
          margin: Math.abs(deficit).toFixed(1),
        }),
      ],
    };
  }

  const neededDiversity = Math.ceil(deficit / 3);
  const targetFrequency = numberValue(frequencyMhz) / 10 ** (deficit / 20);
  return {
    environment,
    ok: false,
    title: t("linkMargin.suggestion.needTitle", "{environment}: Need {margin} dB", {
      environment: environmentLabel,
      margin: deficit.toFixed(1),
    }),
    bottleneck,
    lines: [
      t("linkMargin.suggestion.increasePower", "Increase Tx power by {margin} dB on the weaker direction.", { margin: deficit.toFixed(1) }),
      t("linkMargin.suggestion.addGain", "Add {margin} dBi total antenna gain.", { margin: deficit.toFixed(1) }),
      t("linkMargin.suggestion.improveSensitivity", "Improve receiver sensitivity by {margin} dB.", { margin: deficit.toFixed(1) }),
      t("linkMargin.suggestion.diversity", "Diversity: {count} more antenna(s), about {gain} dB.", {
        count: neededDiversity,
        gain: (neededDiversity * 3).toFixed(0),
      }),
      t("linkMargin.suggestion.reduceLoss", "Reduce cable losses or fade margin by {margin} dB where acceptable.", { margin: deficit.toFixed(1) }),
      t("linkMargin.suggestion.lowerFrequency", "Lower frequency to roughly {frequency} MHz.", {
        frequency: targetFrequency.toFixed(0),
      }),
    ],
  };
}

function Field({ label, children, hint }) {
  return (
    <label className="lm-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default function LinkMarginTool() {
  const { t } = useI18n();
  const [form, setForm] = useState(DEFAULTS);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState("urban");

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const result = useMemo(() => {
    const ranges = ENVIRONMENTS.map((environment) => ({
      ...environment,
      ab: mapl({
        txPower: form.txPowerA,
        txGain: form.gainA,
        txLoss: form.lossA,
        rxGain: form.gainB,
        rxLoss: form.lossB,
        rxDiversity: form.divB,
        fadeMargin: form.fadeMargin,
        rxSensitivity: form.rxSensitivity,
      }),
      ba: mapl({
        txPower: form.txPowerB,
        txGain: form.gainB,
        txLoss: form.lossB,
        rxGain: form.gainA,
        rxLoss: form.lossA,
        rxDiversity: form.divA,
        fadeMargin: form.fadeMargin,
        rxSensitivity: form.rxSensitivity,
      }),
    })).map((environment) => {
      const abRange = rangeKmFromMapl(environment.ab, form.frequency, environment.exponent);
      const baRange = rangeKmFromMapl(environment.ba, form.frequency, environment.exponent);
      const limitingMapl = Math.min(environment.ab, environment.ba);
      const requiredMapl = maplRequired(
        form.desiredRange,
        form.frequency,
        environment.exponent,
      );
      const deficit = requiredMapl - limitingMapl;
      const rangeKm = Math.min(abRange, baRange);
      const bottleneck = abRange <= baRange ? "A to B" : "B to A";
      return {
        ...environment,
        rangeKm,
        deficit,
        bottleneck,
        ok: deficit <= 0,
      };
    });
    const rural = ranges.find((environment) => environment.id === "rural");
    const maplAB = rural?.ab ?? 0;
    const maplBA = rural?.ba ?? 0;
    const limitingMapl = Math.min(maplAB, maplBA);
    const worstDeficit = Math.max(...ranges.map((environment) => environment.deficit));
    const suggestions = ranges.map((environment) =>
      buildSuggestion(
        environment,
        numberValue(form.desiredRange),
        environment.deficit,
        environment.rangeKm,
        environment.bottleneck,
        form.frequency,
        t,
      ),
    );
    const horizonKm = radioHorizonKm(
      numberValue(form.heightA),
      numberValue(form.heightB),
    );
    const heightAwareRanges = ranges.map((environment) => ({
      ...environment,
      practicalRangeKm: Math.min(environment.rangeKm, horizonKm),
      heightLimited: horizonKm < environment.rangeKm,
      practicalOk: Math.min(environment.rangeKm, horizonKm) >= numberValue(form.desiredRange),
    }));
    const base = 32.45 + 20 * Math.log10(Math.max(1, numberValue(form.frequency, 1)));
    const maxRuralKm = rangeKmFromMapl(limitingMapl, form.frequency, 2.0);
    const fresnelClearanceM =
      17.32 * Math.sqrt(maxRuralKm / (4 * (numberValue(form.frequency) / 1000))) * 0.6;

    return {
      maplAB,
      maplBA,
      limitingMapl,
      ranges: heightAwareRanges,
      worstDeficit,
      desiredMargin: -worstDeficit,
      suggestions,
      horizonKm,
      fresnelClearanceM,
      maxRuralKm,
      base,
    };
  }, [form, t]);

  const anyFail = result.ranges.some(
    (environment) => !environment.ok || !environment.practicalOk,
  );
  const status = anyFail ? "review" : "achievable";
  const minNodeHeight = Math.min(numberValue(form.heightA), numberValue(form.heightB));
  const showFresnelWarning =
    minNodeHeight < result.fresnelClearanceM && result.maxRuralKm > 0.1;
  const maritimeRange = result.ranges.find((environment) => environment.id === "maritime")
    ?.rangeKm;
  const aToB = t("linkMargin.aToB", "A to B");
  const bToA = t("linkMargin.bToA", "B to A");
  const abBudgetRows = budgetRows(aToB, {
    txPower: form.txPowerA,
    txGain: form.gainA,
    txLoss: form.lossA,
    rxGain: form.gainB,
    rxLoss: form.lossB,
    rxDiversityGain: diversityGain(form.divB),
    rxSensitivity: form.rxSensitivity,
    fadeMargin: form.fadeMargin,
    maplValue: result.maplAB,
  }, t);
  const baBudgetRows = budgetRows(bToA, {
    txPower: form.txPowerB,
    txGain: form.gainB,
    txLoss: form.lossB,
    rxGain: form.gainA,
    rxLoss: form.lossA,
    rxDiversityGain: diversityGain(form.divA),
    rxSensitivity: form.rxSensitivity,
    fadeMargin: form.fadeMargin,
    maplValue: result.maplBA,
  }, t);
  const visualEnvironment =
    result.ranges.find((environment) => environment.id === selectedEnvironmentId) ??
    result.ranges[0];
  const desiredKm = Math.max(0.001, numberValue(form.desiredRange, 0.001));
  const theoreticalKm = Math.max(0, visualEnvironment.rangeKm);
  const availableKm = Math.max(0, visualEnvironment.practicalRangeKm);
  const visualOk = availableKm >= desiredKm;
  const maxVisualKm = Math.max(desiredKm, availableKm, theoreticalKm, 0.001);
  const targetPercent = Math.min(100, (desiredKm / maxVisualKm) * 100);
  const practicalPercent = Math.min(100, (availableKm / maxVisualKm) * 100);
  const theoreticalPercent = Math.min(100, (theoreticalKm / maxVisualKm) * 100);
  const visualSuggestion =
    result.suggestions.find(
      (suggestion) => suggestion.environment.id === visualEnvironment.id,
    ) ?? result.suggestions[0];

  return (
    <section className="tools-card link-margin-card">
      <div className="tools-card-title">{t("tools.linkMargin", "Link Margin")}</div>
      <div className="tools-card-body">
        <div className="lm-shell">
          <section className="lm-card">
            <div className="lm-card-h">
              <h3>{t("linkMargin.linkParameters", "Link Parameters")}</h3>
              <span className="nbadge">{t("linkMargin.bidirectional", "Bidirectional")}</span>
            </div>
            <div className="lm-card-b">
              <div className="lm-param-grid">
                <div>
                  <div className="lm-section-title">{t("linkMargin.nodeA", "Node A")}</div>
                  <Field label={t("linkMargin.outputPower", "Output Power")}>
                    <select
                      value={form.txPowerA}
                      onChange={(event) => updateField("txPowerA", event.target.value)}
                    >
                      {POWER_OPTIONS.map((power) => (
                        <option key={power} value={power}>
                          {power} dBm
                        </option>
                      ))}
                    </select>
                    <small>{formatPower(form.txPowerA)}</small>
                  </Field>
                  <Field label={t("linkMargin.antennaGain", "Antenna Gain (dBi)")}>
                    <input
                      type="number"
                      step="any"
                      value={form.gainA}
                      onChange={(event) => updateField("gainA", event.target.value)}
                    />
                  </Field>
                  <Field label={t("linkMargin.cableLoss", "Cable Loss (dB)")}>
                    <input
                      type="number"
                      step="any"
                      value={form.lossA}
                      onChange={(event) => updateField("lossA", event.target.value)}
                    />
                  </Field>
                  <Field
                    label={t("linkMargin.height", "Height (m)")}
                    hint={t("linkMargin.heightHint", "Used for horizon and Fresnel checks; MAPL range is theoretical.")}
                  >
                    <input
                      type="number"
                      step="any"
                      value={form.heightA}
                      onChange={(event) => updateField("heightA", event.target.value)}
                    />
                  </Field>
                  <Field label={t("linkMargin.diversityAntennas", "Diversity Antennas")}>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.divA}
                      onChange={(event) => updateField("divA", event.target.value)}
                    />
                  </Field>
                </div>

                <div>
                  <div className="lm-section-title">{t("linkMargin.nodeB", "Node B")}</div>
                  <Field label={t("linkMargin.outputPower", "Output Power")}>
                    <select
                      value={form.txPowerB}
                      onChange={(event) => updateField("txPowerB", event.target.value)}
                    >
                      {POWER_OPTIONS.map((power) => (
                        <option key={power} value={power}>
                          {power} dBm
                        </option>
                      ))}
                    </select>
                    <small>{formatPower(form.txPowerB)}</small>
                  </Field>
                  <Field label={t("linkMargin.antennaGain", "Antenna Gain (dBi)")}>
                    <input
                      type="number"
                      step="any"
                      value={form.gainB}
                      onChange={(event) => updateField("gainB", event.target.value)}
                    />
                  </Field>
                  <Field label={t("linkMargin.cableLoss", "Cable Loss (dB)")}>
                    <input
                      type="number"
                      step="any"
                      value={form.lossB}
                      onChange={(event) => updateField("lossB", event.target.value)}
                    />
                  </Field>
                  <Field
                    label={t("linkMargin.height", "Height (m)")}
                    hint={t("linkMargin.heightHint", "Used for horizon and Fresnel checks; MAPL range is theoretical.")}
                  >
                    <input
                      type="number"
                      step="any"
                      value={form.heightB}
                      onChange={(event) => updateField("heightB", event.target.value)}
                    />
                  </Field>
                  <Field label={t("linkMargin.diversityAntennas", "Diversity Antennas")}>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.divB}
                      onChange={(event) => updateField("divB", event.target.value)}
                    />
                  </Field>
                </div>

                <div>
                  <div className="lm-section-title">{t("linkMargin.propagation", "Propagation")}</div>
                  <Field label={t("linkMargin.frequencyMhz", "Frequency (MHz)")}>
                    <input
                      type="number"
                      step="any"
                      value={form.frequency}
                      onChange={(event) => updateField("frequency", event.target.value)}
                    />
                  </Field>
                  <Field label={t("linkMargin.rxSensitivity", "Rx Sensitivity (dBm)")}>
                    <input
                      type="number"
                      step="any"
                      value={form.rxSensitivity}
                      onChange={(event) =>
                        updateField("rxSensitivity", event.target.value)
                      }
                    />
                  </Field>
                  <Field label={t("linkMargin.fadeMargin", "Fade Margin (dB)")}>
                    <input
                      type="number"
                      step="any"
                      value={form.fadeMargin}
                      onChange={(event) => updateField("fadeMargin", event.target.value)}
                    />
                    <div className="lm-preset-row">
                      {[10, 12, 15, 20, 25].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={
                            Number(form.fadeMargin) === value ? "active" : ""
                          }
                          onClick={() => updateField("fadeMargin", value)}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label={t("linkMargin.desiredRange", "Desired Range (km)")}>
                    <input
                      type="number"
                      step="any"
                      value={form.desiredRange}
                      onChange={(event) => updateField("desiredRange", event.target.value)}
                    />
                  </Field>
                </div>
              </div>

              <div className="tools-actions">
                <button type="button" onClick={() => setForm(DEFAULTS)}>
                  {t("common.resetAll", "Reset All")}
                </button>
              </div>

              <div className="lm-reference">
                <h4>{t("linkMargin.quickReference", "Quick Reference")}</h4>
                <ul>
                  <li>{t("linkMargin.reference.power", "Tx power, antenna gain, and receiver sensitivity increase link budget.")}</li>
                  <li>{t("linkMargin.reference.loss", "Cable loss and fade margin reduce available range.")}</li>
                  <li>{t("linkMargin.reference.height", "Height improves line-of-sight and Fresnel clearance.")}</li>
                </ul>
                <code>P(W) = 10 ^ ((dBm - 30) / 10)</code>
              </div>
            </div>
          </section>

          <section className="lm-card">
            <div className="lm-card-h">
              <h3>{t("linkMargin.results", "Results")}</h3>
              <span className={`nbadge lm-status-${status.toLowerCase().replace(" ", "-")}`}>
                {t(`linkMargin.status.${status}`, status)}
              </span>
            </div>
            <div className="lm-card-b">
              <section className={`lm-result-summary ${visualOk ? "ok" : "warn"}`}>
                <div>
                  <span>{t("tools.aiAssistant", "AI Assistant")}</span>
                  <strong>
                    {visualOk
                      ? t("linkMargin.practicalTargetCovered", "Practical target covered")
                      : t("linkMargin.targetExceedsPracticalRange", "Target exceeds practical range")}
                  </strong>
                  <p>
                    {visualEnvironment.heightLimited
                      ? t("linkMargin.heightLimitedMessage", "{environment} is currently height-limited. Increase antenna height or verify line-of-sight before relying on the theoretical MAPL range.", {
                          environment: t(`linkMargin.environments.${visualEnvironment.id}.label`, visualEnvironment.label),
                        })
                      : visualSuggestion.lines[0]}
                  </p>
                </div>
                <div className="lm-result-summary-metrics">
                  <span>{t(`linkMargin.environments.${visualEnvironment.id}.label`, visualEnvironment.label)}</span>
                  <strong>
                    {visualOk ? t("linkMargin.surplus", "Surplus") : t("linkMargin.deficit", "Deficit")}{" "}
                    {Math.abs(visualEnvironment.deficit).toFixed(1)} dB
                  </strong>
                  <small>{visualEnvironment.bottleneck}</small>
                </div>
                <ul className="lm-ai-list">
                  {visualSuggestion.lines
                    .slice(visualEnvironment.heightLimited ? 0 : 1)
                    .map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                </ul>
              </section>

              <div className="lm-results-table" role="table" aria-label={t("linkMargin.environmentResults", "Link margin environment results")}>
                <div className="lm-results-row lm-results-header" role="row">
                  <span role="columnheader">{t("linkMargin.environment", "Environment")}</span>
                  <span role="columnheader">{t("linkMargin.target", "Target")}</span>
                  <span role="columnheader">{t("linkMargin.practical", "Practical")}</span>
                  <span role="columnheader">{t("linkMargin.margin", "Margin")}</span>
                </div>
                {result.ranges.map((environment) => (
                  <button
                    type="button"
                    className={`lm-results-row ${
                      environment.ok && environment.practicalOk ? "ok" : "warn"
                    } ${environment.id === visualEnvironment.id ? "selected" : ""}`}
                    key={environment.id}
                    role="row"
                    onClick={() => setSelectedEnvironmentId(environment.id)}
                  >
                    <span role="cell">
                      <strong className={`lm-badge lm-${environment.id}`}>
                        {t(`linkMargin.environments.${environment.id}.label`, environment.label)}
                      </strong>
                      <small>{t(`linkMargin.environments.${environment.id}.sublabel`, environment.sublabel)}</small>
                    </span>
                    <span role="cell">{formatKm(desiredKm)}</span>
                    <span role="cell">
                      {formatKm(environment.practicalRangeKm)}
                      {environment.heightLimited && <small>{t("linkMargin.heightCapped", "Height capped")}</small>}
                    </span>
                    <span role="cell">
                      {environment.ok ? t("linkMargin.surplus", "Surplus") : t("linkMargin.deficit", "Deficit")}{" "}
                      {Math.abs(environment.deficit).toFixed(1)} dB
                    </span>
                  </button>
                ))}
              </div>

              <div className="lm-sim">
                <div className="lm-sim-head">
                  <h4>{t("linkMargin.rangeCoverage", "Range Coverage")}</h4>
                  <span>{t(`linkMargin.environments.${visualEnvironment.id}.label`, visualEnvironment.label)} · {visualEnvironment.bottleneck}</span>
                </div>
                <div className={`lm-range-track ${visualOk ? "ok" : "warn"}`}>
                  <span className="lm-range-theoretical" style={{ width: `${theoreticalPercent}%` }} />
                  <span className="lm-range-practical" style={{ width: `${practicalPercent}%` }} />
                  <span className="lm-range-target" style={{ left: `${targetPercent}%` }}>
                    {t("linkMargin.target", "Target")}
                  </span>
                </div>
                <div className="lm-range-scale">
                  <span>0 km</span>
                  <span>{t("linkMargin.practicalWithValue", "Practical {value}", { value: formatKm(availableKm) })}</span>
                  <span>{t("linkMargin.targetWithValue", "Target {value}", { value: formatKm(desiredKm) })}</span>
                  <span>{t("linkMargin.theoreticalWithValue", "Theoretical {value}", { value: formatKm(theoreticalKm) })}</span>
                </div>
              </div>

              <details className="lm-dropdown">
                <summary>
                  <span>{t("linkMargin.maplBudget", "MAPL Budget")}</span>
                  <strong>{formatDb(result.limitingMapl)}</strong>
                </summary>
                <div className="lm-budget">
                  <div className="lm-budget-dir">{aToB}</div>
                  {abBudgetRows.map((row) => (
                    <div
                      className={`lm-budget-row ${row.total ? "total" : ""}`}
                      key={`ab-${row.label}`}
                    >
                      <span>{row.label}</span>
                      <span>{row.value}</span>
                    </div>
                  ))}
                  <div className="lm-budget-dir">{bToA}</div>
                  {baBudgetRows.map((row) => (
                    <div
                      className={`lm-budget-row ${row.total ? "total" : ""}`}
                      key={`ba-${row.label}`}
                    >
                      <span>{row.label}</span>
                      <span>{row.value}</span>
                    </div>
                  ))}
                  <div className="lm-budget-row total">
                    <span>{t("linkMargin.limitingMapl", "Limiting MAPL")}</span>
                    <span>{formatDb(result.limitingMapl)}</span>
                  </div>
                </div>
              </details>

              <details className="lm-dropdown">
                <summary>
                  <span>{t("linkMargin.formulaDetails", "Formula Details")}</span>
                  <strong>{t("linkMargin.showMath", "Show math")}</strong>
                </summary>
                <div className="lm-details">
                  <code>
                    MAPL = TxPwr + TxGain - TxLoss + RxGain - RxLoss + DivGain - Fade - RxSens
                  </code>
                  <code>
                    d = 10 ^ ((MAPL - 32.45 - 20 log10(f)) / (10 n))
                  </code>
                </div>
              </details>

              {numberValue(form.desiredRange) > result.horizonKm && (
                <div className="lm-warning">
                  {t("linkMargin.horizonWarning", "Height limits the practical range to about {range} by radio horizon. Increase antenna height or verify line-of-sight.", {
                    range: formatKm(result.horizonKm),
                  })}
                </div>
              )}
              {showFresnelWarning && (
                <div className="lm-warning">
                  {t("linkMargin.fresnelWarning", "Fresnel clearance may limit range. Keep at least {clearance} m clearance near mid-path for the estimated free-space range.", {
                    clearance: result.fresnelClearanceM.toFixed(1),
                  })}
                </div>
              )}
              {maritimeRange > 0 && (
                <div className="lm-warning">
                  {t("linkMargin.maritimeWarning", "Maritime or high-multipath links usually need 20 dB or more fade margin.")}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
