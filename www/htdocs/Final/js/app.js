import {
    FILES,
    data,
    loadDataset,
    setStatus,
    updateFilters,
    initializeTheme,
    bindFilterListeners,
    handleChartArrowNavigation,
    hideTooltip
} from "./modules/state.js";
import { renderNationalTrend } from "./modules/nationalChart.js";
import { renderDemographics } from "./modules/demographicsCharts.js";
import {
    updateSummary,
    renderRoadUserBars,
    renderRoadUserTrends
} from "./modules/roadUserCharts.js";
import { renderRoadUserComposition } from "./modules/supplementaryCharts.js";

function renderAll() {
    hideTooltip();
    updateSummary();
    renderNationalTrend();
    renderDemographics();
    renderRoadUserBars();
    renderRoadUserTrends();
    renderRoadUserComposition();
}

function renderComparisonYear() {
    hideTooltip();
    updateSummary();
    renderRoadUserBars();
    renderRoadUserTrends();
}

function renderRoadUser() {
    hideTooltip();
    updateSummary();
    renderDemographics();
    renderRoadUserBars();
    renderRoadUserTrends();
}

function renderJurisdiction() {
    hideTooltip();
    renderRoadUserComposition();
}

function renderDemographicYear() {
    hideTooltip();
    renderDemographics();
}

async function start() {
    initializeTheme(renderAll);
    document.addEventListener("keydown", handleChartArrowNavigation);
    bindFilterListeners({
        onYear: renderComparisonYear,
        onState: renderJurisdiction,
        onUser: renderRoadUser,
        onDemographicYear: renderDemographicYear,
        onReset: renderAll
    });
    // Filters stay in their story sections; do not create the floating contextual bar.

    const results = await Promise.all(Object.entries(FILES).map(async ([kind, path]) => {
        try {
            return { kind, rows: await loadDataset(kind, path) };
        } catch (error) {
            return { kind, error };
        }
    }));
    const messages = [];
    results.forEach((result) => {
        if (result.error) {
            messages.push(`${FILES[result.kind]} could not be loaded: ${result.error.message}`);
            return;
        }
        data[result.kind] = result.rows;
        if (!result.rows.length) messages.push(`${FILES[result.kind]} contains no usable records.`);
    });

    const suppressedStateRows = data.state.filter((row) => row.suppressed).length;
    document.getElementById("supplementary-data-status").textContent =
        `Across the complete state CSV, ${suppressedStateRows} records are suppressed. They remain unknown, not zero. The visible selection may contain fewer suppressed records.`;

    setStatus(messages);
    updateFilters();
    renderAll();

    let resizeTimer;
    window.addEventListener("resize", () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(renderAll, 160);
    }, { passive: true });
}

start();
