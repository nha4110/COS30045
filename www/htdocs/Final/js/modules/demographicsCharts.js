import {
    d3, data, filters, numberFormat, chartWidth, clearChart, reducedMotion, attachSeriesHover
} from "./state.js";

const AGE_GROUPS = ["0-7", "8-16", "17-25", "26-39", "40-64", "65-74", "75+"];
const SEXES = ["Male", "Female"];
const duration = (milliseconds) => reducedMotion.matches ? 0 : milliseconds;
let chartSequence = 0;

function cyclistRows() {
    return data.demographic.filter((row) => row.user.toLowerCase() === "pedal cyclist" &&
        (!filters.demographicYear || row.year === Number(filters.demographicYear)));
}

function rowsForSex(sex) {
    return cyclistRows().filter((row) => row.sex.toLowerCase() === sex.toLowerCase());
}

function sumKnown(rows) {
    if (!rows.length || rows.some((row) => row.value === null || row.suppressed)) return null;
    return d3.sum(rows, (row) => row.value);
}

function countLabel(value) {
    return value === null ? "Unknown" : numberFormat.format(value);
}

export function renderAgeSexTrajectory() {
    const container = document.getElementById("age-sex-trajectory-chart");
    if (!container) return;
    clearChart(container);

    const values = SEXES.flatMap((sex) => AGE_GROUPS.map((age) => {
        const rows = cyclistRows().filter((row) => row.sex.toLowerCase() === sex.toLowerCase() && row.age === age);
        return { sex, age, value: sumKnown(rows) };
    }));
    const width = chartWidth(container);
    const height = 410;
    const margin = { top: 52, right: 48, bottom: 62, left: 88 };
    const x = d3.scalePoint().domain(AGE_GROUPS).range([margin.left, width - margin.right]).padding(0.3);
    const maximum = d3.max(values, (d) => d.value || 0) || 1;
    const y = d3.scaleLinear().domain([0, maximum * 1.2]).nice().range([height - margin.bottom, margin.top]);
    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img").attr("aria-label", "Male and Female pedal cyclist hospitalisations by age group");
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickFormat((value) => numberFormat.format(value)));
    svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat("")).lower();

    const colors = { Male: "var(--age-male-line)", Female: "var(--age-female-line)" };
    SEXES.forEach((sex, index) => {
        const series = values.filter((d) => d.sex === sex && d.value !== null);
        const line = d3.line().x((d) => x(d.age)).y((d) => y(d.value)).curve(d3.curveMonotoneX);
        const path = svg.append("path").datum(series).attr("class", `series-line age-trajectory-line age-${sex.toLowerCase()}`)
            .attr("data-series", sex).attr("stroke", colors[sex])
            .attr("stroke-dasharray", index ? "7 4" : null)
            .attr("d", d3.line().x((d) => x(d.age)).y(() => y(0)).curve(d3.curveMonotoneX));
        attachSeriesHover(path);
        path.transition("trajectory-enter").duration(duration(620)).attr("d", line);
        const points = svg.append("g").selectAll(`.age-point-${sex.toLowerCase()}`).data(series).join("path")
            .attr("class", "age-trajectory-point focusable-mark").attr("tabindex", 0).attr("role", "img")
            .attr("aria-label", (d) => `${sex}, age ${d.age}: ${numberFormat.format(d.value)}`)
            .attr("transform", (d) => `translate(${x(d.age)},${y(d.value)})`)
            .attr("d", d3.symbol().type(index ? d3.symbolSquare : d3.symbolCircle).size(62)())
            .attr("fill", colors[sex]).attr("stroke", "var(--surface)").attr("stroke-width", 1.5);
        points.append("title").text((d) => `${sex}, ${d.age}: ${numberFormat.format(d.value)}`);
        svg.append("g").selectAll(`.age-value-${sex.toLowerCase()}`).data(series).join("text")
            .attr("class", "age-trajectory-value").attr("data-series", sex)
            .attr("x", (d) => x(d.age)).attr("y", (d) => y(d.value) + (index ? 20 : -12))
            .attr("text-anchor", "middle").text((d) => numberFormat.format(d.value));
    });
    const legend = svg.append("g").attr("class", "age-trajectory-legend")
        .attr("transform", `translate(${width / 2 - 70},18)`);
    SEXES.forEach((sex, index) => {
        const item = legend.append("g").attr("transform", `translate(${index * 100},0)`);
        item.append("line").attr("x1", 0).attr("x2", 18).attr("stroke", colors[sex])
            .attr("stroke-width", 2.5).attr("stroke-dasharray", index ? "6 3" : null);
        item.append("text").attr("x", 23).attr("y", 4).text(sex);
    });
}

function addSexPatterns(svg, suffix) {
    const defs = svg.append("defs");
    const patterns = [
        { id: `male-${suffix}`, color: "var(--sex-male-fill)", path: "M-4,4 l8,-8 M0,10 l10,-10 M6,14 l8,-8" },
        { id: `female-${suffix}`, color: "var(--sex-female-fill)", path: "M-4,-4 l8,8 M0,0 l10,10 M6,-2 l8,8" }
    ];
    patterns.forEach(({ id, color, path }) => {
        const pattern = defs.append("pattern").attr("id", id).attr("patternUnits", "userSpaceOnUse")
            .attr("width", 10).attr("height", 10);
        pattern.append("rect").attr("width", 10).attr("height", 10).attr("fill", color);
        pattern.append("path").attr("d", path).attr("fill", "none")
            .attr("stroke", "var(--pattern-contrast)").attr("stroke-width", 2);
    });
    return { Male: `url(#male-${suffix})`, Female: `url(#female-${suffix})` };
}

function sexTotals() {
    return Object.fromEntries(SEXES.map((sex) => [sex, sumKnown(rowsForSex(sex))]));
}

function drawOuterDonut(svg, width, height, radius, suffix) {
    const totals = sexTotals();
    const combined = totals.Male !== null && totals.Female !== null ? totals.Male + totals.Female : null;
    const dataRows = SEXES.map((sex) => ({ sex, value: totals[sex] }));
    const pie = d3.pie().sort(null).value((d) => d.value || 0)(dataRows);
    const arc = d3.arc().innerRadius(radius * 0.58).outerRadius(radius).cornerRadius(1.5);
    const cx = width / 2;
    const cy = height / 2;
    const fills = addSexPatterns(svg, suffix);
    const visual = svg.append("g").attr("class", "donut-animation-layer").attr("transform", `translate(${cx},${cy})`)
        .attr("pointer-events", "none");
    const paths = visual.selectAll("path").data(pie).join("path")
        .attr("class", (d) => `outer-sex-slice ${d.data.sex.toLowerCase()}`)
        .attr("fill", (d) => fills[d.data.sex]).attr("stroke", "var(--surface)").attr("stroke-width", 2)
        .attr("d", (d) => arc({ ...d, endAngle: d.startAngle }));
    paths.transition("donut-sweep").duration(duration(650)).ease(d3.easeCubicInOut)
        .attrTween("d", function (d) {
            const interpolate = d3.interpolate({ startAngle: d.startAngle, endAngle: d.startAngle }, d);
            return (t) => arc(interpolate(t));
        });

    appendDonutCallouts(svg, pie.filter((d) => d.data.value !== null && d.data.value > 0), {
        cx, cy, radius, height, className: "outer-sex", label: (d) =>
            `${d.data.sex} \u00b7 ${countLabel(d.data.value)} (${combined ? (d.data.value / combined * 100).toFixed(1) : "?"}%)`
    });

    const center = svg.append("text").attr("class", "donut-center-label")
        .attr("x", cx).attr("y", cy - 5).attr("text-anchor", "middle").attr("pointer-events", "none");
    center.append("tspan").attr("x", cx).attr("class", "donut-center-title").text("Cyclists");
    center.append("tspan").attr("x", cx).attr("dy", "1.45em").attr("class", "donut-center-count")
        .text(combined === null ? "Total unknown" : numberFormat.format(combined));

    const hitArc = d3.arc().innerRadius(radius * 0.56).outerRadius(radius + 2);
    const hitTargets = svg.append("g").attr("transform", `translate(${cx},${cy})`)
        .selectAll("path").data(pie).join("path").attr("class", "sex-slice-hit-target")
        .attr("d", hitArc).attr("fill", "transparent").attr("tabindex", 0).attr("role", "button")
        .attr("data-sex", (d) => d.data.sex)
        .attr("aria-label", (d) => `${d.data.sex}: ${d.data.value === null ? "unknown" : numberFormat.format(d.data.value)}`);
    return { hitTargets };
}

function drawAgeDonut(svg, sex, width, height, radius) {
    const rows = rowsForSex(sex);
    const dataRows = AGE_GROUPS.map((age) => {
        const matches = rows.filter((row) => row.age === age);
        return { age, value: sumKnown(matches) };
    });
    const pie = d3.pie().sort(null).value((d) => d.value || 0).padAngle(0.009)(dataRows);
    const cx = width / 2;
    const cy = height / 2;
    const arc = d3.arc().innerRadius(radius * 0.43).outerRadius(radius).cornerRadius(1.5);
    const colors = ["var(--donut-age-1)", "var(--donut-age-2)", "var(--donut-age-3)", "var(--donut-age-4)", "var(--donut-age-5)", "var(--donut-age-6)", "var(--donut-age-7)"];
    const visual = svg.append("g").attr("class", "donut-animation-layer age-donut-layer")
        .attr("transform", `translate(${cx},${cy})`).attr("pointer-events", "none");
    const paths = visual.selectAll("path").data(pie).join("path").attr("class", "age-donut-slice")
        .attr("fill", (_, index) => colors[index]).attr("stroke", "var(--surface)").attr("stroke-width", 1.5)
        .attr("d", (d) => arc({ ...d, endAngle: d.startAngle }));
    paths.transition("donut-sweep").duration(duration(650)).ease(d3.easeCubicInOut)
        .attrTween("d", function (d) {
            const interpolate = d3.interpolate({ startAngle: d.startAngle, endAngle: d.startAngle }, d);
            return (t) => arc(interpolate(t));
        });
    appendDonutCallouts(svg, pie.filter((d) => d.data.value !== null && d.data.value > 0), {
        cx, cy, radius, height, className: "age-donut", label: (d) => `${d.data.age} \u00b7 ${countLabel(d.data.value)}`
    });

    const total = sumKnown(rows);
    const center = svg.append("text").attr("class", "donut-center-label age-center-label")
        .attr("x", cx).attr("y", cy - 8).attr("text-anchor", "middle").attr("pointer-events", "none");
    center.append("tspan").attr("x", cx).attr("class", "donut-center-title").text(`${sex} age groups`);
    center.append("tspan").attr("x", cx).attr("dy", "1.45em").attr("class", "donut-center-count").text(countLabel(total));

    // Static transparent targets remain independent of the animated arcs.
    const hitTargets = svg.append("g").attr("transform", `translate(${cx},${cy})`)
        .selectAll("path").data(pie).join("path").attr("class", "age-slice-hit-target")
        .attr("d", arc).attr("fill", "transparent").attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", (d) => `${d.data.age}: ${countLabel(d.data.value)}`);
    const centerTarget = svg.append("circle").attr("class", "donut-center-hit-target")
        .attr("cx", cx).attr("cy", cy).attr("r", radius * 0.4).attr("fill", "transparent")
        .attr("tabindex", 0).attr("role", "button").attr("aria-label", "Return to Male and Female totals");
}

function appendDonutCallouts(svg, entries, { cx, cy, radius, height, className, label }) {
    if (!entries.length) return;
    const anchorArc = d3.arc().innerRadius(radius * 0.96).outerRadius(radius * 0.96);
    const points = entries.map((datum) => {
        const [dx, dy] = anchorArc.centroid(datum);
        return { datum, x: cx + dx, y: cy + dy, side: dx >= 0 ? 1 : -1 };
    });
    const minimumGap = entries.length > 4 ? 38 : 32;
    [-1, 1].forEach((side) => {
        const sidePoints = points.filter((point) => point.side === side).sort((a, b) => a.y - b.y);
        const top = 28;
        const bottom = height - 24;
        sidePoints.forEach((point, index) => {
            point.labelY = Math.max(point.y, top + index * minimumGap);
        });
        for (let index = sidePoints.length - 1; index >= 0; index -= 1) {
            const maxY = bottom - (sidePoints.length - 1 - index) * minimumGap;
            sidePoints[index].labelY = Math.min(sidePoints[index].labelY, maxY);
        }
    });

    const leaders = svg.append("g").attr("class", `${className}-leader-lines`).attr("pointer-events", "none");
    leaders.selectAll("polyline").data(points).join("polyline").attr("class", "donut-leader-line")
        .attr("points", (point) => {
            const elbowX = cx + point.side * (radius + 12);
            const labelX = elbowX + point.side * 7;
            return `${point.x},${point.y} ${elbowX},${point.labelY} ${labelX},${point.labelY}`;
        });
    svg.append("g").attr("class", `${className}-leader-labels`).attr("pointer-events", "none")
        .selectAll("text").data(points).join("text").attr("class", "donut-leader-label")
        .attr("x", (point) => cx + point.side * (radius + 19))
        .attr("y", (point) => point.labelY + 4)
        .attr("text-anchor", (point) => point.side > 0 ? "start" : "end")
        .text((point) => label(point.datum));
}

function bindUnifiedDonut() {
    const container = document.getElementById("cyclist-sex-chart");
    if (!container) return;
    let lockedSex = null;
    let previewSex = null;
    let mode = "outer";

    const draw = (nextMode, sex = null) => {
        mode = nextMode;
        const width = chartWidth(container);
        const height = 520;
        const radius = Math.max(125, Math.min(height / 2 - 30, width / 2 - 180));
        clearChart(container);
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img").attr("aria-label", nextMode === "outer"
                ? "Combined Male and Female pedal cyclist hospitalisations"
                : `${sex} pedal cyclist hospitalisations by age group`);

        if (nextMode === "outer") {
            const { hitTargets } = drawOuterDonut(svg, width, height, radius, ++chartSequence);
            hitTargets.on("pointerenter", (_, d) => {
                if (lockedSex) return;
                previewSex = d.data.sex;
                draw("age", previewSex);
            });
            container.onfocusout = (event) => {
                if (!lockedSex && !container.contains(event.relatedTarget) && mode === "age") draw("outer");
            };
            return;
        }

        drawAgeDonut(svg, sex, width, height, radius);
    };

    container.onclick = (event) => {
        const sexTarget = event.target.closest(".sex-slice-hit-target");
        const ageTarget = event.target.closest(".age-slice-hit-target, .donut-center-hit-target");
        if (mode === "outer") {
            const selectedSex = sexTarget?.dataset.sex || previewSex;
            if (!selectedSex) return;
            lockedSex = selectedSex;
            previewSex = selectedSex;
            draw("age", selectedSex);
            return;
        }
        if (mode === "age" && !lockedSex && previewSex) {
            lockedSex = previewSex;
            return;
        }
        if (ageTarget || mode === "age") {
            lockedSex = null;
            previewSex = null;
            draw("outer");
        }
    };
    container.onkeydown = (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        const sexTarget = event.target.closest(".sex-slice-hit-target");
        if (mode === "outer" && sexTarget) {
            event.preventDefault();
            lockedSex = sexTarget.dataset.sex;
            previewSex = lockedSex;
            draw("age", lockedSex);
            container.focus();
        } else if (mode === "age") {
            event.preventDefault();
            lockedSex = null;
            previewSex = null;
            draw("outer");
            container.focus();
        }
    };
    container.onpointerleave = () => {
        if (!lockedSex && mode === "age") {
            previewSex = null;
            draw("outer");
        }
    };
    draw("outer");
}

export function demographicLabelYear() {
    return filters.demographicYear || "All Years Total (2011-2021)";
}

export function renderDemographics() {
    const title = document.getElementById("demographic-title");
    const description = document.getElementById("demographic-description");
    if (title) title.textContent = "Cyclist age and sex breakdown";
    if (description) description.textContent =
        `Pedal cyclist hospitalisations for ${demographicLabelYear().toLowerCase()}. Counts are hospitalised cases, not population-adjusted rates. Sex totals include records with missing age; the donut shows the seven published age groups.`;
    bindUnifiedDonut();
    renderAgeSexTrajectory();
}
