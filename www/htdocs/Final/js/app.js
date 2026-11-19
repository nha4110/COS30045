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
import { renderFirstNationsTrend } from "./modules/supplementaryCharts.js";

function renderAll() {
    hideTooltip();
    updateSummary();
    renderNationalTrend();
    renderDemographics();
    renderRoadUserBars();
    renderRoadUserTrends();
    renderFirstNationsTrend();
}

function renderComparisonYear() {
    hideTooltip();
    updateSummary();
    renderRoadUserBars();
}

function renderRoadUser() {
    hideTooltip();
    updateSummary();
    renderDemographics();
    renderRoadUserBars();
    renderRoadUserTrends();
    renderFirstNationsTrend();
}

function renderJurisdiction() {
    hideTooltip();
}

function renderDemographicYear() {
    hideTooltip();
    renderDemographics();
}

function bindContextualFilterBar() {
    const bar = document.getElementById("context-filter-bar");
    const label = document.getElementById("context-filter-label");
    const slot = document.getElementById("context-filter-control-slot");
    const jump = document.getElementById("context-filter-jump");
    const zones = [
        {
            section: document.querySelector(".demographic-comparison"),
            name: "Step 4 year",
            href: "#demographic-title",
            source: document.getElementById("demographic-year-filter")
        },
        {
            section: document.getElementById("supplementary"),
            name: "Jurisdiction - state charts",
            href: "#supplementary-title",
            source: document.getElementById("state-filter")
        }
    ];
    let activeZone = null;

    function syncControl(zone) {
        if (!zone?.clone) return;
        const value = zone.source.value;
        zone.clone.replaceChildren(...[...zone.source.options].map((option) => option.cloneNode(true)));
        zone.clone.value = value;
    }

    function showZone(zone) {
        activeZone = zone;
        slot.replaceChildren();
        if (!zone) {
            bar.hidden = true;
            return;
        }

        label.textContent = zone.name;
        jump.href = zone.href;
        jump.textContent = `Jump to ${zone.name}`;
        const controlLabel = document.createElement("label");
        controlLabel.className = "context-filter-control";
        const controlText = document.createElement("span");
        controlText.textContent = zone.source.closest("label").querySelector("span").textContent;
        zone.clone = zone.source.cloneNode(false);
        zone.clone.id = `context-${zone.source.id}`;
        controlLabel.htmlFor = zone.clone.id;
        controlLabel.append(controlText, zone.clone);
        slot.append(controlLabel);
        syncControl(zone);
        zone.clone.addEventListener("change", () => {
            zone.source.value = zone.clone.value;
            zone.source.dispatchEvent(new Event("change", { bubbles: true }));
        });
        bar.hidden = false;
    }

    function updateContext() {
        const marker = window.innerHeight * 0.3;
        const zone = zones.find(({ section }) => {
            const bounds = section.getBoundingClientRect();
            return bounds.top <= marker && bounds.bottom > marker;
        }) || null;
        if (zone === activeZone) return;
        showZone(zone);
    }

    function refreshContextFilters() {
        if (activeZone) syncControl(activeZone);
    }

    document.getElementById("context-reset-filters").addEventListener("click", () => {
        document.getElementById("reset-filters").click();
        refreshContextFilters();
    });
    zones.forEach((zone) => zone.source.addEventListener("change", refreshContextFilters));

    let scheduled = false;
    window.addEventListener("scroll", () => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(() => {
            scheduled = false;
            updateContext();
        });
    }, { passive: true });
    window.addEventListener("resize", updateContext, { passive: true });
    updateContext();
    return refreshContextFilters;
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
    const refreshContextFilters = bindContextualFilterBar();

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
    const suppressedFirstNationsRows = data.firstNations.filter((row) => row.suppressed).length;
    document.getElementById("supplementary-data-status").textContent =
        `Across the complete CSVs, ${suppressedStateRows} state records and ${suppressedFirstNationsRows} First Nations records are suppressed. They remain unknown, not zero. The visible selection may contain fewer suppressed records.`;

    setStatus(messages);
    updateFilters();
    refreshContextFilters();
    renderAll();

    let resizeTimer;
    window.addEventListener("resize", () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(renderAll, 160);
    }, { passive: true });
}

start();
