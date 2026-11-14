import { d3, data, filters, selectedYear, summarizeRows, setEmptyState, chartWidth, addAxes, attachTooltip, revealChart, clearChart, addColorPattern, SERIES_COLORS, numberFormat, reducedMotion, animateMarks } from "./state.js";

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
    export function shortUser(user) {
        return user === "Pick-up truck or van occupant" ? "Pick-up / van occupant" : user;
    }
    export function updateSummary() {
        const year = selectedYear();
        const national = nationalCount(year);
        const baseline = nationalCount(2011);
        const start = nationalCount(2011, filters.user);
        const end = nationalCount(year, filters.user);
        const change = start !== null && end !== null ? end - start : null;
        const net = national !== null && baseline !== null ? national - baseline : null;
        document.getElementById("kpi-national").textContent = national === null ? "-" : numberFormat.format(national);
        document.getElementById("kpi-total-label").textContent = `NATIONAL INJURIES  ·  ${year || "UNAVAILABLE"}`;
        document.getElementById("kpi-national-note").textContent = "All road users  ·  all recorded sex categories";
        document.getElementById("kpi-change-label").textContent = `${filters.user.toUpperCase()}  ·  CHANGE SINCE 2011`;
        document.getElementById("kpi-latest-year").textContent = change === null || !start ? "-" : percent(change / start * 100);
        document.getElementById("kpi-change-note").textContent = change === null ? "Endpoint data unavailable" : `${signed(change)} cases  ·  2011 to ${year}`;
        document.getElementById("kpi-current-view").textContent = change === null || !net ? "-" : `${(change / net * 100).toFixed(1)}%`;
        document.getElementById("kpi-current-note").textContent = !net
            ? "No national net change to divide by"
            : `${filters.user} change divided by national net change; not a share of all cases`;
    }
    export function renderRoadUserBars() {
        const container = document.getElementById("road-user-chart");
        clearChart(container);
        const year = selectedYear();
        const users = [...new Set(data.national.map((row) => row.user))];
        const groups = users.map((user) => {
            const before = nationalCount(2011, user), after = nationalCount(year, user);
            return { user, before, after, change: before !== null && after !== null ? after - before : null };
        }).filter((row) => row.change !== null).sort((a, b) => b.change - a.change);
        document.getElementById("road-user-chart-unit").textContent = `National  ·  2011  to  ${year}`;
        document.getElementById("road-user-data-note").textContent = "The focused group is blue. Other increases are grey and other decreases orange. Values show changes in recorded cases, not changes in risk.";
        setEmptyState(document.getElementById("road-user-empty"), "No complete endpoint records available.", !groups.length);
        if (!groups.length) return;
        const width = chartWidth(container), height = 340;
        const margin = { top: 12, right: 62, bottom: 42, left: Math.min(160, width * 0.38) };
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img").attr("aria-label", `Change in hospitalisations from 2011 to ${year}, by road-user group`);
        const low = Math.min(0, d3.min(groups, (row) => row.change));
        const high = Math.max(0, d3.max(groups, (row) => row.change));
        const x = d3.scaleLinear().domain(low === high ? [-1, 1] : [low * 1.1, high * 1.1]).nice()
            .range([margin.left, width - margin.right]);
        const y = d3.scaleBand().domain(groups.map((row) => row.user)).range([margin.top, height - margin.bottom]).padding(0.3);
        svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
            .call(low === high ? d3.axisBottom(x).tickValues([-1, 0, 1]).tickFormat(d3.format("d")) : d3.axisBottom(x).ticks(width < 400 ? 3 : 4).tickFormat(d3.format("~s")));
        svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left - 6},0)`)
            .call(d3.axisLeft(y).tickSize(0).tickFormat(shortUser)).call((axis) => axis.select(".domain").remove());
        svg.append("line").attr("class", "zero-line").attr("x1", x(0)).attr("x2", x(0))
            .attr("y1", margin.top).attr("y2", height - margin.bottom);
        const label = (row) => `${row.user}: ${numberFormat.format(row.before)} in 2011; ${numberFormat.format(row.after)} in ${year}; change ${signed(row.change)} cases`;
        const bars = svg.selectAll(".change-bar").data(groups).join("rect")
            .attr("class", "bar focusable-mark change-bar").attr("tabindex", 0).attr("role", "img")
            .attr("aria-label", label).attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
            .attr("x", x(0)).attr("y", (row) => y(row.user))
            .attr("width", 0).attr("height", y.bandwidth())
            .attr("fill", row => row.user === filters.user ? "var(--chart-primary)" : row.change < 0 ? "var(--chart-secondary)" : "var(--series-grey)")
            .attr("stroke", "var(--surface)").attr("stroke-width", 1)
            .attr("opacity", 1).attr("rx", 2);
        attachTooltip(bars, label);
        bars.transition("bar-enter").duration(reducedMotion.matches ? 0 : 300)
            .attr("x", (row) => x(Math.min(0, row.change)))
            .attr("width", (row) => Math.abs(x(row.change) - x(0)));
        animateMarks(bars);
        svg.selectAll(".bar-value").data(groups).join("text").attr("class", "bar-value")
            .attr("x", (row) => x(Math.max(0, row.change)) + 5)
            .attr("text-anchor", "start")
            .attr("y", (row) => y(row.user) + y.bandwidth() / 2 + 4).text((row) => signed(row.change));
        svg.append("text").attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 5)
            .attr("text-anchor", "middle").text("Change in recorded hospitalisations");
        revealChart(svg);
    }
    export function renderRoadUserTrends() {
        const container = document.getElementById("road-user-trend-chart");
        const legend = document.getElementById("road-user-trend-legend");
        clearChart(container); legend.replaceChildren();
        const years = [...new Set(data.national.map((row) => row.year))].sort((a, b) => a - b);
        const series = [{ name: filters.user, user: filters.user, color: "var(--chart-primary)", dash: "" },
            { name: "All road users", user: "", color: "var(--chart-secondary)", dash: "6 4" }].map((item) => {
            const baseline = nationalCount(2011, item.user);
            return { ...item, values: years.map((year) => {
                const count = nationalCount(year, item.user);
                return { year, count, value: baseline > 0 && count !== null ? count / baseline * 100 : null };
            }) };
        });
        document.getElementById("road-user-trend-unit").textContent = `${filters.user} vs national  ·  2011 = 100`;
        const values = series.flatMap((item) => item.values).filter((row) => row.value !== null);
        setEmptyState(document.getElementById("road-user-trend-empty"), "A positive 2011 baseline is required to calculate the index.", !values.length);
        if (!values.length) return;
        const width = chartWidth(container), height = 340;
        const margin = { top: 18, right: 16, bottom: 40, left: 62 };
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img").attr("aria-label", `${filters.user} and all road users, indexed counts, 2011 equals 100`);
        const x = d3.scaleLinear().domain(d3.extent(years)).range([margin.left, width - margin.right]);
        const y = d3.scaleLinear().domain([0, d3.max(values, (row) => row.value) * 1.12]).nice().range([height - margin.bottom, margin.top]);
        addAxes(svg, x, y, width, height, margin, "Index (2011 = 100)");
        svg.append("line").attr("class", "baseline-guide").attr("x1", margin.left).attr("x2", width - margin.right)
            .attr("y1", y(100)).attr("y2", y(100));
        const line = d3.line().defined((row) => row.value !== null).x((row) => x(row.year)).y((row) => y(row.value));
        series.forEach((item, index) => {
            const trendPath = svg.append("path").datum(item.values).attr("class", "series-line").attr("stroke", item.color)
                .attr("stroke-dasharray", item.dash)
                .attr("d", d3.line().defined((row) => row.value !== null).x((row) => x(row.year)).y(() => y(0)));
            trendPath.transition("series-enter").duration(reducedMotion.matches ? 0 : 300).attr("d", line);
            const label = (row) => `${row.year}  ·  ${item.name}: index ${row.value.toFixed(1)}; ${numberFormat.format(row.count)} cases`;
            const marks = svg.append("g").selectAll("path").data(item.values.filter((row) => row.value !== null)).join("path")
                .attr("class", "series-point focusable-mark").attr("tabindex", 0).attr("role", "img")
                .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight").attr("aria-label", label)
                .attr("transform", (row) => `translate(${x(row.year)},${y(row.value)})`)
                .attr("d", d3.symbol().type(index ? d3.symbolSquare : d3.symbolCircle).size(45)()).attr("fill", item.color);
            attachTooltip(marks, label);
            animateMarks(marks);
            const entry = document.createElement("span"); entry.className = "trend-legend-item";
            const swatch = document.createElement("span"); swatch.className = "trend-legend-line";
            swatch.style.borderTopColor = item.color; swatch.style.borderTopStyle = index ? "dashed" : "solid";
            swatch.setAttribute("aria-hidden", "true");
            const text = document.createElement("span"); text.className = "trend-legend-label"; text.textContent = item.name;
            entry.append(swatch, text); legend.append(entry);
        });
        revealChart(svg);
    }
