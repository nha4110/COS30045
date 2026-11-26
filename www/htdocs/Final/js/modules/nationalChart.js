import {
    d3,
    data,
    summarizeRows,
    setEmptyState,
    chartWidth,
    numberFormat,
    annotationLabels,
    attachTooltip,
    revealChart,
    clearChart,
    animateMarks
} from "./state.js";

export function renderNationalTrend() {
    const container = document.getElementById("national-chart");
    const empty = document.getElementById("national-empty");
    clearChart(container);

    const allYearly = summarizeRows(data.national, (row) => row.year)
        .map((row) => ({ year: row.key, ...row }))
        .sort((a, b) => a.year - b.year);

    const yearly = allYearly.filter((row) => row.value !== null);

    if (!yearly.length) {
        setEmptyState(empty, "No national trend data is available.", true);
        return;
    }

    setEmptyState(empty, "", false);

    const width = chartWidth(container);
    const height = 350;
    const margin = { top: 78, right: 32, bottom: 44, left: 72 };

    const minYear = d3.min(allYearly, (row) => row.year);
    const maxYear = d3.max(allYearly, (row) => row.year);

    const rankedYears = yearly.filter((row) => !row.suppressedCount);
    const topYears = new Set(
        [...rankedYears]
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)
            .map((row) => row.year)
    );

    const svg = d3.select(container)
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr(
            "aria-label",
            `Line chart of national recorded hospitalisations by year, ${minYear} to ${maxYear}; the five highest years have larger outlined markers`
        );

    const x = d3.scaleLinear()
        .domain(
            minYear === maxYear
                ? [minYear - 1, maxYear + 1]
                : [minYear, maxYear]
        )
        .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
        .domain([0, (d3.max(yearly, (row) => row.value) || 1) * 1.12])
        .nice()
        .range([height - margin.bottom, margin.top]);

    const tickStep = Math.max(
        1,
        Math.ceil(
            (maxYear - minYear) /
            Math.max(
                1,
                Math.floor((width - margin.left - margin.right) / 65)
            )
        )
    );

    const tickYears = allYearly
        .map((row) => row.year)
        .filter(
            (year) =>
                (year - minYear) % tickStep === 0 ||
                year === maxYear
        );

    svg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3.axisLeft(y)
                .ticks(5)
                .tickSize(-(width - margin.left - margin.right))
                .tickFormat("")
        );

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(
            d3.axisBottom(x)
                .tickValues(tickYears)
                .tickFormat(d3.format("d"))
        );

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3.axisLeft(y)
                .ticks(5)
                .tickFormat((value) => numberFormat.format(value))
        );

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + height - margin.bottom) / 2)
        .attr("y", 15)
        .attr("text-anchor", "middle")
        .text("Hospitalised injuries");

    Object.entries(annotationLabels).forEach(([yearText, note], index) => {
        const year = Number(yearText);
        const row = yearly.find((item) => item.year === year);

        if (!row) return;

        const center = x(year);

        const group = svg.append("g")
            .attr("class", "focusable-mark annotation-group")
            .attr("tabindex", 0)
            .attr("role", "img")
            .attr(
                "aria-keyshortcuts",
                "ArrowUp ArrowDown ArrowLeft ArrowRight"
            )
            .attr("aria-label", `${year}: ${note}`);

        group.append("line")
            .attr("class", "annotation-line")
            .attr("x1", center)
            .attr("x2", center)
            .attr("y1", margin.top - 12)
            .attr("y2", height - margin.bottom);

        const annotationX = Math.max(
            margin.left,
            Math.min(width - margin.right, center)
        );

        group.append("text")
            .attr("class", "annotation-label")
            .attr("x", annotationX)
            .attr("y", index ? 44 : 24)
            .attr(
                "text-anchor",
                width < 600 ? (index ? "end" : "start") : "middle"
            )
            .text(
                index
                    ? "NEW SOUTH WALES: JUN 2017"
                    : "VICTORIA: 2012"
            );

        attachTooltip(
            group,
            () => `${year}: ${note}. Interpret the series break with care.`
        );
    });

    // Leave a gap where an annual total is missing.
    const byYear = new Map(
        allYearly.map((row) => [row.year, row])
    );

    const series = d3.range(minYear, maxYear + 1)
        .map((year) => byYear.get(year) || { year, value: null });

    const line = d3.line()
        .defined((row) => row.value !== null)
        .x((row) => x(row.year))
        .y((row) => y(row.value));

    svg.append("path")
        .datum(series)
        .attr("class", "series-line national-line")
        .attr("fill", "none")
        .attr("stroke", "var(--chart-primary)")
        .attr("stroke-width", 3)
        .attr("d", line);

    const label = (row) =>
        `${row.year}: ${numberFormat.format(row.value)} hospitalised injuries nationally` +
        (topYears.has(row.year)
            ? "; one of the five highest years"
            : "") +
        (row.suppressedCount
            ? `; known subtotal, ${row.suppressedCount} suppressed or missing values excluded`
            : "");

    const points = svg.selectAll(".national-point")
        .data(yearly)
        .join("circle")
        .attr(
            "class",
            (row) =>
                `series-point focusable-mark national-point${
                    topYears.has(row.year) ? " is-top-year" : ""
                }`
        )
        .attr("tabindex", 0)
        .attr("role", "img")
        .attr("data-mark", (row) => row.year)
        .attr(
            "aria-keyshortcuts",
            "ArrowUp ArrowDown ArrowLeft ArrowRight"
        )
        .attr("aria-label", label)
        .attr("cx", (row) => x(row.year))
        .attr("cy", (row) => y(row.value))
        .attr("r", (row) => topYears.has(row.year) ? 6 : 4.5)
        .attr(
            "fill",
            (row) => topYears.has(row.year)
                ? "var(--surface)"
                : "var(--chart-primary)"
        )
        .attr(
            "stroke",
            (row) => topYears.has(row.year)
                ? "var(--series-orange)"
                : "var(--surface)"
        )
        .attr(
            "stroke-width",
            (row) => topYears.has(row.year) ? 2.5 : 1.6
        );

    attachTooltip(points, label);
    animateMarks(points);

    const labelledYears = width < 700
        ? yearly.filter(
            (row) => row.year === minYear || row.year === maxYear
        )
        : yearly;

    svg.selectAll(".national-value")
        .data(labelledYears)
        .join("text")
        .attr("class", "bar-value national-value")
        .attr("x", (row) => x(row.year))
        .attr("y", (row) => y(row.value) - 13)
        .attr(
            "text-anchor",
            (row) => row.year === minYear
                ? "start"
                : row.year === maxYear
                    ? "end"
                    : "middle"
        )
        .attr("pointer-events", "none")
        .text((row) => numberFormat.format(row.value));

    revealChart(svg);
}