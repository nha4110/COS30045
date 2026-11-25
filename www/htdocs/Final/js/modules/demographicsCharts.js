import {
    d3, data, filters, numberFormat, chartWidth, clearChart, reducedMotion, attachTooltip
} from "./state.js";

const AGE_GROUPS = ["0-7", "8-16", "17-25", "26-39", "40-64", "65-74", "75+"];
const SEXES = ["Male", "Female"];
const duration = (milliseconds) => reducedMotion.matches ? 0 : milliseconds;
let chartSequence = 0;
let selectedAgeGroup = "40-64";

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
    const height = 330;
    const margin = { top: 38, right: 12, bottom: 52, left: 54 };
    const x = d3.scalePoint().domain(AGE_GROUPS).range([margin.left, width - margin.right]).padding(0.24);
    const byAge = AGE_GROUPS.map((age) => {
        const male = values.find((row) => row.age === age && row.sex === "Male")?.value;
        const female = values.find((row) => row.age === age && row.sex === "Female")?.value;
        return { age, Male: male, Female: female, known: male !== null && male !== undefined && female !== null && female !== undefined };
    });
    const maximum = d3.max(byAge, (row) => row.known ? row.Male + row.Female : 0) || 1;
    const y = d3.scaleLinear().domain([0, maximum * 1.12]).nice().range([height - margin.bottom, margin.top]);
    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img").attr("aria-label", "Male and Female pedal cyclist hospitalisations by age group");
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickFormat((value) => numberFormat.format(value)));
    svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat("")).lower();

    const colors = { Male: "var(--trajectory-male-fill)", Female: "var(--trajectory-female-fill)" };
    const area = d3.area().defined((row) => row.known).x((row) => x(row.age))
        .y0(y(0)).y1((row) => y(row.value)).curve(d3.curveLinear);
    const valuePoints = SEXES.flatMap((sex) => byAge.filter((row) => row.known).map((row) => ({
        sex, age: row.age, value: row[sex], plotted: row[sex]
    })));
    const emphasizeValues = (sex) => svg.selectAll(".age-trajectory-value").interrupt("age-value-focus")
        .transition("age-value-focus").duration(duration(150)).style("opacity", (row) => row.sex === sex ? 1 : 0);
    const restoreValues = () => svg.selectAll(".age-trajectory-value").interrupt("age-value-focus")
        .transition("age-value-focus").duration(duration(180)).style("opacity", 1);
    SEXES.forEach((sex) => {
        const series = byAge.map((row) => ({ age: row.age, value: row[sex], known: row.known }));
        const path = svg.append("path").datum(series)
            .attr("class", `age-trajectory-area age-${sex.toLowerCase()}`)
            .attr("fill", colors[sex]).attr("data-series", sex).attr("tabindex", 0).attr("role", "img")
            .attr("aria-label", `${sex} recorded cyclist hospitalisations by age group`)
            .on("pointerenter.age-values focus.age-values", () => emphasizeValues(sex))
            .on("pointerleave.age-values blur.age-values", restoreValues)
            .attr("d", area(series.map(row => ({...row, known:false}))));
        path.append("title").text(`${sex} cyclist hospitalisations; both areas use the same zero baseline`);
        path.transition("age-area-enter").duration(duration(620)).ease(d3.easeCubicOut).attr("d", area(series));
    });
    const points = svg.selectAll(".age-trajectory-point").data(valuePoints).join("circle")
        .attr("class", (row) => `age-trajectory-point focusable-mark${row.age === "40-64" ? " is-focus-age" : ""}`).attr("tabindex", 0).attr("role", "img")
        .attr("cx", (row) => x(row.age)).attr("cy", (row) => y(row.plotted)).attr("r", 4)
        .attr("fill", (row) => colors[row.sex]).attr("stroke", "var(--surface)").attr("stroke-width", 1.5).attr("opacity", 0)
        .attr("aria-label", (row) => `${row.sex}, age ${row.age}: ${numberFormat.format(row.value)} recorded hospitalisations${row.age === "40-64" ? "; highlighted story age group" : ""}`)
        .on("pointerenter.age-values focus.age-values", (_, row) => emphasizeValues(row.sex))
        .on("pointerleave.age-values blur.age-values", restoreValues);
    points.transition("age-point-enter").duration(duration(500)).delay((_, index) => index * 24).attr("opacity", 1);
    attachTooltip(points, (row) => `${row.sex}, age ${row.age}: ${numberFormat.format(row.value)} recorded hospitalisations${row.age === "40-64" ? " · focus age group" : ""}`);
    const valueLabels = svg.selectAll(".age-trajectory-value").data(valuePoints).join("text")
        .attr("class", "age-trajectory-value").attr("data-series", (row) => row.sex)
        .attr("x", (row) => x(row.age)).attr("y", (row) => y(row.plotted) - 9)
        .attr("text-anchor", "middle").attr("opacity", 0).text((row) => numberFormat.format(row.value))
        .on("pointerenter.age-values focus.age-values", (_, row) => emphasizeValues(row.sex))
        .on("pointerleave.age-values blur.age-values", restoreValues);
    valueLabels.transition("age-value-enter").duration(duration(500)).delay((_, index) => index * 24).attr("opacity", 1);
    const legend = svg.append("g").attr("class", "age-trajectory-legend")
        .attr("transform", `translate(${width / 2 - 70},18)`);
    SEXES.forEach((sex, index) => {
        const item = legend.append("g").attr("transform", `translate(${index * 100},0)`);
        item.append("rect").attr("width", 18).attr("height", 10).attr("y", -5).attr("rx", 2).attr("fill", colors[sex]);
        item.append("text").attr("x", 23).attr("y", 4).text(sex);
    });
    const ageRankings = AGE_GROUPS.map((age) => {
        const groupRows = cyclistRows().filter((row) => row.age === age && !row.suppressed && row.value !== null);
        return { age, value: groupRows.length ? d3.sum(groupRows, (row) => row.value) : null };
    }).filter((row) => row.value !== null).sort((a, b) => b.value - a.value).slice(0, 5);
    const rankingList = d3.select(container).append("ol").attr("class", "age-group-top-five").attr("aria-label", "Top five age groups by pedal cyclist hospitalisations");
    rankingList.selectAll("li").data(ageRankings).join("li")
        .classed("is-focus-age", (row) => row.age === "40-64")
        .html((row) => `<span>${row.age}${row.age === "40-64" ? " (focus)" : ""}</span><strong>${numberFormat.format(row.value)}</strong>`);
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
    center.append("tspan").attr("x", cx).attr("class", "donut-center-title").text("40–64 focus");
    center.append("tspan").attr("x", cx).attr("dy", "1.45em").attr("class", "donut-center-count")
        .text(combined === null ? "Total unknown" : numberFormat.format(combined));

    const hitArc = d3.arc().innerRadius(radius * 0.56).outerRadius(radius + 2);
    const hitTargets = svg.append("g").attr("transform", `translate(${cx},${cy})`)
        .selectAll("path").data(pie).join("path").attr("class", "sex-slice-hit-target")
        .attr("d", hitArc).attr("fill", "transparent").attr("tabindex", 0).attr("role", "button")
        .attr("data-sex", (d) => d.data.sex)
        .attr("aria-label", (d) => `${d.data.sex}: ${d.data.value === null ? "unknown" : numberFormat.format(d.data.value)}`);
    attachTooltip(hitTargets, (d) => `${d.data.sex}: ${countLabel(d.data.value)} recorded cyclist hospitalisations. Adults aged 40–64 are the story focus; click to view age groups.`);
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
    svg.append("circle").attr("class", "donut-center-surface")
        .attr("cx", cx).attr("cy", cy).attr("r", radius * 0.4);
    const center = svg.append("text").attr("class", "donut-center-label age-center-label")
        .attr("x", cx).attr("y", cy - 10).attr("text-anchor", "middle").attr("pointer-events", "none");
    center.append("tspan").attr("x", cx).attr("class", "donut-center-title").text(`${sex} age groups`);
    center.append("tspan").attr("x", cx).attr("dy", "1.35em").attr("class", "donut-center-count").text(countLabel(total));
    center.append("tspan").attr("x", cx).attr("dy", "1.4em").attr("class", "donut-center-instruction").text("Click to return");

    // Static transparent targets remain independent of the animated arcs.
    const hitTargets = svg.append("g").attr("transform", `translate(${cx},${cy})`)
        .selectAll("path").data(pie).join("path").attr("class", "age-slice-hit-target")
        .attr("d", arc).attr("fill", "transparent").attr("tabindex", 0).attr("role", "button")
        .attr("data-age", (d) => d.data.age)
        .attr("aria-label", (d) => `Show Male and Female split for age ${d.data.age}: ${countLabel(d.data.value)}`);
    attachTooltip(hitTargets, (d) => `Male and Female cyclists aged ${d.data.age}: ${countLabel(d.data.value)} recorded hospitalisations${d.data.age === "40-64" ? " · focus age group" : ""}. Click to update the pictorial fraction.`);
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
    leaders.selectAll("path").data(points).join("path").attr("class", "donut-leader-line")
        .attr("data-key", (point) => point.datum.data.age || point.datum.data.sex)
        .attr("d", (point) => {
            const elbowX = cx + point.side * (radius + 12);
            const labelX = elbowX + point.side * 7;
            const controlX = point.x + point.side * Math.max(12, radius * 0.16);
            return `M${point.x},${point.y} C${controlX},${point.y} ${elbowX - point.side * 3},${point.labelY} ${elbowX},${point.labelY} L${labelX},${point.labelY}`;
        });
    svg.append("g").attr("class", `${className}-leader-labels`).attr("pointer-events", "none")
        .selectAll("text").data(points).join("text").attr("class", "donut-leader-label")
        .attr("data-key", (point) => point.datum.data.age || point.datum.data.sex)
        .attr("x", (point) => cx + point.side * (radius + 19))
        .attr("y", (point) => point.labelY + 4)
        .attr("text-anchor", (point) => point.side > 0 ? "start" : "end")
        .classed("is-focus-age", (point) => point.datum.data.age === "40-64")
        .text((point) => `${label(point.datum)}${point.datum.data.age === "40-64" ? " ★" : ""}`);
}

function bindUnifiedDonut() {
    const container = document.getElementById("cyclist-sex-chart");
    if (!container) return;
    let lockedSex = null;
    let mode = "outer";

    const draw = (nextMode, sex = null) => {
        mode = nextMode;
        const width = Math.max(chartWidth(container), 720);
        const height = 360;
        const radius = Math.max(112, Math.min(height / 2 - 38, width / 2 - 145));
        clearChart(container);
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "group").attr("aria-label", nextMode === "outer"
                ? "Combined Male and Female pedal cyclist hospitalisations"
                : `${sex} pedal cyclist hospitalisations by age group`);

        if (nextMode === "outer") {
            const { hitTargets } = drawOuterDonut(svg, width, height, radius, ++chartSequence);
            return;
        }

        drawAgeDonut(svg, sex, width, height, radius);
    };

    container.onclick = (event) => {
        const sexTarget = event.target.closest(".sex-slice-hit-target");
        const ageTarget = event.target.closest(".age-slice-hit-target");
        const centerTarget = event.target.closest(".donut-center-hit-target");
        if (mode === "outer") {
            const selectedSex = sexTarget?.dataset.sex;
            if (!selectedSex) return;
            lockedSex = selectedSex;
            selectedAgeGroup = null;
            draw("age", selectedSex);
            renderSexRatio();
            return;
        }
        if (mode === "age" && ageTarget) {
            selectedAgeGroup = ageTarget.dataset.age;
            d3.select(container).selectAll(".age-donut-leader-lines .donut-leader-line, .age-donut-leader-labels .donut-leader-label")
                .classed("is-active", function () { return this.getAttribute("data-key") === selectedAgeGroup; });
            renderSexRatio();
            return;
        }
        if (centerTarget) {
            lockedSex = null;
            selectedAgeGroup = null;
            draw("outer");
            renderSexRatio();
        }
    };
    container.onkeydown = (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        const sexTarget = event.target.closest(".sex-slice-hit-target");
        const ageTarget = event.target.closest(".age-slice-hit-target");
        const centerTarget = event.target.closest(".donut-center-hit-target");
        if (mode === "outer" && sexTarget) {
            event.preventDefault();
            lockedSex = sexTarget.dataset.sex;
            selectedAgeGroup = null;
            draw("age", lockedSex);
            renderSexRatio();
            container.focus();
        } else if (mode === "age" && ageTarget) {
            event.preventDefault();
            selectedAgeGroup = ageTarget.dataset.age;
            d3.select(container).selectAll(".age-donut-leader-lines .donut-leader-line, .age-donut-leader-labels .donut-leader-label")
                .classed("is-active", function () { return this.getAttribute("data-key") === selectedAgeGroup; });
            renderSexRatio();
        } else if (mode === "age" && centerTarget) {
            event.preventDefault();
            lockedSex = null;
            selectedAgeGroup = null;
            draw("outer");
            renderSexRatio();
            container.focus();
        } else if (mode === "age") {
            event.preventDefault();
            lockedSex = null;
            selectedAgeGroup = null;
            draw("outer");
            renderSexRatio();
            container.focus();
        }
    };
    draw("outer");
}

function renderSexRatio() {
    const chart = document.getElementById("sex-ratio-chart");
    const caption = document.getElementById("ratio-caption");
    const legend = document.getElementById("ratio-legend");
    if (!chart || !caption || !legend) return;
    clearChart(chart);
    const chosenRows = selectedAgeGroup
        ? cyclistRows().filter((row) => row.age === selectedAgeGroup)
        : cyclistRows();
    const values = Object.fromEntries(SEXES.map((sex) => [sex, sumKnown(chosenRows.filter((row) => row.sex.toLowerCase() === sex.toLowerCase()))]));
    const male = values.Male;
    const female = values.Female;
    const total = male !== null && female !== null ? male + female : null;
    const scope = selectedAgeGroup ? ` · ${selectedAgeGroup}` : "";
    caption.textContent = total === null || female === 0
        ? `Male ${countLabel(male)} · Female ${countLabel(female)}${scope} · ratio unavailable`
        : `For every 1 Female, ${(male / female).toFixed(2)} Males recorded${scope} · Male ${numberFormat.format(male)} · Female ${numberFormat.format(female)}`;
    legend.replaceChildren();
    [
        { name: "Male", className: "ratio-male-symbol" },
        { name: "Female", className: "ratio-female-symbol" }
    ].forEach((item) => {
        const entry = document.createElement("span");
        entry.className = "ratio-legend-item";
        const symbol = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        symbol.setAttribute("viewBox", "0 0 16 22");
        symbol.setAttribute("class", `ratio-legend-person ${item.className}`);
        symbol.setAttribute("aria-hidden", "true");
        const icon = d3.select(symbol).append("g").attr("transform", "translate(8,11)");
        drawPersonIcon(icon, item.name);
        const text = document.createElement("span");
        text.textContent = item.name;
        entry.append(symbol, text);
        legend.append(entry);
    });
    if (selectedAgeGroup) {
        const scopeLabel = document.createElement("span");
        scopeLabel.className = "ratio-scope";
        scopeLabel.textContent = `${selectedAgeGroup} split`;
        legend.append(scopeLabel);
    }
    if (total === null || total <= 0) return;

    const width = chartWidth(chart);
    const height = 82;
    const svg = d3.select(chart).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img").attr("aria-label", `Male ${numberFormat.format(male)}; Female ${numberFormat.format(female)}${scope}`);
    const iconCount = 30;
    const maleIcons = Math.round(male / total * iconCount);
    const gap = Math.min(17, (width - 54) / (iconCount - 1));
    const startX = (width - gap * (iconCount - 1)) / 2;
    const people = svg.selectAll("g.fraction-person").data(d3.range(iconCount)).join("g")
        .attr("class", "fraction-person")
        .attr("transform", (index) => `translate(${startX + index * gap},${height / 2}) scale(${Math.min(1, gap / 13)})`)
        .attr("color", (index) => index < maleIcons ? "var(--ratio-male)" : "var(--ratio-female)")
        .attr("opacity", 0);
    people.each(function (index) { drawPersonIcon(d3.select(this), index < maleIcons ? "Male" : "Female"); });
    people.attr("opacity", 1);
}

function drawPersonIcon(group, sex) {
    group.attr("fill", "currentColor");
    group.append("circle").attr("cx", 0).attr("cy", -6).attr("r", 2.3);
    group.append("path").attr("d", sex === "Male"
        ? "M-3,-2 L-5,0 L-4,4 L-2.5,3 L-2,11 L2,11 L2.5,3 L4,4 L5,0 L3,-2 Z"
        : "M-3,-2 L-5,0 L-4,4 L-2.5,3 L-2.5,5 L-5,11 L5,11 L2.5,5 L2.5,3 L4,4 L5,0 L3,-2 Z");
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
    selectedAgeGroup = "40-64";
    renderSexRatio();
}
