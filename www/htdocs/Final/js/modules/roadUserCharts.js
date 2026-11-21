import { d3, data, filters, selectedYear, summarizeRows, setEmptyState, chartWidth, addAxes, attachTooltip, revealChart, clearChart, addColorPattern, SERIES_COLORS, numberFormat, reducedMotion, animateMarks, attachSeriesHover, attachBarValueHover } from "./state.js";

    export function signed(value) {
        return `${value > 0 ? "+" : value < 0 ? "-" : ""}${numberFormat.format(Math.abs(value))}`;
    }
    export function percent(value) {
        return `${value > 0 ? "+" : value < 0 ? "-" : ""}${Math.abs(value).toFixed(1)}%`;
    }
    export function nationalCount(year, user) {
        const rows = data.national.filter((row) => row.year === year && (!user || row.user === user));
        return rows.length && rows.every((row) => row.value !== null)
            ? d3.sum(rows, (row) => row.value) : null;
    }
    export function nationalTotal(user = "") {
        const rows = data.national.filter((row) => !user || row.user === user);
        return rows.length && rows.every((row) => row.value !== null) ? d3.sum(rows, (row) => row.value) : null;
    }
    export function shortUser(user) {
        return user === "Pick-up truck or van occupant" ? "Pick-up / van occupant" : user;
    }
    export function updateSummary() {
        const year = selectedYear();
        const allYears = filters.year === "all";
        const national = allYears ? nationalTotal() : nationalCount(year);
        const baseline = nationalCount(2011);
        const start = allYears ? null : nationalCount(2011, filters.user);
        const end = allYears ? nationalTotal(filters.user) : nationalCount(year, filters.user);
        const change = allYears ? end : start !== null && end !== null ? end - start : null;
        const net = allYears ? nationalTotal() : national !== null && baseline !== null ? national - baseline : null;
        document.getElementById("kpi-national").textContent = national === null ? "-" : numberFormat.format(national);
        document.getElementById("kpi-total-label").textContent = `NATIONAL INJURIES | ${allYears ? "2011-2021 TOTAL" : year || "UNAVAILABLE"}`;
        document.getElementById("kpi-national-note").textContent = "All road users  |  all recorded sex categories";
        document.getElementById("kpi-change-label").textContent = allYears
            ? `${filters.user.toUpperCase()} TOTAL | 2011-2021`
            : `${filters.user.toUpperCase()} | CHANGE SINCE 2011`;
        document.getElementById("kpi-latest-year").textContent = allYears ? (change === null ? "-" : numberFormat.format(change)) : change === null || !start ? "-" : percent(change / start * 100);
        document.getElementById("kpi-change-note").textContent = change === null ? "Data unavailable" : allYears ? `${filters.user} cases across 2011-2021` : `${signed(change)} cases | 2011 to ${year}`;
        document.getElementById("kpi-share-label").textContent = allYears ? "SHARE OF NATIONAL TOTAL" : "SHARE OF NATIONAL NET CHANGE";
        document.getElementById("kpi-current-view").textContent = change === null || !net ? "-" : `${(change / net * 100).toFixed(1)}%`;
        document.getElementById("kpi-current-note").textContent = !net
            ? "No national total available for comparison"
            : allYears
                ? `${filters.user} total divided by the national total for 2011-2021`
                : `${filters.user} change divided by national net change; not a share of all cases`;
    }
    export function renderRoadUserBars() {
        const container = document.getElementById("road-user-chart");
        clearChart(container);
        const year = selectedYear();
        const allYears = filters.year === "all";
        const users = [...new Set(data.national.map((row) => row.user))];
        const groups = users.map((user) => {
            const before = nationalCount(2011, user), after = allYears ? nationalTotal(user) : nationalCount(year, user);
            return { user, before, after, change: allYears ? after : before !== null && after !== null ? after - before : null };
        }).filter((row) => row.change !== null).sort((a, b) => b.change - a.change);
        document.getElementById("road-user-chart-unit").textContent = allYears ? "National | 2011-2021 total" : `National | 2011 to ${year}`;
        document.getElementById("road-user-data-note").textContent = allYears
            ? "Car and heavy-transport positions are grouped consistently. Bars show 2011-2021 totals; the largest total is marked with blue hatching and a star."
            : "Car and heavy-transport positions are grouped consistently. Blue bars mark increases, red hatched bars mark decreases, and a star marks the largest increase. Length shows absolute cases, not percentage growth.";
        setEmptyState(document.getElementById("road-user-empty"), "No complete endpoint records available.", !groups.length);
        if (!groups.length) return;
        const width = chartWidth(container), height = 340;
        const margin = { top: 12, right: 62, bottom: 42, left: Math.min(160, width * 0.38) };
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img").attr("aria-label", allYears
                ? "Cumulative hospitalisations from 2011 to 2021 by road-user group"
                : `Change in hospitalisations from 2011 to ${year}, by road-user group`);
        const negativePattern = addColorPattern(svg, "change-negative-pattern", "#c62828", false);
        const topPositive = groups.filter((row) => row.change > 0).sort((a, b) => b.change - a.change)[0];
        const topPositivePattern = addColorPattern(svg, "change-top-positive-pattern", "#0072b2", false);
        const low = Math.min(0, d3.min(groups, (row) => row.change));
        const high = Math.max(0, d3.max(groups, (row) => row.change));
        const x = d3.scaleLinear().domain(low === high ? [-1, 1] : [low * 1.1, high * 1.1]).nice()
            .range([margin.left, width - margin.right]);
        const y = d3.scaleBand().domain(groups.map((row) => row.user)).range([margin.top, height - margin.bottom]).padding(0.3);
        svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(width < 400 ? 3 : 4).tickFormat(d3.format("~s")));
        svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left - 6},0)`)
            .call(d3.axisLeft(y).tickSize(0).tickFormat(shortUser)).call((axis) => axis.select(".domain").remove());
        svg.append("line").attr("class", "zero-line").attr("x1", x(0)).attr("x2", x(0))
            .attr("y1", margin.top).attr("y2", height - margin.bottom);
        const label = (row) => allYears
            ? `${row.user}: ${numberFormat.format(row.change)} hospitalisations across 2011-2021`
            : `${row.user}: ${numberFormat.format(row.before)} in 2011; ${numberFormat.format(row.after)} in ${year}; change ${signed(row.change)} cases`;
        const bars = svg.selectAll(".change-bar").data(groups).join("rect")
            .attr("class", "bar focusable-mark change-bar").attr("tabindex", 0).attr("role", "img")
            .attr("data-mark", (row) => row.user)
            .attr("aria-label", label).attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
            .attr("x", x(0)).attr("y", (row) => y(row.user))
            .attr("width", 0).attr("height", y.bandwidth())
            .attr("fill", (row) => row.change < 0 ? negativePattern : row === topPositive ? topPositivePattern : "#0072b2")
            .attr("stroke", "var(--surface)").attr("stroke-width", 1)
            .attr("opacity", (row) => row.user === filters.user ? 1 : 0.82).attr("rx", 2);
        attachTooltip(bars, label); attachBarValueHover(bars);
        bars.transition("bar-enter").duration(reducedMotion.matches ? 0 : 750)
            .attr("x", (row) => x(Math.min(0, row.change)))
            .attr("width", (row) => Math.max(1, Math.abs(x(row.change) - x(0))));
        animateMarks(bars);
        svg.selectAll(".bar-value").data(groups).join("text").attr("class", "bar-value").attr("data-mark", (row) => row.user)
            .attr("x", (row) => x(row.change) + (row.change < 0 ? -5 : 5))
            .attr("text-anchor", (row) => row.change < 0 ? "end" : "start")
            .attr("y", (row) => y(row.user) + y.bandwidth() / 2 + 4)
            .text((row) => `${allYears ? numberFormat.format(row.change) : signed(row.change)}${row === topPositive ? " \u2605" : ""}`);
        svg.append("text").attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 5)
            .attr("text-anchor", "middle").text(allYears ? "Hospitalisations, 2011-2021 total" : "Change in recorded hospitalisations");
        revealChart(svg);
    }
    export function renderRoadUserTrends() {
        const container = document.getElementById("road-user-trend-chart");
        const legend = document.getElementById("road-user-trend-legend");
        clearChart(container); legend.replaceChildren();
        const allYears = [...new Set(data.national.map((row) => row.year))].sort((a, b) => a - b);
        const baselineYear = filters.year === "all" ? 2011 : selectedYear();
        const series = [{ name: filters.user, user: filters.user, color: "var(--chart-primary)", dash: "" },
            { name: "National", user: "", color: "var(--chart-secondary)", dash: "6 4" }].map((item) => {
            const baseline = nationalCount(baselineYear, item.user);
            return { ...item, values: allYears.filter((year) => year >= baselineYear).map((year) => {
                const count = nationalCount(year, item.user);
                return { year, count, value: baseline > 0 && count !== null ? count / baseline * 100 : null };
            }) };
        });
        document.getElementById("road-user-trend-unit").textContent = `${filters.user} vs National | ${baselineYear} = 100`;
        const values = series.flatMap((item) => item.values).filter((row) => row.value !== null);
        setEmptyState(document.getElementById("road-user-trend-empty"), `A positive ${baselineYear} baseline is required to calculate the index.`, !values.length);
        if (!values.length) return;
        const width = chartWidth(container), height = 340;
        const margin = { top: 18, right: 16, bottom: 40, left: 62 };
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img").attr("aria-label", `${filters.user} and all road users, indexed counts, ${baselineYear} equals 100`);
        const years = series[0].values.map((row) => row.year);
        const x = d3.scaleLinear().domain(d3.extent(years)).range([margin.left, width - margin.right]);
        const y = d3.scaleLinear().domain([0, d3.max(values, (row) => row.value) * 1.12]).nice().range([height - margin.bottom, margin.top]);
        addAxes(svg, x, y, width, height, margin, `Recorded count index  |  ${baselineYear} = 100`);
        svg.append("line").attr("class", "baseline-guide").attr("x1", margin.left).attr("x2", width - margin.right)
            .attr("y1", y(100)).attr("y2", y(100));
        const line = d3.line().defined((row) => row.value !== null).x((row) => x(row.year)).y((row) => y(row.value)).curve(d3.curveLinear);
        const mainSeries = series[0];
        const nationalSeries = series[1];
        const area = d3.area().defined((row) => row.value !== null).x((row) => x(row.year))
            .y0(y(0)).y1((row) => y(row.value)).curve(d3.curveLinear);
        const areaBaseline = d3.area().defined((row) => row.value !== null).x((row) => x(row.year))
            .y0(y(0)).y1(y(0)).curve(d3.curveLinear);
        const areaPath = svg.append("path").datum(mainSeries.values).attr("class", "series-area")
            .attr("data-series", mainSeries.name).attr("fill", mainSeries.color).attr("d", areaBaseline);
        areaPath.transition("series-area-enter").duration(reducedMotion.matches ? 0 : 750).attr("d", area);
        attachSeriesHover(areaPath);
        const trendPath = svg.append("path").datum(nationalSeries.values).attr("class", "series-line")
            .attr("data-series", nationalSeries.name).attr("stroke", nationalSeries.color).attr("stroke-dasharray", nationalSeries.dash)
            .attr("d", d3.line().defined((row) => row.value !== null).x((row) => x(row.year)).y(() => y(0)).curve(d3.curveLinear));
        attachSeriesHover(trendPath);
        trendPath.transition("series-enter").duration(reducedMotion.matches ? 0 : 750).attr("d", line);
        series.forEach((item, index) => {
            const label = (row) => `${row.year}  |  ${item.name}: index ${row.value.toFixed(1)}; ${numberFormat.format(row.count)} cases`;
            const marks = svg.append("g").selectAll("path").data(item.values.filter((row) => row.value !== null)).join("path")
                .attr("class", "series-point focusable-mark").attr("data-series", item.name).attr("tabindex", 0).attr("role", "img")
                .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight").attr("aria-label", label)
                .attr("transform", (row) => `translate(${x(row.year)},${y(row.value)})`)
                .attr("d", d3.symbol().type(index ? d3.symbolSquare : d3.symbolCircle).size(45)()).attr("fill", item.color);
            attachTooltip(marks, label);
            animateMarks(marks);
            svg.append("g").attr("class", "point-values").selectAll("text").data(item.values.filter((row) => row.value !== null)).join("text")
                .attr("class", "point-value").attr("data-series", item.name).attr("x", (row) => x(row.year)).attr("y", (row) => y(row.value) - (index ? 9 : 4))
                .attr("text-anchor", "middle").text((row) => row.value.toFixed(0));
            const entry = document.createElement("span"); entry.className = "trend-legend-item";
            const swatch = document.createElement("span"); swatch.className = `trend-legend-line${index ? "" : " trend-legend-area"}`;
            swatch.style.borderTopColor = item.color; swatch.style.borderTopStyle = index ? "dashed" : "solid";
            if (!index) swatch.style.backgroundColor = item.color;
            swatch.setAttribute("aria-hidden", "true");
            const text = document.createElement("span"); text.className = "trend-legend-label"; text.textContent = item.name;
            entry.append(swatch, text); legend.append(entry);
        });
        revealChart(svg);
    }
