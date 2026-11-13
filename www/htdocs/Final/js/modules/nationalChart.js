import { d3, data, summarizeRows, setEmptyState, chartWidth, numberFormat, annotationLabels, attachTooltip, revealChart, clearChart, reducedMotion, animateMarks } from "./state.js";

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

        const width = chartWidth(container), height = 330;
        const margin = { top: 58, right: 20, bottom: 44, left: 72 };
        const minYear = d3.min(allYearly, (row) => row.year), maxYear = d3.max(allYearly, (row) => row.year);
        const rankedYears = yearly.filter((row) => !row.suppressedCount);
        const topYears = new Set([...rankedYears].sort((a, b) => b.value - a.value).slice(0, 5).map((row) => row.year));
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img").attr("aria-label", `National recorded hospitalisations by year, ${minYear} to ${maxYear}; top five years highlighted`);
        const defs = svg.append("defs");
        const pattern = defs.append("pattern").attr("id", "national-top-five-pattern").attr("patternUnits", "userSpaceOnUse").attr("width", 8).attr("height", 8);
        pattern.append("rect").attr("width", 8).attr("height", 8).attr("fill", "var(--series-orange)");
        pattern.append("path").attr("d", "M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4").attr("fill", "none")
            .attr("stroke", "var(--pattern-contrast)").attr("stroke-width", 2);
        const x = d3.scaleBand().domain(allYearly.map((row) => row.year).sort(d3.ascending))
            .range([margin.left, width - margin.right]).padding(0.18);
        const y = d3.scaleLinear().domain([0, (d3.max(yearly, (row) => row.value) || 1) * 1.08]).nice()
            .range([height - margin.bottom, margin.top]);
        svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).tickFormat(d3.format("d")));
        svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).ticks(5).tickFormat((value) => numberFormat.format(value)));
        svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat("" )).lower();
        svg.append("text").attr("transform", "rotate(-90)").attr("x", -(height / 2)).attr("y", 15)
            .attr("text-anchor", "middle").text("Hospitalised injuries");

        Object.entries(annotationLabels).forEach(([yearText, note], index) => {
            const year = Number(yearText), row = yearly.find((item) => item.year === year);
            if (!row || !x(year)) return;
            const center = x(year) + x.bandwidth() / 2;
            const group = svg.append("g").attr("class", "focusable-mark annotation-group").attr("tabindex", 0)
                .attr("role", "img").attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
                .attr("aria-label", `${year}: ${note}`);
            group.append("line").attr("class", "annotation-line").attr("x1", center).attr("x2", center)
                .attr("y1", margin.top + 23).attr("y2", height - margin.bottom);
            group.append("text").attr("class", "annotation-label").attr("x", center)
                .attr("y", margin.top + (index ? 16 : 6)).attr("text-anchor", "middle")
                .text(index ? "NEW SOUTH WALES: JUN 2017" : "VICTORIA: 2012");
            attachTooltip(group, () => `${year}: ${note}. Interpret the series break with care.`);
        });
        const label = (row) => `${row.year}: ${numberFormat.format(row.value)} hospitalised injuries nationally` +
            (topYears.has(row.year) ? "; one of the five highest years" : "") +
            (row.suppressedCount ? `; known subtotal, ${row.suppressedCount} suppressed or missing values excluded` : "");
        const bars = svg.selectAll(".national-bar").data(yearly).join("rect")
            .attr("class", "bar focusable-mark national-bar").attr("tabindex", 0).attr("role", "img")
            .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight").attr("aria-label", label)
            .attr("x", (row) => x(row.year)).attr("y", y(0))
            .attr("width", x.bandwidth()).attr("height", 0).attr("rx", 3)
            .attr("fill", (row) => topYears.has(row.year) ? "url(#national-top-five-pattern)" : "var(--chart-primary)")
            .attr("stroke", (row) => topYears.has(row.year) ? "var(--series-orange)" : "var(--surface)").attr("stroke-width", 1.5);
        attachTooltip(bars, label);
        bars.transition("bar-enter").duration(reducedMotion.matches ? 0 : 750)
            .attr("y", (row) => y(row.value)).attr("height", (row) => y(0) - y(row.value));
        animateMarks(bars);
        revealChart(svg);
    }
