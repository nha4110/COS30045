import {
    d3, data, summarizeRows, setEmptyState, chartWidth,
    numberFormat, attachTooltip, clearChart
} from "./state.js";

export function renderRoadUserSeries() {
    const container = document.getElementById("road-user-series-chart");
    const empty = document.getElementById("road-user-series-empty");
    if (!container) return;
    clearChart(container);

    const years = [2011, 2021];
    const rows = data.national.filter(row => years.includes(row.year));
    const groups = d3.groups(rows, row => row.user).map(([user, records]) => {
        const totals = new Map(
            summarizeRows(records, row => row.year).map(item => [item.key, item])
        );
        const values = years.map(year => {
            const total = totals.get(year);
            return {
                user, year,
                value: total && total.suppressedCount === 0 ? total.value : null
            };
        });
        return { user, values };
    }).sort((a, b) =>
        (b.values[1].value ?? -1) - (a.values[1].value ?? -1) ||
        a.user.localeCompare(b.user)
    );

    if (empty) setEmptyState(empty, "No road-user comparison data is available.", !groups.length);
    if (!groups.length) return;

    const width = Math.max(740, chartWidth(container));
    const margin = { top: 54, right: 80, bottom: 58, left: 210 };
    const height = margin.top + groups.length * 64 + margin.bottom;
    const colors = { 2011: "var(--comparison-baseline, #94a3b8)", 2021: "var(--comparison-current, #0072b2)" };
    const shortNames = { "Pick-up truck or van occupant": "Pick-up / van occupant" };
    const values = groups.flatMap(group => group.values);
    const maximum = d3.max(values, row => row.value) || 1;

    container.style.overflowX = "auto";
    const svg = d3.select(container).append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("class", "road-comparison-svg")
        .attr("role", "img")
        .attr("aria-label", "Recorded national hospitalisations by road-user group, comparing 2011 and 2021");

    const x = d3.scaleLinear().domain([0, maximum * 1.05]).nice()
        .range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(groups.map(group => group.user))
        .range([margin.top, height - margin.bottom]).padding(0.18);
    const pair = d3.scaleBand().domain(years).range([0, y.bandwidth()]).padding(0.12);

    svg.append("g").attr("class", "grid")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(5)
            .tickSize(-(height - margin.top - margin.bottom)).tickFormat(""))
        .call(axis => axis.select(".domain").remove());
    svg.append("g").attr("class", "axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(5).tickSizeOuter(0)
            .tickFormat(value => numberFormat.format(value)))
        .selectAll("text").style("font-size", "14px");
    svg.append("g").attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).tickSize(0).tickPadding(12)
            .tickFormat(user => shortNames[user] || user))
        .call(axis => axis.select(".domain").remove())
        .selectAll("text").style("font-size", "14px");

    const legend = svg.append("g").attr("transform", `translate(${margin.left},18)`);
    years.forEach((year, index) => {
        const item = legend.append("g").attr("transform", `translate(${index * 110},0)`);
        item.append("rect").attr("width", 16).attr("height", 16).attr("fill", colors[year]);
        item.append("text").attr("x", 24).attr("y", 13)
            .style("font-size", "15px").attr("fill", "var(--chart-label, #243f57)")
            .text(year);
    });

    const label = row => `${row.user}, ${row.year}: ` +
        (row.value === null ? "not available; unknown, not zero" :
            `${numberFormat.format(row.value)} recorded hospitalisations`);
    const marks = svg.append("g").selectAll("g").data(values).join("g")
        .attr("class", "focusable-mark paired-mark").attr("tabindex", 0).attr("role", "img")
        .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
        .attr("aria-label", label)
        .attr("transform", row => `translate(0,${y(row.user) + pair(row.year)})`);
    marks.filter(row => row.value !== null).append("rect")
        .attr("class", "paired-bar")
        .attr("x", x(0)).attr("width", row => x(row.value) - x(0))
        .attr("height", pair.bandwidth()).attr("rx", 2)
        .attr("fill", row => colors[row.year]);
    marks.append("text").attr("class", "paired-value")
        .attr("x", row => (row.value === null ? x(0) : x(row.value)) + 8)
        .attr("y", pair.bandwidth() / 2).attr("dy", "0.35em")
        .style("font-size", "14px").style("font-weight", "600")
        .attr("fill", "var(--chart-label, #243f57)")
        .text(row => row.value === null ? "Not available" : numberFormat.format(row.value));
    attachTooltip(marks, label);

    svg.append("text").attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - 10).attr("text-anchor", "middle")
        .style("font-size", "15px").attr("fill", "var(--chart-text, #526779)")
        .text("Recorded hospitalisations");
}
