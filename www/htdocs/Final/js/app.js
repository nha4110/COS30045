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
import { renderFirstNationsTrend, renderRoadUserComposition } from "./modules/supplementaryCharts.js";

function renderAll() {
    hideTooltip();
    updateSummary();
    renderNationalTrend();
    renderDemographics();
    renderRoadUserBars();
    renderRoadUserTrends();
    renderFirstNationsTrend();
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
            section: document.querySelector("article[aria-labelledby='road-user-chart-title']"),
            name: "Step 2 - Explore the change",
            href: "#road-user-chart-title",
            sources: [document.getElementById("year-filter"), document.getElementById("user-filter")]
        },
        {
            section: document.querySelector(".demographic-comparison"),
            name: "Step 3 year",
            href: "#demographic-title",
            sources: [document.getElementById("demographic-year-filter")]
        },
        {
            section: document.getElementById("supplementary"),
            name: "Step 4 - Place and community",
            href: "#supplementary-title",
            sources: [document.getElementById("state-filter")]
        }
    ];
    let activeZone = null;

    function syncControl(zone) {
        if (!zone?.clones) return;
        zone.sources.forEach((source, index) => {
            const clone = zone.clones[index];
            const value = source.value;
            clone.replaceChildren(...[...source.options].map((option) => option.cloneNode(true)));
            clone.value = value;
        });
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
        zone.clones = zone.sources.map((source) => {
            const controlLabel = document.createElement("label");
            controlLabel.className = "context-filter-control";
            const controlText = document.createElement("span");
            controlText.textContent = source.closest("label").querySelector("span").textContent;
            const clone = source.cloneNode(false);
            clone.id = `context-${source.id}`;
            controlLabel.htmlFor = clone.id;
            controlLabel.append(controlText, clone);
            slot.append(controlLabel);
            return clone;
        });
        syncControl(zone);
        zone.clones.forEach((clone, index) => clone.addEventListener("change", () => {
            zone.sources[index].value = clone.value;
            zone.sources[index].dispatchEvent(new Event("change", { bubbles: true }));
        }));
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
    zones.forEach((zone) => zone.sources.forEach((source) => source.addEventListener("change", refreshContextFilters)));

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
