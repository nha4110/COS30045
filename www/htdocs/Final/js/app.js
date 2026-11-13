import { FILES, data, loadDataset, setStatus, updateFilters, initializeTheme, bindFilterListeners, handleChartArrowNavigation, hideTooltip } from "./modules/state.js";
import { renderNationalTrend } from "./modules/nationalChart.js";
import { renderDemographics } from "./modules/demographicsCharts.js";
import { updateSummary, renderRoadUserBars, renderRoadUserTrends } from "./modules/roadUserCharts.js";
import { renderStateHeatmap, renderRoadUserSeries, renderStateTrend, renderFirstNationsTrend } from "./modules/supplementaryCharts.js";

function renderAll() {
    hideTooltip(); updateSummary(); renderNationalTrend(); renderDemographics(); renderRoadUserBars(); renderRoadUserTrends();
    renderStateHeatmap(); renderFirstNationsTrend(); renderRoadUserSeries(); renderStateTrend();
}
function renderComparisonYear() { hideTooltip(); updateSummary(); renderRoadUserBars(); renderStateHeatmap(); }
function renderRoadUser() { hideTooltip(); updateSummary(); renderDemographics(); renderRoadUserBars(); renderRoadUserTrends(); renderFirstNationsTrend(); renderStateTrend(); }
function renderJurisdiction() { hideTooltip(); renderStateHeatmap(); renderStateTrend(); }
function renderDemographicYear() { hideTooltip(); renderDemographics(); }

async function start() {
    initializeTheme(renderAll);
    document.addEventListener("keydown", handleChartArrowNavigation);
    bindFilterListeners({ onYear: renderComparisonYear, onState: renderJurisdiction, onUser: renderRoadUser, onDemographicYear: renderDemographicYear, onReset: renderAll });
    const results = await Promise.all(Object.entries(FILES).map(async ([kind, path]) => {
        try { return { kind, rows: await loadDataset(kind, path) }; }
        catch (error) { return { kind, error }; }
    }));
    const messages = [];
    results.forEach((result) => {
        if (result.error) { messages.push(`${FILES[result.kind]} could not be loaded: ${result.error.message}`); return; }
        data[result.kind] = result.rows;
        if (!result.rows.length) messages.push(`${FILES[result.kind]} contains no usable records.`);
    });
    const suppressedStateRows = data.state.filter((row) => row.suppressed).length;
    const suppressedFirstNationsRows = data.firstNations.filter((row) => row.suppressed).length;
    document.getElementById("supplementary-data-status").textContent =
        `Across the complete CSVs, ${suppressedStateRows} state records and ${suppressedFirstNationsRows} First Nations records are suppressed. They remain unknown, not zero. The visible selection may contain fewer suppressed records.`;
    setStatus(messages); updateFilters(); renderAll();
    let resizeTimer;
    window.addEventListener("resize", () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(renderAll, 160);
    }, { passive: true });
}
start();
