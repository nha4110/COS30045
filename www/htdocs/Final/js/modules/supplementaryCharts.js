import {
    d3,
    data,
    filters,
    selectedYear,
    rowsForUser,
    summarizeRows,
    setEmptyState,
    chartWidth,
    addAxes,
    addChartPatterns,
    attachTooltip,
    revealChart,
    clearChart,
    COLORS,
    numberFormat,
    fullStateName,
    reducedMotion,
    animateMarks
} from "./state.js";

// Jurisdiction heatmap.
export function renderStateHeatmap() {
    const container = document.getElementById("state-chart");
    const empty = document.getElementById("state-empty");
    const dataNote = document.getElementById("state-data-note");

    clearChart(container);

    const year = selectedYear();

    const rows = data.state.filter(row =>
        row.year === year &&
        (!filters.state || row.state === filters.state)
    );

    document.getElementById("comparison-year-label").textContent =
        `Selected year: ${year || "unavailable"}`;

    const states = [...new Set(
        data.state.map(row => row.state).filter(Boolean)
    )]
        .filter(state => !filters.state || state === filters.state)
        .sort((a, b) => a.localeCompare(b));

    const users = [...new Set(
        data.state.map(row => row.user).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    if (!rows.length || !states.length || !users.length) {
        dataNote.hidden = true;

        setEmptyState(
            empty,
            "No jurisdiction records match this year and filter.",
            true
        );

        return;
    }

    setEmptyState(empty, "", false);

    const summaries = d3.rollups(
        rows,
        group => {
            const known = group.filter(row => row.value !== null);

            return {
                value: known.length
                    ? d3.sum(known, row => row.value)
                    : null,

                suppressedCount: group.filter(row =>
                    row.suppressed || row.value === null
                ).length
            };
        },
        row => `${row.state}\u0000${row.user}`
    );

    const cellData = new Map(
        summaries.map(([key, summary]) => [key, summary])
    );

    const cells = states.flatMap(state =>
        users.map(user => {
            const summary = cellData.get(`${state}\u0000${user}`);

            return {
                state,
                user,
                value: summary ? summary.value : null,
                suppressedCount: summary
                    ? summary.suppressedCount
                    : 0,
                hasRecord: Boolean(summary)
            };
        })
    );

    const missingCells = cells.filter(cell =>
        !cell.hasRecord
    ).length;

    const suppressedCells = cells.filter(cell =>
        cell.suppressedCount > 0
    ).length;

    const noteParts = [];

    if (missingCells) {
        noteParts.push(`${missingCells} cell(s) have no record.`);
    }

    if (suppressedCells) {
        noteParts.push(
            `${suppressedCells} cell(s) include suppressed values ` +
            "or are fully suppressed."
        );
    }

    dataNote.hidden = !noteParts.length;

    dataNote.textContent = noteParts.length
        ? `${noteParts.join(" ")} Patterned cells are unknown, not zero.`
        : "";

    const width = chartWidth(container);

    const margin = {
        top: 8,
        right: 18,
        bottom: 80,
        left: 68
    };

    const cellHeight = 30;
    const height =
        margin.top + margin.bottom + states.length * cellHeight;

    const svg = d3.select(container)
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr(
            "aria-label",
            `Heatmap of injury counts by jurisdiction ` +
            `and road-user group for ${year}`
        );

    const patterns = addChartPatterns(
        svg,
        "jurisdiction-heatmap",
        true
    );

    const x = d3.scaleBand()
        .domain(users)
        .range([margin.left, width - margin.right])
        .padding(0.06);

    const y = d3.scaleBand()
        .domain(states)
        .range([margin.top, height - margin.bottom])
        .padding(0.08);

    const maximum = d3.max(cells, cell => cell.value) || 1;

    const rootStyles = getComputedStyle(document.documentElement);

    const color = d3.scaleSequential()
        .domain([0, maximum])
        .interpolator(
            d3.interpolateRgb(
                rootStyles.getPropertyValue("--heat-low").trim(),
                rootStyles.getPropertyValue("--heat-high").trim()
            )
        );

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).tickSize(0))
        .call(axis => axis.select(".domain").remove());

    const columnLabels = {
        "Bus occupant": ["Bus", "occupant"],
        "Car occupant": ["Car", "occupant"],
        "Heavy transport occupant": ["Heavy", "transport"],
        "Motorcyclist": ["Motorcyclist"],
        "Other or unknown": ["Other /", "unknown"],
        "Pedal cyclist": ["Pedal", "cyclist"],
        "Pedestrian": ["Pedestrian"],
        "Pick-up truck or van occupant": ["Pick-up /", "van occupant"]
    };

    svg.append("g")
        .attr("class", "heatmap-column-labels")
        .selectAll("text")
        .data(users)
        .join("text")
        .attr("class", "heatmap-column-label")
        .attr("text-anchor", "middle")
        .attr("x", user => x(user) + x.bandwidth() / 2)
        .attr("y", height - margin.bottom + 20)
        .each(function (user) {
            const text = d3.select(this);

            (columnLabels[user] || [user]).forEach((part, index) => {
                text.append("tspan")
                    .attr("x", x(user) + x.bandwidth() / 2)
                    .attr("dy", index ? "1.2em" : 0)
                    .text(part);
            });
        });

    const cellsGroup = svg.append("g")
        .attr("class", "heatmap-cells");

    const rects = cellsGroup.selectAll(".heatmap-cell")
        .data(cells)
        .join("rect")
        .attr("class", "heatmap-cell focusable-mark")
        .attr("tabindex", 0)
        .attr("role", "img")
        .attr(
            "aria-keyshortcuts",
            "ArrowUp ArrowDown ArrowLeft ArrowRight"
        )
        .attr("x", cell => x(cell.user))
        .attr("y", cell => y(cell.state))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("rx", 2)
        .attr("fill", cell =>
            cell.value === null
                ? `url(#${patterns.partial})`
                : color(cell.value)
        )
        .attr("aria-label", cell => {
            if (!cell.hasRecord) {
                return `${fullStateName(cell.state)}, ${cell.user}: ` +
                    `no record for ${year}`;
            }

            if (cell.value === null) {
                return `${fullStateName(cell.state)}, ${cell.user}: ` +
                    `suppressed for ${year}; value unknown`;
            }

            return `${fullStateName(cell.state)}, ${cell.user}: ` +
                `${numberFormat.format(cell.value)} injuries in ${year}` +
                (
                    cell.suppressedCount
                        ? `; ${cell.suppressedCount} suppressed value(s) also excluded`
                        : ""
                );
        });

    const partialCells = cells.filter(cell =>
        cell.value !== null && cell.suppressedCount > 0
    );

    cellsGroup.selectAll(".heatmap-partial-overlay")
        .data(partialCells)
        .join("rect")
        .attr("class", "heatmap-partial-overlay")
        .attr("x", cell => x(cell.user))
        .attr("y", cell => y(cell.state))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("rx", 2)
        .attr("fill", `url(#${patterns.dots})`)
        .attr("pointer-events", "none");

    attachTooltip(rects, cell => {
        if (!cell.hasRecord) {
            return `${fullStateName(cell.state)} · ${cell.user}: ` +
                `no record for ${year}`;
        }

        if (cell.value === null) {
            return `${fullStateName(cell.state)} · ${cell.user}: ` +
                `suppressed for ${year}; value unknown, not zero`;
        }

        return `${fullStateName(cell.state)} · ${cell.user}: ` +
            `${numberFormat.format(cell.value)} injuries in ${year}` +
            (
                cell.suppressedCount
                    ? ` (known subtotal; ${cell.suppressedCount} suppressed value(s) excluded)`
                    : ""
            );
    });

    animateMarks(rects);
    revealChart(svg);
}

// Matched count and 100% stacked charts.
export function renderStateTrend() {
    const container = document.getElementById("state-trend-chart");
    const empty = document.getElementById("state-trend-empty");
    const context = document.getElementById("state-comparison-context");
    const note = document.getElementById("state-comparison-note");

    if (!container) return;

    clearChart(container);
    container.style.removeProperty("--chart-min-width");

    const year = selectedYear();

    const expectedUsers = [...new Set([
        ...data.national.map(row => row.user),
        ...data.state.map(row => row.user)
    ])].filter(Boolean);

    const states = [...new Set(
        data.state.map(row => row.state).filter(Boolean)
    )].filter(state =>
        !filters.state || state === filters.state
    );

    const yearRows = data.state.filter(row =>
        row.year === year
    );

    // Shares require every expected road-user group.
    const groups = states.map(state => {
        const rows = yearRows.filter(row =>
            row.state === state
        );

        const byUser = d3.group(rows, row => row.user);

        const isComplete = records =>
            Boolean(records?.length) &&
            records.every(row =>
                row.value !== null && !row.suppressed
            );

        const selectedRows = byUser.get(filters.user);

        const value = isComplete(selectedRows)
            ? d3.sum(selectedRows, row => row.value)
            : null;

        const missingGroups = expectedUsers.filter(user =>
            !isComplete(byUser.get(user))
        );

        const total = missingGroups.length === 0
            ? d3.sum(rows, row => row.value)
            : null;

        const share = value !== null && total > 0
            ? value / total
            : null;

        return {
            state,
            value,
            total,
            share,
            missingGroups
        };
    }).sort((a, b) =>
        (b.value ?? -1) - (a.value ?? -1) ||
        a.state.localeCompare(b.state)
    );

    if (context) {
        context.textContent =
            `${filters.user} · ${year || "Unavailable"} · ` +
            "Recorded counts and share of complete state totals";
    }

    const noData = !groups.length || !yearRows.length;

    if (empty) {
        setEmptyState(
            empty,
            "No jurisdiction records match this selection.",
            noData
        );
    }

    if (note) note.textContent = "";
    if (noData) return;

    const incomplete = groups.filter(row =>
        row.total === null
    );

    if (note) {
        note.textContent =
            "Jurisdiction of usual residence, not crash location. " +
            "Counts and shares do not measure individual risk. " +
            (
                incomplete.length
                    ? `Shares are withheld for ${
                        incomplete.map(row => row.state).join(", ")
                    } because at least one road-user group is suppressed or absent.`
                    : "All displayed state totals have complete road-user coverage."
            );
    }

    const legend = d3.select(container)
        .append("div")
        .attr("class", "jurisdiction-pair-key");

    [
        [filters.user, "var(--series-blue)"],
        ["Other road users", "var(--comparison-baseline, #94a3b8)"]
    ].forEach(([label, color]) => {
        const item = legend.append("span");

        item.append("span")
            .attr("class", "jurisdiction-key-swatch")
            .attr("aria-hidden", "true")
            .style("background", color);

        item.append("span").text(label);
    });

    const grid = d3.select(container)
        .append("div")
        .attr("class", "jurisdiction-pair-grid");

    const valueLabel = row =>
        `${fullStateName(row.state)}, ${year}, ${filters.user}: ` +
        (
            row.value === null
                ? "not available; unknown, not zero"
                : `${numberFormat.format(row.value)} recorded hospitalisations`
        );

    const shareLabel = row => {
        if (row.total === null) {
            return `${fullStateName(row.state)}, ${year}: ` +
                "incomplete data; share not calculated. " +
                `Suppressed or absent groups: ${row.missingGroups.join(", ")}.`;
        }

        if (row.share === null) {
            return `${fullStateName(row.state)}, ${year}: ` +
                "no positive complete total; share not calculated.";
        }

        return `${fullStateName(row.state)}, ${year}: ` +
            `${filters.user} ${numberFormat.format(row.value)} of ` +
            `${numberFormat.format(row.total)} cases ` +
            `(${(row.share * 100).toFixed(1)}%); ` +
            `other road users ${numberFormat.format(row.total - row.value)} cases.`;
    };

    ["count", "share"].forEach(kind => {
        const isShare = kind === "share";

        const panel = grid.append("section")
            .attr("class", "jurisdiction-pair-panel");

        const headingId = isShare
            ? "jurisdiction-share-title"
            : "jurisdiction-count-title";

        panel.append("h4")
            .attr("id", headingId)
            .text(isShare ? "Share of total" : "Number of cases");

        panel.append("p")
            .attr("class", "jurisdiction-panel-subtitle")
            .text(
                isShare
                    ? "100% stacked bars · complete totals only"
                    : "Hospitalisations · same state order on both charts"
            );

        const plot = panel.append("div")
            .attr("class", "jurisdiction-plot");

        const width = Math.max(260, panel.node().clientWidth);

        const margin = {
            top: 12,
            right: isShare ? 62 : 74,
            bottom: 54,
            left: 45
        };

        const height =
            margin.top + groups.length * 46 + margin.bottom;

        const maximum = d3.max(groups, row => row.value) || 1;

        const x = d3.scaleLinear()
            .domain(isShare ? [0, 1] : [0, maximum * 1.05])
            .range([margin.left, width - margin.right]);

        if (!isShare) x.nice();

        const y = d3.scaleBand()
            .domain(groups.map(row => row.state))
            .range([margin.top, height - margin.bottom])
            .padding(0.38);

        const svg = plot.append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "group")
            .attr("aria-labelledby", headingId);

        const ticks = isShare
            ? [0, 0.25, 0.5, 0.75, 1]
            : x.ticks(width < 400 ? 3 : 4);

        svg.append("g")
            .attr("class", "grid")
            .attr(
                "transform",
                `translate(0,${height - margin.bottom})`
            )
            .call(
                d3.axisBottom(x)
                    .tickValues(ticks)
                    .tickSize(-(height - margin.top - margin.bottom))
                    .tickFormat("")
            )
            .call(axis => axis.select(".domain").remove());

        svg.append("g")
            .attr("class", "axis")
            .attr(
                "transform",
                `translate(0,${height - margin.bottom})`
            )
            .call(
                d3.axisBottom(x)
                    .tickValues(ticks)
                    .tickSizeOuter(0)
                    .tickFormat(value =>
                        isShare
                            ? `${value * 100}%`
                            : numberFormat.format(value)
                    )
            );

        svg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(${margin.left},0)`)
            .call(
                d3.axisLeft(y)
                    .tickSize(0)
                    .tickPadding(9)
            )
            .call(axis => axis.select(".domain").remove());

        const label = isShare ? shareLabel : valueLabel;

        const marks = svg.append("g")
            .selectAll("g")
            .data(groups)
            .join("g")
            .attr(
                "class",
                `focusable-mark jurisdiction-${kind}-mark`
            )
            .attr("tabindex", 0)
            .attr("role", "img")
            .attr(
                "aria-keyshortcuts",
                "ArrowUp ArrowDown ArrowLeft ArrowRight"
            )
            .attr("aria-label", label)
            .attr(
                "transform",
                row => `translate(0,${y(row.state)})`
            );

        if (isShare) {
            const known = marks.filter(row =>
                row.share !== null
            );

            known.append("rect")
                .attr("class", "jurisdiction-share-other")
                .attr("x", row => x(row.share))
                .attr("y", 0)
                .attr(
                    "width",
                    row => Math.max(0, x(1) - x(row.share))
                )
                .attr("height", y.bandwidth())
                .attr(
                    "fill",
                    "var(--comparison-baseline, #94a3b8)"
                );

            known.append("rect")
                .attr("class", "jurisdiction-share-focused")
                .attr("x", x(0))
                .attr("y", 0)
                .attr(
                    "width",
                    row => Math.max(0, x(row.share) - x(0))
                )
                .attr("height", y.bandwidth())
                .attr("fill", "var(--series-blue)");

            marks.append("text")
                .attr("class", "jurisdiction-bar-label")
                .attr(
                    "x",
                    row => row.share === null
                        ? x(0) + 6
                        : x(1) + 7
                )
                .attr("y", y.bandwidth() / 2)
                .attr("dy", ".35em")
                .text(row => {
                    if (row.share !== null) {
                        return `${(row.share * 100).toFixed(1)}%`;
                    }

                    return row.total === null
                        ? "Incomplete data"
                        : "No recorded cases";
                });
        } else {
            marks.filter(row => row.value !== null)
                .append("rect")
                .attr("class", "jurisdiction-count-bar")
                .attr("x", x(0))
                .attr("y", 0)
                .attr(
                    "width",
                    row => Math.max(0, x(row.value) - x(0))
                )
                .attr("height", y.bandwidth())
                .attr("rx", 2)
                .attr("fill", "var(--series-blue)");

            marks.append("text")
                .attr("class", "jurisdiction-bar-label")
                .attr(
                    "x",
                    row => (
                        row.value === null
                            ? x(0)
                            : x(row.value)
                    ) + 7
                )
                .attr("y", y.bandwidth() / 2)
                .attr("dy", ".35em")
                .text(row =>
                    row.value === null
                        ? "Not available"
                        : numberFormat.format(row.value)
                );
        }

        attachTooltip(marks, label);

        svg.append("text")
            .attr("class", "jurisdiction-axis-title")
            .attr(
                "x",
                (margin.left + width - margin.right) / 2
            )
            .attr("y", height - 9)
            .attr("text-anchor", "middle")
            .text(
                isShare
                    ? "Share of recorded cases (%)"
                    : "Recorded hospitalisations"
            );
    });
}

// First Nations time series.
export function renderFirstNationsTrend() {
    const container = document.getElementById("first-nations-chart");
    const empty = document.getElementById("first-nations-empty");

    clearChart(container);

    const rows = rowsForUser(data.firstNations);

    document.getElementById("first-nations-title").textContent =
        `First Nations · ${filters.user}`;

    const missingCount = rows.filter(row =>
        row.suppressed || row.value === null
    ).length;

    document.getElementById("first-nations-data-note").textContent =
        `${filters.user}: ${missingCount} suppressed or unavailable year(s). ` +
        "No partial totals are connected. " +
        "The jurisdiction and demographic-period filters do not apply to this panel.";

    const allYearly = summarizeRows(rows, row => row.year)
        .map(row => ({
            year: row.key,
            ...row,
            value: row.suppressedCount ? null : row.value
        }))
        .sort((a, b) => a.year - b.year);

    const yearly = allYearly.filter(row =>
        row.value !== null
    );

    if (!yearly.length) {
        setEmptyState(
            empty,
            "No First Nations records match this filter. " +
            "Suppressed values are not zero.",
            true
        );

        return;
    }

    setEmptyState(empty, "", false);

    const width = chartWidth(container);
    const height = 220;

    const margin = {
        top: 14,
        right: 16,
        bottom: 36,
        left: 66
    };

    const minYear = d3.min(allYearly, row => row.year);
    const maxYear = d3.max(allYearly, row => row.year);

    const xDomain = minYear === maxYear
        ? [minYear - 1, maxYear + 1]
        : [minYear, maxYear];

    const svg = d3.select(container)
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr(
            "aria-label",
            `First Nations known hospitalised injury counts, ` +
            `${minYear} to ${maxYear}`
        );

    const patterns = addChartPatterns(svg, "first-nations");

    const x = d3.scaleLinear()
        .domain(xDomain)
        .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
        .domain([
            0,
            (d3.max(yearly, row => row.value) || 1) * 1.08
        ])
        .nice()
        .range([height - margin.bottom, margin.top]);

    addAxes(
        svg,
        x,
        y,
        width,
        height,
        margin,
        "Recorded hospitalisations"
    );

    const line = d3.line()
        .defined(row => row.value !== null)
        .x(row => x(row.year))
        .y(row => y(row.value));

    const nationsLine = svg.append("path")
        .datum(allYearly)
        .attr("class", "series-line")
        .attr("stroke", COLORS.firstNations)
        .attr("stroke-dasharray", "6 3")
        .attr(
            "d",
            d3.line()
                .defined(row => row.value !== null)
                .x(row => x(row.year))
                .y(() => y(0))
        );

    nationsLine.transition("series-enter")
        .duration(reducedMotion.matches ? 0 : 300)
        .attr("d", line);

    const points = svg.selectAll(".first-nations-point")
        .data(yearly)
        .join("circle")
        .attr(
            "class",
            "series-point focusable-mark first-nations-point"
        )
        .attr("tabindex", 0)
        .attr("role", "img")
        .attr(
            "aria-keyshortcuts",
            "ArrowUp ArrowDown ArrowLeft ArrowRight"
        )
        .attr("cx", row => x(row.year))
        .attr("cy", row => y(row.value))
        .attr("r", 4)
        .attr("fill", row =>
            row.suppressedCount
                ? `url(#${patterns.dots})`
                : COLORS.firstNations
        )
        .attr("aria-label", row =>
            `${row.year}: ${numberFormat.format(row.value)} known injuries` +
            (
                row.suppressedCount
                    ? `, ${row.suppressedCount} suppressed categories excluded`
                    : ""
            )
        );

    attachTooltip(points, row =>
        `${row.year}: ${numberFormat.format(row.value)} known injuries` +
        (
            row.suppressedCount
                ? ` (known subtotal; ${row.suppressedCount} suppressed category value(s) excluded)`
                : ""
        )
    );

    animateMarks(points);
    revealChart(svg);
}