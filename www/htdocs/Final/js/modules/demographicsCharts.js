import {
    d3, data, filters, numberFormat, chartWidth, clearChart,
    reducedMotion, attachTooltip, hideTooltip
} from "./state.js";

const AGES = ["0-7", "8-16", "17-25", "26-39", "40-64", "65-74", "75+"];
const SEXES = ["Male", "Female"];

const COLORS = {
    Male: "var(--ratio-male)",
    Female: "var(--ratio-female)"
};

const duration = (ms) => reducedMotion.matches ? 0 : ms;

let selectedAge = "40-64";
let selectedSex = null;
let sequence = 0;

function cyclistRows() {
    return data.demographic.filter((row) =>
        row.user.toLowerCase() === "pedal cyclist" &&
        (!filters.demographicYear ||
            row.year === Number(filters.demographicYear))
    );
}

function sumKnown(rows) {
    if (
        !rows.length ||
        rows.some((row) => row.value === null || row.suppressed)
    ) {
        return null;
    }

    return d3.sum(rows, (row) => row.value);
}

function totals(age = null) {
    const rows = cyclistRows().filter((row) => !age || row.age === age);

    const values = Object.fromEntries(
        SEXES.map((sex) => [
            sex,
            sumKnown(
                rows.filter(
                    (row) => row.sex.toLowerCase() === sex.toLowerCase()
                )
            )
        ])
    );

    return {
        ...values,
        total: values.Male === null || values.Female === null
            ? null
            : values.Male + values.Female
    };
}

const count = (value) =>
    value === null ? "Unknown" : numberFormat.format(value);

const ageLabel = () =>
    selectedAge ? `Age ${selectedAge}` : "All ages";

export const demographicLabelYear = () =>
    filters.demographicYear || "All Years Total (2011-2021)";

function chooseAge(age) {
    selectedAge = age || null;
    selectedSex = null;
    renderDemographics();
}

function activate(selection, handler) {
    selection
        .on("click.dashboard", (_, row) => handler(row))
        .on("keydown.dashboard", (event, row) => {
            if (!["Enter", " "].includes(event.key)) return;

            event.preventDefault();
            event.stopPropagation();
            handler(row);

            document.getElementById("cyclist-sex-chart")?.focus();
        });
}

function renderSummary() {
    const all = totals();
    const chosen = totals(selectedAge);

    const ratio =
        chosen.total !== null &&
        chosen.total > 0 &&
        chosen.Female > 0
            ? `${(chosen.Male / chosen.Female).toFixed(2)} : 1`
            : "Unavailable";

    const share =
        all.total > 0 && chosen.total !== null
            ? `${(chosen.total / all.total * 100).toFixed(1)}% of the period total`
            : "Share unavailable";

    const values = {
        "demographic-total": count(all.total),
        "demographic-total-note":
            `${demographicLabelYear()} · Male + Female`,
        "demographic-selected-label": selectedAge
            ? `${selectedAge} hospitalisations`
            : "All-age hospitalisations",
        "demographic-selected": count(chosen.total),
        "demographic-selected-note": share,
        "demographic-ratio": ratio,
        "demographic-ratio-note": `${ageLabel()} · Male : Female`,
        "demographic-scope":
            `${demographicLabelYear()} · ${ageLabel()} selected`
    };

    Object.entries(values).forEach(([id, text]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    });

    const rankings = AGES
        .map((age) => ({ age, ...totals(age) }))
        .filter((row) => row.total !== null)
        .sort((a, b) => b.total - a.total);

    const insight = document.getElementById("demographic-insight");

    if (insight) {
        insight.textContent = rankings.length
            ? `Among age groups with complete Male and Female counts, ${rankings[0].age} records the most hospitalisations (${count(rankings[0].total)}) for this period.`
            : "Age-group comparisons are unavailable for this period.";
    }
}

export function renderAgeSexTrajectory() {
    const container = document.getElementById("age-sex-trajectory-chart");
    if (!container) return;

    clearChart(container);

    const groups = AGES.map((age) => ({ age, ...totals(age) }));

    const values = SEXES.flatMap((sex) =>
        groups.map((row) => ({
            sex,
            age: row.age,
            value: row[sex]
        }))
    );

    const width = chartWidth(container);
    const height = 350;
    const margin = { top: 42, right: 22, bottom: 48, left: 58 };

    const x = d3.scalePoint()
        .domain(AGES)
        .range([margin.left, width - margin.right])
        .padding(0.3);

    const y = d3.scaleLinear()
        .domain([0, (d3.max(values, (row) => row.value) || 1) * 1.18])
        .nice()
        .range([height - margin.bottom, margin.top]);

    const svg = d3.select(container)
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr(
            "aria-label",
            "Male and Female cyclist hospitalisations by age group. Select an age point to update the dashboard."
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

    if (selectedAge) {
        svg.append("rect")
            .attr("class", "age-selection-band")
            .attr("x", x(selectedAge) - x.step() * 0.42)
            .attr("y", margin.top)
            .attr("width", x.step() * 0.84)
            .attr("height", height - margin.bottom - margin.top);
    }

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x));

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3.axisLeft(y)
                .ticks(5)
                .tickFormat((value) => numberFormat.format(value))
        );

    const area = d3.area()
        .defined((row) => row.value !== null)
        .x((row) => x(row.age))
        .y0(y(0))
        .y1((row) => y(row.value))
        .curve(d3.curveLinear);

    SEXES.forEach((sex) => {
        const series = values.filter((row) => row.sex === sex);

        svg.append("path")
            .datum(series)
            .attr("class", `age-trajectory-area age-${sex.toLowerCase()}`)
            .attr("fill", COLORS[sex])
            .attr("d", area)
            .attr("opacity", 0)
            .transition("area-enter")
            .duration(duration(450))
            .attr("opacity", 1);
    });

    const knownValues = values.filter((row) => row.value !== null);

    const points = svg.selectAll(".age-trajectory-point")
        .data(knownValues)
        .join("circle")
        .attr(
            "class",
            (row) => `age-trajectory-point focusable-mark${
                row.age === selectedAge ? " is-focus-age" : ""
            }`
        )
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("data-age", (row) => row.age)
        .attr(
            "aria-pressed",
            (row) => row.age === selectedAge ? "true" : "false"
        )
        .attr(
            "aria-label",
            (row) =>
                `Select age ${row.age}. ${row.sex}: ${count(row.value)} hospitalisations`
        )
        .attr("cx", (row) => x(row.age))
        .attr("cy", (row) => y(row.value))
        .attr("r", 4.5)
        .attr("fill", (row) => COLORS[row.sex])
        .attr("stroke", "var(--surface)")
        .attr("stroke-width", 1.5);

    attachTooltip(
        points,
        (row) =>
            `${row.sex}, age ${row.age}: ${count(row.value)} hospitalisations. Select to explore this age group.`
    );

    activate(points, (row) => chooseAge(row.age));

    svg.selectAll(".age-trajectory-value")
        .data(knownValues)
        .join("text")
        .attr("class", "age-trajectory-value")
        .attr("x", (row) => x(row.age))
        .attr("y", (row) => {
            const group = groups.find((item) => item.age === row.age);
            const other = group[row.sex === "Male" ? "Female" : "Male"];

            const closeValues =
                row.sex === "Female" &&
                other !== null &&
                Math.abs(y(other) - y(row.value)) < 24;

            return y(row.value) + (closeValues ? 17 : -10);
        })
        .attr("text-anchor", "middle")
        .attr("pointer-events", "none")
        .text((row) => count(row.value));

    const legend = svg.append("g")
        .attr("class", "age-trajectory-legend")
        .attr("transform", `translate(${width / 2 - 85},18)`);

    SEXES.forEach((sex, index) => {
        const item = legend.append("g")
            .attr("transform", `translate(${index * 100},0)`);

        item.append("rect")
            .attr("width", 18)
            .attr("height", 10)
            .attr("y", -5)
            .attr("rx", 2)
            .attr("fill", COLORS[sex]);

        item.append("text")
            .attr("x", 23)
            .attr("y", 4)
            .text(sex);
    });
}

function sexPatterns(svg) {
    const suffix = ++sequence;
    const defs = svg.append("defs");

    SEXES.forEach((sex, index) => {
        const pattern = defs.append("pattern")
            .attr("id", `dashboard-${sex}-${suffix}`)
            .attr("patternUnits", "userSpaceOnUse")
            .attr("width", 10)
            .attr("height", 10);

        pattern.append("rect")
            .attr("width", 10)
            .attr("height", 10)
            .attr("fill", COLORS[sex]);

        pattern.append("path")
            .attr(
                "d",
                index
                    ? "M-4,-4 l8,8 M0,0 l10,10 M6,-2 l8,8"
                    : "M-4,4 l8,-8 M0,10 l10,-10 M6,14 l8,-8"
            )
            .attr("fill", "none")
            .attr("stroke", "var(--pattern-contrast)")
            .attr("stroke-width", 2);
    });

    return Object.fromEntries(
        SEXES.map((sex) => [
            sex,
            `url(#dashboard-${sex}-${suffix})`
        ])
    );
}

function drawDonut() {
    const container = document.getElementById("cyclist-sex-chart");
    if (!container) return;

    hideTooltip();
    clearChart(container);

    const drilldown = selectedSex !== null;
    const selected = totals(selectedAge);

    const rows = drilldown
        ? AGES.map((age) => ({
            key: age,
            value: totals(age)[selectedSex]
        }))
        : SEXES.map((sex) => ({
            key: sex,
            value: selected[sex]
        }));

    const width = chartWidth(container);
    const height = 300;
    const radius = Math.min(105, width * 0.20);
    const cx = width / 2;
    const cy = height / 2;

    const svg = d3.select(container)
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "group")
        .attr(
            "aria-label",
            drilldown
                ? `${selectedSex} hospitalisations across all age groups`
                : `Male and Female hospitalisations, ${ageLabel()}`
        );

    const title = document.getElementById("demographic-donut-title");

    if (title) {
        title.textContent = drilldown
            ? `How are ${selectedSex.toLowerCase()} cases distributed by age?`
            : "What is the sex split?";
    }

    const note = document.getElementById("demographic-donut-note");

    if (note) {
        note.textContent = drilldown
            ? `${selectedSex} · all seven published age groups. Select a slice to update the dashboard, or the centre to return.`
            : `${ageLabel()} · select Male or Female to explore its age groups.`;
    }

    const total = drilldown ? sumKnown(rows) : selected.total;
    const known = rows.filter((row) => row.value !== null && row.value > 0);
    const unavailable = !drilldown && (total === null || total === 0);

    if (!unavailable && known.length) {
        const pie = d3.pie()
            .sort(null)
            .value((row) => row.value)
            .padAngle(drilldown ? 0.009 : 0)(known);

        const arc = d3.arc()
            .innerRadius(radius * (drilldown ? 0.43 : 0.58))
            .outerRadius(radius)
            .cornerRadius(1.5);

        const patterns = sexPatterns(svg);

        const visual = svg.append("g")
            .attr("transform", `translate(${cx},${cy})`)
            .attr("pointer-events", "none");

        visual.selectAll("path")
            .data(pie)
            .join("path")
            .attr(
                "class",
                drilldown ? "age-donut-slice" : "outer-sex-slice"
            )
            .attr(
                "fill",
                (row) => drilldown
                    ? `var(--donut-age-${AGES.indexOf(row.data.key) + 1})`
                    : patterns[row.data.key]
            )
            .attr("stroke", "var(--surface)")
            .attr("stroke-width", 2)
            .transition("donut-sweep")
            .duration(duration(550))
            .attrTween("d", (row) => {
                const interpolate = d3.interpolate(
                    { ...row, endAngle: row.startAngle },
                    row
                );

                return (t) => arc(interpolate(t));
            });

        donutCallouts(svg, pie, {
            cx, cy, radius, height, total, drilldown, width
        });

        const targets = svg.append("g")
            .attr("transform", `translate(${cx},${cy})`)
            .selectAll("path")
            .data(pie)
            .join("path")
            .attr(
                "class",
                drilldown
                    ? "age-slice-hit-target"
                    : "sex-slice-hit-target"
            )
            .attr("data-key", (row) => row.data.key)
            .attr("d", arc)
            .attr("fill", "transparent")
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr(
                "aria-label",
                (row) =>
                    `${row.data.key}: ${count(row.data.value)} hospitalisations. Select to explore.`
            );

        attachTooltip(
            targets,
            (row) =>
                `${row.data.key}: ${count(row.data.value)} hospitalisations${
                    drilldown
                        ? ` for ${selectedSex}`
                        : `, ${ageLabel()}`
                }.`
        );

        activate(targets, (row) => {
            if (drilldown) {
                chooseAge(row.data.key);
            } else {
                selectedSex = row.data.key;
                drawDonut();
            }
        });
    }

    const center = svg.append("text")
        .attr("class", "donut-center-label")
        .attr("x", cx)
        .attr("y", cy - 16)
        .attr("text-anchor", "middle")
        .attr("pointer-events", "none");

    center.append("tspan")
        .attr("x", cx)
        .attr("class", "donut-center-title")
        .text(drilldown ? `${selectedSex} ages` : ageLabel());

    center.append("tspan")
        .attr("x", cx)
        .attr("dy", "1.5em")
        .attr("class", "donut-center-count")
        .text(count(total));

    center.append("tspan")
        .attr("x", cx)
        .attr("dy", "1.5em")
        .attr("class", "donut-center-instruction")
        .text(
            drilldown
                ? "Click to return"
                : total === null
                    ? "Sex split unavailable"
                    : total === 0
                        ? "No recorded cases"
                        : "Male + Female"
        );

    if (drilldown) {
        const back = svg.append("circle")
            .attr("class", "donut-center-hit-target")
            .attr("cx", cx)
            .attr("cy", cy)
            .attr("r", radius * 0.4)
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr(
                "aria-label",
                "Return to the selected age group's sex split"
            );

        activate(back, () => {
            selectedSex = null;
            drawDonut();
        });
    }

    if (drilldown && total === null && note) {
        note.textContent +=
            " Only known counts are drawn; missing or suppressed counts remain unknown.";
    }
}

function donutCallouts(
    svg,
    entries,
    { cx, cy, radius, height, total, drilldown, width }
) {
    const anchor = d3.arc()
        .innerRadius(radius * 0.96)
        .outerRadius(radius * 0.96);

    const points = entries.map((datum) => {
        const [dx, dy] = anchor.centroid(datum);

        return {
            datum,
            x: cx + dx,
            y: cy + dy,
            side: dx >= 0 ? 1 : -1
        };
    });

    [-1, 1].forEach((side) => {
        const sidePoints = points
            .filter((point) => point.side === side)
            .sort((a, b) => a.y - b.y);

        sidePoints.forEach((point, index) => {
            point.labelY = Math.max(point.y, 28 + index * 38);
        });

        for (let index = sidePoints.length - 1; index >= 0; index -= 1) {
            sidePoints[index].labelY = Math.min(
                sidePoints[index].labelY,
                height - 24 - (sidePoints.length - 1 - index) * 38
            );
        }
    });

    svg.append("g")
        .attr("pointer-events", "none")
        .selectAll("path")
        .data(points)
        .join("path")
        .attr("class", "donut-leader-line")
        .attr("d", (point) => {
            const elbow = cx + point.side * (radius + 12);

            return `M${point.x},${point.y}
                C${point.x + point.side * 20},${point.y}
                ${elbow - point.side * 3},${point.labelY}
                ${elbow},${point.labelY}
                L${elbow + point.side * 7},${point.labelY}`;
        });

    svg.append("g")
        .attr("pointer-events", "none")
        .selectAll("text")
        .data(points)
        .join("text")
        .attr("class", "donut-leader-label")
        .classed(
            "is-focus-age",
            (point) => drilldown && point.datum.data.key === selectedAge
        )
        .attr("x", (point) => cx + point.side * (radius + 19))
        .attr("y", (point) => point.labelY + 4)
        .attr("text-anchor", (point) => point.side > 0 ? "start" : "end")
        .style("font-size", width < 480 ? "10px" : "12px")
        .text(({ datum }) => {
            const share = !drilldown && total > 0
                ? ` ${(datum.data.value / total * 100).toFixed(1)}%`
                : "";

            return !drilldown && width < 620
                ? `${datum.data.key}${share}`
                : `${datum.data.key} · ${count(datum.data.value)}${
                    share ? ` (${share.trim()})` : ""
                }`;
        });
}

function drawPersonIcon(group, sex) {
    group.attr("fill", "currentColor");

    group.append("circle")
        .attr("cx", 0)
        .attr("cy", -6)
        .attr("r", 2.3);

    group.append("path")
        .attr(
            "d",
            sex === "Male"
                ? "M-3,-2 L-5,0 L-4,4 L-2.5,3 L-2,11 L2,11 L2.5,3 L4,4 L5,0 L3,-2 Z"
                : "M-3,-2 L-5,0 L-4,4 L-2.5,3 L-2.5,5 L-5,11 L5,11 L2.5,5 L2.5,3 L4,4 L5,0 L3,-2 Z"
        );
}

function renderSexRatio() {
    const chart = document.getElementById("sex-ratio-chart");
    if (!chart) return;

    clearChart(chart);

    const values = totals(selectedAge);
    const available = values.total !== null && values.total > 0;

    document.getElementById("ratio-caption").textContent =
        available && values.Female > 0
            ? `${ageLabel()} · ${(values.Male / values.Female).toFixed(2)} males for every 1 female`
            : `${ageLabel()} · Male ${count(values.Male)} · Female ${count(values.Female)} · ratio unavailable`;

    const legend = document.getElementById("ratio-legend");
    legend.replaceChildren();

    SEXES.forEach((sex) => {
        const entry = document.createElement("span");
        entry.className = "ratio-legend-item";

        const icon = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
        );

        icon.setAttribute("viewBox", "0 0 16 22");
        icon.setAttribute("class", "ratio-legend-person");
        icon.setAttribute("aria-hidden", "true");
        icon.style.color = COLORS[sex];

        drawPersonIcon(
            d3.select(icon)
                .append("g")
                .attr("transform", "translate(8,11)"),
            sex
        );

        entry.append(
            icon,
            document.createTextNode(`${sex} · ${count(values[sex])}`)
        );

        legend.append(entry);
    });

    if (!available) return;

    const width = chartWidth(chart);
    const height = 82;
    const iconCount = 30;
    const maleIcons = Math.round(values.Male / values.total * iconCount);
    const gap = Math.min(17, (width - 54) / (iconCount - 1));
    const start = (width - gap * (iconCount - 1)) / 2;

    const svg = d3.select(chart)
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr(
            "aria-label",
            `${ageLabel()}: Male ${count(values.Male)}, Female ${count(values.Female)}. Thirty icons approximate the proportions.`
        );

    svg.selectAll("g.fraction-person")
        .data(d3.range(iconCount))
        .join("g")
        .attr("class", "fraction-person")
        .attr(
            "transform",
            (index) =>
                `translate(${start + index * gap},${height / 2}) scale(${Math.min(1, gap / 13)})`
        )
        .attr(
            "color",
            (index) => COLORS[index < maleIcons ? "Male" : "Female"]
        )
        .each(function (index) {
            drawPersonIcon(
                d3.select(this),
                index < maleIcons ? "Male" : "Female"
            );
        });
}

export function renderDemographics() {
    const title = document.getElementById("demographic-title");

    if (title) {
        title.textContent =
            "Which cyclists record the most hospitalisations?";
    }

    const description = document.getElementById(
        "demographic-description"
    );

    if (description) {
        description.textContent =
            "Explore how recorded cyclist hospitalisations vary by year, age group and sex.";
    }

    const ageSelect = document.getElementById("demographic-age-filter");

    if (ageSelect) {
        ageSelect.value = selectedAge || "";
        ageSelect.onchange = (event) => chooseAge(event.target.value);
    }

    const reset = document.getElementById("demographic-reset");

    if (reset) {
        reset.onclick = () => {
            filters.demographicYear = "";
            selectedAge = "40-64";
            selectedSex = null;

            document.getElementById("demographic-year-filter").value = "";

            renderDemographics();
        };
    }

    renderSummary();
    renderAgeSexTrajectory();
    drawDonut();
    renderSexRatio();
}