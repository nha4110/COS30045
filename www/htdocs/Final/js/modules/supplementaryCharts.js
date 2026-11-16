import { d3, data, filters, rowsForUser, summarizeRows, setEmptyState, chartWidth, addAxes, addChartPatterns, attachTooltip, revealChart, clearChart, COLORS, numberFormat, SERIES_COLORS, SERIES_DASHES, SERIES_SYMBOLS, fullStateName, reducedMotion, animateMarks, attachSeriesHover } from "./state.js";

    export function renderRoadUserSeries() {
        const container = document.getElementById("road-user-series-chart");
        const empty = document.getElementById("road-user-series-empty");
        clearChart(container);
        const years = [...new Set(data.national.map((row) => row.year))].sort((a, b) => a - b);
        const users = [...new Set(data.national.map((row) => row.user))].sort((a, b) => a.localeCompare(b));
        const series = users.map((user) => {
            const rows = data.national.filter((row) => row.user === user);
            const byYear = new Map(rows.map((row) => [row.year, row]));
            return { user, values: years.map((year) => ({ year, ...(byYear.get(year) || { value: null, suppressed: false }) })) };
        }).filter((item) => item.values.some((row) => row.value !== null));
        setEmptyState(empty, "No complete road-user series are available.", !series.length);
        if (!series.length) return;
        const width = chartWidth(container), height = 330;
        const margin = { top: 18, right: 18, bottom: 40, left: 64 };
        const maxYear = d3.max(years), minYear = d3.min(years);
        const x = d3.scaleLinear().domain(minYear === maxYear ? [minYear - 1, maxYear + 1] : [minYear, maxYear]).range([margin.left, width - margin.right]);
        const y = d3.scaleLinear().domain([0, d3.max(series, (item) => d3.max(item.values, (row) => row.value || 0)) * 1.08]).nice().range([height - margin.bottom, margin.top]);
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
            .attr("aria-label", `Annual national hospitalisations by road-user group, ${minYear} to ${maxYear}`);
        addAxes(svg, x, y, width, height, margin, "Hospitalisations");
        const line = d3.line().defined((row) => row.value !== null).x((row) => x(row.year)).y((row) => y(row.value));
        const legend = document.createElement("div"); legend.className = "series-legend"; legend.setAttribute("aria-label", "Road-user series key");
        series.forEach((item, index) => {
            const color = SERIES_COLORS[index % SERIES_COLORS.length], dash = SERIES_DASHES[index % SERIES_DASHES.length];
            const seriesPath = svg.append("path").datum(item.values).attr("class", "series-line").attr("data-series", item.user).attr("stroke", color).attr("stroke-dasharray", dash)
                .attr("aria-label", `${item.user} annual national counts`)
                .attr("d", d3.line().defined((row) => row.value !== null).x((row) => x(row.year)).y(() => y(0)));
            seriesPath.transition("series-enter").duration(reducedMotion.matches ? 0 : 750).attr("d", line);
            attachSeriesHover(seriesPath);
            const marks = svg.append("g").selectAll(".series-mark").data(item.values.filter((row) => row.value !== null)).join("path")
                .attr("class", "series-point focusable-mark series-mark").attr("data-series", item.user).attr("tabindex", 0).attr("role", "img")
                .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
                .attr("aria-label", (row) => `${row.year}, ${item.user}: ${numberFormat.format(row.value)} recorded hospitalisations`)
                .attr("transform", (row) => `translate(${x(row.year)},${y(row.value)})`)
                .attr("d", d3.symbol().type(SERIES_SYMBOLS[index % SERIES_SYMBOLS.length]).size(44)())
                .attr("fill", color).attr("stroke", "var(--surface)");
            attachTooltip(marks, (row) => `${row.year}  |  ${item.user}: ${numberFormat.format(row.value)} recorded hospitalisations`);
            animateMarks(marks);
            svg.append("g").attr("class", "point-values").selectAll("text").data(item.values.filter((row) => row.value !== null)).join("text")
                .attr("class", "point-value").attr("data-series", item.user).attr("x", (row) => x(row.year)).attr("y", (row) => y(row.value) - 7)
                .attr("text-anchor", "middle").text((row) => numberFormat.format(row.value));
            const key = document.createElement("span"); key.className = "series-legend-item";
            const swatch = document.createElement("span"); swatch.className = "series-legend-line"; swatch.style.borderTopColor = color;
            swatch.style.borderTopStyle = dash ? "dashed" : "solid"; swatch.setAttribute("aria-hidden", "true");
            const label = document.createElement("span"); label.textContent = item.user; key.append(swatch, label); legend.append(key);
        });
        container.append(legend);
        revealChart(svg);
    }
    export function renderStateTrend() {
        const container = document.getElementById("state-trend-chart");
        const empty = document.getElementById("state-trend-empty");
        clearChart(container);
        const years = [...new Set(data.state.map((row) => row.year))].sort((a, b) => a - b);
        const states = [...new Set(data.state.map((row) => row.state).filter(Boolean))]
            .filter((state) => !filters.state || state === filters.state).sort((a, b) => a.localeCompare(b));
        const series = states.map((state) => {
            const rows = data.state.filter((row) => row.state === state && row.user === filters.user);
            const yearly = d3.rollups(rows, (group) => {
                if (group.some((row) => row.value === null || row.suppressed)) return null;
                return d3.sum(group, (row) => row.value);
            }, (row) => row.year);
            const map = new Map(yearly);
            return { state, values: years.map((year) => ({ year, value: map.get(year) ?? null })) };
        }).filter((item) => item.values.some((row) => row.value !== null));
        setEmptyState(empty, "No jurisdiction trend records match this selection.", !series.length);
        if (!series.length) return;
        const width = chartWidth(container), height = 300;
        const margin = { top: 18, right: 12, bottom: 40, left: 66 };
        const x = d3.scaleLinear().domain(d3.extent(years)).range([margin.left, width - margin.right]);
        const y = d3.scaleLinear().domain([0, d3.max(series, (item) => d3.max(item.values, (row) => row.value || 0)) * 1.08]).nice().range([height - margin.bottom, margin.top]);
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
            .attr("aria-label", `${filters.user} hospitalisations by jurisdiction, ${years[0]} to ${years[years.length - 1]}`);
        addAxes(svg, x, y, width, height, margin, "Hospitalisations");
        const line = d3.line().defined((row) => row.value !== null).x((row) => x(row.year)).y((row) => y(row.value));
        series.forEach((item, index) => {
            const color = SERIES_COLORS[index % SERIES_COLORS.length], dash = SERIES_DASHES[index % SERIES_DASHES.length];
            const seriesPath = svg.append("path").datum(item.values).attr("class", "series-line").attr("data-series", item.state).attr("stroke", color).attr("stroke-dasharray", dash)
                .attr("aria-label", `${fullStateName(item.state)} jurisdiction trend`)
                .attr("d", d3.line().defined((row) => row.value !== null).x((row) => x(row.year)).y(() => y(0)));
            seriesPath.transition("series-enter").duration(reducedMotion.matches ? 0 : 750).attr("d", line);
            attachSeriesHover(seriesPath);
            const marks = svg.append("g").selectAll(".state-trend-mark").data(item.values.filter((row) => row.value !== null)).join("path")
                .attr("class", "series-point focusable-mark state-trend-mark").attr("data-series", item.state).attr("tabindex", 0).attr("role", "img")
                .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
                .attr("aria-label", (row) => `${row.year}, ${fullStateName(item.state)}, ${filters.user}: ${numberFormat.format(row.value)} injuries`)
                .attr("transform", (row) => `translate(${x(row.year)},${y(row.value)})`)
                .attr("d", d3.symbol().type(SERIES_SYMBOLS[index % SERIES_SYMBOLS.length]).size(40)()).attr("fill", color);
            attachTooltip(marks, (row) => `${row.year}  |  ${fullStateName(item.state)}  |  ${filters.user}: ${numberFormat.format(row.value)} injuries`);
            animateMarks(marks);
            svg.append("g").attr("class", "point-values").selectAll("text").data(item.values.filter((row) => row.value !== null)).join("text")
                .attr("class", "point-value").attr("data-series", item.state).attr("x", (row) => x(row.year)).attr("y", (row) => y(row.value) - 7 - index % 2 * 10)
                .attr("text-anchor", "middle").text((row) => numberFormat.format(row.value));
        });
        revealChart(svg);
    }
    export function renderFirstNationsTrend() {
        const container = document.getElementById("first-nations-chart");
        const empty = document.getElementById("first-nations-empty");
        clearChart(container);
        const rows = rowsForUser(data.firstNations);
        document.getElementById("first-nations-title").textContent = `First Nations  |  ${filters.user}`;
        const missingCount = rows.filter((row) => row.suppressed || row.value === null).length;
        document.getElementById("first-nations-data-note").textContent = `${filters.user}: ${missingCount} suppressed or unavailable year(s). No partial totals are connected. The jurisdiction and Step 2 year filters do not apply to this panel.`;
        const allYearly = summarizeRows(rows, (row) => row.year)
            .map((row) => ({ year: row.key, ...row, value: row.suppressedCount ? null : row.value }))
            .sort((a, b) => a.year - b.year);
        const yearly = allYearly.filter((row) => row.value !== null);

        if (!yearly.length) {
            setEmptyState(empty, "No First Nations records match this filter. Suppressed values are not zero.", true);
            return;
        }
        setEmptyState(empty, "", false);

        const width = chartWidth(container);
        const height = 220;
        const margin = { top: 14, right: 16, bottom: 36, left: 66 };
        const minYear = d3.min(allYearly, (row) => row.year);
        const maxYear = d3.max(allYearly, (row) => row.year);
        const xDomain = minYear === maxYear ? [minYear - 1, maxYear + 1] : [minYear, maxYear];
        const svg = d3.select(container).append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", `First Nations known hospitalised injury counts, ${minYear} to ${maxYear}`);
        const patterns = addChartPatterns(svg, "first-nations");
        const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]);
        const y = d3.scaleLinear()
            .domain([0, (d3.max(yearly, (row) => row.value) || 1) * 1.08])
            .nice()
            .range([height - margin.bottom, margin.top]);
        addAxes(svg, x, y, width, height, margin, "Recorded hospitalisations");
        const line = d3.line()
            .defined((row) => row.value !== null)
            .x((row) => x(row.year))
            .y((row) => y(row.value));
        const nationsLine = svg.append("path")
            .datum(allYearly)
            .attr("class", "series-line")
            .attr("data-series", "first-nations")
            .attr("stroke", COLORS.firstNations)
            .attr("stroke-dasharray", "6 3")
            .attr("d", d3.line().defined((row) => row.value !== null).x((row) => x(row.year)).y(() => y(0)));
        nationsLine.transition("series-enter").duration(reducedMotion.matches ? 0 : 750).attr("d", line);
        const points = svg.selectAll(".first-nations-point")
            .data(yearly)
            .join("circle")
            .attr("class", "series-point focusable-mark first-nations-point")
            .attr("data-series", "first-nations")
            .attr("tabindex", 0)
            .attr("role", "img")
            .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
            .attr("cx", (row) => x(row.year))
            .attr("cy", (row) => y(row.value))
            .attr("r", 4)
            .attr("fill", (row) => row.suppressedCount ? `url(#${patterns.dots})` : COLORS.firstNations)
            .attr("aria-label", (row) => `${row.year}: ${numberFormat.format(row.value)} known injuries${row.suppressedCount ? `, ${row.suppressedCount} suppressed categories excluded` : ""}`);
        attachTooltip(points, (row) =>
            `${row.year}: ${numberFormat.format(row.value)} known injuries` +
            (row.suppressedCount ? ` (known subtotal; ${row.suppressedCount} suppressed category value(s) excluded)` : "")
        );
        animateMarks(points);
        svg.append("g").attr("class", "point-values").selectAll("text").data(yearly).join("text")
            .attr("class", "point-value").attr("data-series", "first-nations").attr("x", (row) => x(row.year)).attr("y", (row) => y(row.value) - 8)
            .attr("text-anchor", "middle").text((row) => numberFormat.format(row.value));
        revealChart(svg);
    }
