import {
    FILES, data, loadDataset, setStatus, updateFilters,
    initializeTheme, bindFilterListeners,
    handleChartArrowNavigation, hideTooltip
} from "./modules/state.js";
import { renderNationalTrend } from "./modules/nationalChart.js";
import { renderDemographics } from "./modules/demographicsCharts.js";
import {
    updateSummary, renderRoadUserBars, renderRoadUserTrends
} from "./modules/roadUserCharts.js";
import {
    renderStateHeatmap, renderRoadUserSeries,
    renderStateTrend, renderFirstNationsTrend
} from "./modules/supplementaryCharts.js";
import { initializeInterface, updateViewContext } from "./modules/interface.js";

const renderErrors = new Map();
const loadWarnings = [];
const pendingRenders = new Set();
let ready = false;
let animationFrame = null;

function reportStatus() {
    setStatus([...loadWarnings, ...renderErrors.values()]);
}

function draw(render, targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;
    try {
        target.classList.remove("is-render-error");
        target.querySelector(".render-error-message")?.remove();
        render();
        renderErrors.delete(targetId);
    } catch (error) {
        console.error(`Unable to render ${targetId}:`, error);
        const message = document.createElement("p");
        message.className = "render-error-message";
        message.textContent = "This view could not be displayed. Check the data files and reload the page.";
        target.replaceChildren(message);
        target.classList.add("is-render-error");
        renderErrors.set(targetId, `The ${targetId.replaceAll("-", " ")} view is unavailable.`);
    }
}

const national = () => draw(renderNationalTrend, "national-chart");
const demographics = () => draw(renderDemographics, "age-chart");
const roadBars = () => draw(renderRoadUserBars, "road-user-chart");
const roadTrends = () => draw(renderRoadUserTrends, "road-user-trend-chart");
const heatmap = () => draw(renderStateHeatmap, "state-chart");
const firstNations = () => draw(renderFirstNationsTrend, "first-nations-chart");

function extraTrends() {
    const disclosure = document.getElementById("road-user-series-chart")?.closest("details");
    if (disclosure && !disclosure.open) return;
    draw(renderRoadUserSeries, "road-user-series-chart");
    draw(renderStateTrend, "state-trend-chart");
}

function summary() {
    try {
        updateSummary();
        renderErrors.delete("summary");
    } catch (error) {
        console.error("Unable to update the summary:", error);
        renderErrors.set("summary", "Summary values could not be updated.");
    }
}

function queueRenders(...renders) {
    if (!ready) return;
    renders.forEach((render) => pendingRenders.add(render));
    if (animationFrame !== null) return;
    animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        hideTooltip();
        const work = [...pendingRenders];
        pendingRenders.clear();
        work.forEach((render) => render());
        updateViewContext();
        reportStatus();
    });
}

function renderAll() {
    queueRenders(summary, national, demographics, roadBars, roadTrends, heatmap, firstNations, extraTrends);
}

function renderComparisonYear() {
    queueRenders(summary, roadBars, heatmap);
}

function renderRoadUser() {
    queueRenders(summary, demographics, roadBars, roadTrends, firstNations, extraTrends);
}

function renderJurisdiction() {
    queueRenders(heatmap, extraTrends);
}

function renderDemographicYear() {
    queueRenders(demographics);
}

async function start() {
    const main = document.getElementById("main");
    main?.setAttribute("aria-busy", "true");
    setStatus(["Loading the recorded hospitalisation data…"]);
    initializeInterface({ onLayoutChange: renderAll });
    initializeTheme(renderAll);
    document.addEventListener("keydown", handleChartArrowNavigation);
    bindFilterListeners({
        onYear: renderComparisonYear,
        onState: renderJurisdiction,
        onUser: renderRoadUser,
        onDemographicYear: renderDemographicYear,
        onReset: renderAll
    });

    const results = await Promise.all(Object.entries(FILES).map(async ([kind, path]) => {
        try {
            return { kind, rows: await loadDataset(kind, path) };
        } catch (error) {
            return { kind, error };
        }
    }));

    results.forEach((result) => {
        if (result.error) {
            console.error(`Unable to load ${FILES[result.kind]}:`, result.error);
            loadWarnings.push(`${FILES[result.kind]} could not be loaded.`);
            return;
        }
        data[result.kind] = result.rows;
        if (!result.rows.length) loadWarnings.push(`${FILES[result.kind]} contains no usable records.`);
    });

    const suppressedStateRows = (data.state || []).filter((row) => row.suppressed).length;
    const suppressedFirstNationsRows = (data.firstNations || []).filter((row) => row.suppressed).length;
    const supplementaryStatus = document.getElementById("supplementary-data-status");
    if (supplementaryStatus) {
        supplementaryStatus.textContent =
            `Across the complete CSVs, ${suppressedStateRows} state records and ${suppressedFirstNationsRows} First Nations records are suppressed. They remain unknown, not zero. The visible selection may contain fewer suppressed records.`;
    }

    updateFilters();
    ready = true;
    main?.setAttribute("aria-busy", "false");
    renderAll();

    let resizeTimer;
    window.addEventListener("resize", () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(renderAll, 160);
    }, { passive: true });
}

start().catch((error) => {
    console.error("Dashboard startup failed:", error);
    document.getElementById("main")?.setAttribute("aria-busy", "false");
    setStatus(["The dashboard could not start. Check that the module and CSV files are available, then reload the page."]);
});
