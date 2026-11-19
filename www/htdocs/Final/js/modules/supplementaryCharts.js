import { d3, data, filters, rowsForUser, summarizeRows, setEmptyState, chartWidth, addAxes, addChartPatterns, attachTooltip, revealChart, clearChart, COLORS, numberFormat, SERIES_COLORS, reducedMotion, animateMarks } from "./state.js";

let compositionFocus = null;

    export function renderFirstNationsTrend() {
        const container = document.getElementById("first-nations-chart");
        const empty = document.getElementById("first-nations-empty");
        clearChart(container);
        const rows = rowsForUser(data.firstNations);
        document.getElementById("first-nations-title").textContent = `First Nations  |  ${filters.user}`;
        const missingCount = rows.filter((row) => row.suppressed || row.value === null).length;
        document.getElementById("first-nations-data-note").textContent = `${filters.user}: ${missingCount} suppressed or unavailable year(s). No partial totals are connected. The jurisdiction and Step 2 comparison-year filters do not apply to this panel.`;
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

    export function renderRoadUserComposition() {
        const container = document.getElementById("road-user-composition-chart");
        const empty = document.getElementById("road-user-composition-empty");
        if (!container || !empty) return;
        const title = document.getElementById("road-user-composition-title");
        const note = container.parentElement.querySelector(".comparison-note");
        const back = document.getElementById("road-user-composition-back");
        if (back && !back.dataset.listenerBound) {
            back.addEventListener("click", () => {
                compositionFocus = null;
                renderRoadUserComposition();
            });
            back.dataset.listenerBound = "true";
        }
        if (back) back.hidden = !compositionFocus;
        if (title) title.textContent = compositionFocus ? `${compositionFocus} across years` : "Road-user composition across years";
        if (note) note.textContent = compositionFocus
            ? `Annual ${compositionFocus} counts. Suppressed and missing values are left as gaps.`
            : "Stacked annual counts compare the known road-user categories. Years with suppressed category values are left as gaps.";
        clearChart(container);
        const users = [...new Set(data.national.map((row) => row.user))].sort((a, b) => a.localeCompare(b));
        const years = [...new Set(data.national.map((row) => row.year))].sort((a, b) => a - b);
        const lookup = new Map(data.national.map((row) => [`${row.year}|${row.user}`, row]));
        const yearRows = years.map((year) => {
            const rows = users.map((user) => lookup.get(`${year}|${user}`));
            return { year, values: Object.fromEntries(users.map((user, index) => [user,
                rows[index] && !rows[index].suppressed ? rows[index].value : null])) };
        });
        const values = yearRows.filter((row) => users.every((user) => row.values[user] !== null))
            .map((row) => ({ year: row.year, ...row.values }));
        setEmptyState(empty, "No year has complete counts for every road-user category. Suppressed values remain gaps.", !values.length);
        if (compositionFocus && !yearRows.some((row) => row.values[compositionFocus] !== null)) {
            setEmptyState(empty, `No unsuppressed annual counts are available for ${compositionFocus}.`, true);
            return;
        }
        if (compositionFocus) setEmptyState(empty, "", false);
        if (!compositionFocus && !values.length) return;

        const width = chartWidth(container);
        const height = 350;
        const margin = { top: 20, right: 20, bottom: 48, left: 68 };
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img").attr("aria-label", compositionFocus
                ? `Annual national hospitalisations for ${compositionFocus}; suppressed and missing years are gaps`
                : "Stacked annual national hospitalisations by road-user category; incomplete years are gaps");
        const x = d3.scaleBand().domain(years).range([margin.left, width - margin.right]).padding(0.18);
        if (compositionFocus) {
            const focusRows = yearRows.filter((row) => row.values[compositionFocus] !== null)
                .map((row) => ({ year: row.year, value: row.values[compositionFocus] }));
            const y = d3.scaleLinear().domain([0, (d3.max(focusRows, (row) => row.value) || 1) * 1.08]).nice()
                .range([height - margin.bottom, margin.top]);
            addAxes(svg, x, y, width, height, margin, "Hospitalisations");
            const bars = svg.append("g").selectAll("rect").data(focusRows).join("rect")
                .attr("class", "focusable-mark").attr("tabindex", 0).attr("role", "img")
                .attr("x", (row) => x(row.year)).attr("width", x.bandwidth()).attr("y", y(0)).attr("height", 0)
                .attr("fill", SERIES_COLORS[users.indexOf(compositionFocus) % SERIES_COLORS.length])
                .attr("aria-label", (row) => `${row.year}, ${compositionFocus}: ${numberFormat.format(row.value)} hospitalisations`);
            const valueLabels = svg.append("g").attr("class", "composition-drilldown-labels")
                .selectAll("text").data(focusRows).join("text")
                .attr("class", "composition-drilldown-value")
                .attr("data-year", (row) => row.year)
                .attr("x", (row) => x(row.year) + x.bandwidth() / 2)
                .attr("y", height - margin.bottom - 8)
                .attr("text-anchor", "middle")
                .style("opacity", 0)
                .text((row) => numberFormat.format(row.value));
            valueLabels.transition("composition-label-enter").duration(reducedMotion.matches ? 0 : 550)
                .attr("y", (row) => y(row.value) - 8).style("opacity", 1);
            attachTooltip(bars, (row) => `${row.year}: ${compositionFocus}, ${numberFormat.format(row.value)} hospitalisations`);
            const emphasizeValue = (year) => valueLabels.interrupt("composition-value-focus")
                .transition("composition-value-focus").duration(reducedMotion.matches ? 0 : 160)
                .style("opacity", function () { return Number(this.getAttribute("data-year")) === year ? 1 : 0; });
            const restoreValues = () => valueLabels.interrupt("composition-value-focus")
                .transition("composition-value-focus").duration(reducedMotion.matches ? 0 : 180).style("opacity", 1);
            bars.on("pointerenter.composition-values focus.composition-values", (_, row) => emphasizeValue(row.year))
                .on("pointerleave.composition-values blur.composition-values", restoreValues);
            bars.transition("composition-drilldown").duration(reducedMotion.matches ? 0 : 550)
                .attr("y", (row) => y(row.value)).attr("height", (row) => y(0) - y(row.value));
            revealChart(svg);
            return;
        }
        const stacks = d3.stack().keys(users)(values);
        const maximum = d3.max(stacks, (series) => d3.max(series, (point) => point[1])) || 1;
        const y = d3.scaleLinear().domain([0, maximum * 1.08]).nice().range([height - margin.bottom, margin.top]);
        addAxes(svg, x, y, width, height, margin, "Hospitalisations");
        const color = d3.scaleOrdinal().domain(users).range(SERIES_COLORS);
        const layers = svg.append("g").selectAll("g").data(stacks).join("g")
            .attr("fill", (series) => color(series.key)).attr("data-series", (series) => series.key);
        const bars = layers.selectAll("rect").data((series) => series.map((point) => ({
            year: point.data.year, user: series.key, value: point.data[series.key], y0: point[0], y1: point[1]
        }))).join("rect")
            .attr("class", "composition-stack-bar")
            .attr("x", (row) => x(row.year)).attr("width", x.bandwidth())
            .attr("y", y(0)).attr("height", 0).attr("stroke", "var(--surface)").attr("stroke-width", 0.6)
            .attr("tabindex", 0).attr("role", "button")
            .attr("aria-label", (row) => `${row.year}, ${row.user}: ${numberFormat.format(row.value)} hospitalisations`);
        attachTooltip(bars, (row) => `${row.year} · ${row.user}: ${numberFormat.format(row.value)} hospitalisations`);
        const drillToSeries = (row) => {
            compositionFocus = row.user;
            renderRoadUserComposition();
        };
        bars.on("click", (_, row) => drillToSeries(row)).on("keydown", (event, row) => {
            if (!["Enter", " "].includes(event.key)) return;
            event.preventDefault();
            drillToSeries(row);
        });
        bars.transition("composition-enter").duration(reducedMotion.matches ? 0 : 650)
            .attr("y", (row) => y(row.y1)).attr("height", (row) => Math.max(0, y(row.y0) - y(row.y1)));

        const legend = document.createElement("div");
        legend.className = "composition-legend";
        users.forEach((user) => {
            const item = document.createElement("span");
            item.className = "trend-legend-item";
            const swatch = document.createElement("span");
            swatch.className = "composition-swatch";
            swatch.style.backgroundColor = color(user);
            swatch.setAttribute("aria-hidden", "true");
            const label = document.createElement("span");
            label.textContent = user;
            item.append(swatch, label);
            legend.append(item);
        });
        container.append(legend);
        revealChart(svg);
    }
