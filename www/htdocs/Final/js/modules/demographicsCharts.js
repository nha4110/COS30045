import { d3, data, filters, numberFormat, setEmptyState, chartWidth, attachTooltip, revealChart, clearChart, reducedMotion, animateMarks, addColorPattern } from "./state.js";

    export function demographicRows() {
        return data.demographic.filter((row) => row.user === filters.user &&
            (!filters.demographicYear || row.year === Number(filters.demographicYear)));
    }
    export function aggregateDemographic(rows, keyFn) {
        const expectedYears = filters.demographicYear
            ? [Number(filters.demographicYear)]
            : [...new Set(data.demographic.map((row) => row.year))];
        return d3.rollups(rows, (group) => {
            const coveredYears = new Set(group.map((row) => row.year));
            const unknown = group.some((row) => row.value === null || row.suppressed) || coveredYears.size < expectedYears.length;
            return { value: unknown ? null : d3.sum(group, (row) => row.value), suppressedCount: group.filter((row) => row.value === null || row.suppressed).length };
        }, keyFn).map(([key, summary]) => ({ key, ...summary }));
    }
    export function demographicAgeOrder(value) {
        const order = ["0-7", "8-16", "17-25", "26-39", "40-64", "65-74", "75+", "Missing"];
        const index = order.indexOf(value);
        return index < 0 ? order.length : index;
    }
    export function demographicLabelYear() {
        return filters.demographicYear || "All Years Total (2011\u20132021)";
    }
    export function renderDemographics() {
        const yearLabel = demographicLabelYear();
        document.getElementById("demographic-title").textContent = `Age and sex patterns: ${filters.user.toLowerCase()}`;
        const rows = demographicRows();
        document.getElementById("demographic-description").textContent =
            `${filters.user}: Male and Female counts by age, sex distribution, and age trajectory for ${yearLabel.toLowerCase()}. All-years totals sum published 2011-2021 counts. These are counts, not population-adjusted rates.`;
        renderPopulationPyramid(rows, yearLabel);
        renderSexIllustration(rows, yearLabel);
        renderAgeSexTrajectory(rows, yearLabel);
    }
    export function renderPopulationPyramid(rows, yearLabel) {
        const container = document.getElementById("age-chart"), empty = document.getElementById("age-empty");
        clearChart(container);
        const values = aggregateDemographic(rows, (row) => `${row.age}\u0000${row.sex}`)
            .map((item) => { const [age, sex] = item.key.split("\u0000"); return { age, sex, ...item }; });
        const ages = [...new Set(values.map((row) => row.age))].sort((a, b) => demographicAgeOrder(a) - demographicAgeOrder(b) || a.localeCompare(b));
        const drawable = values.filter((row) => ["male", "female"].includes(row.sex.toLowerCase()) && row.value !== null);
        setEmptyState(empty, "No Male/Female age records match this road-user and year selection.", !drawable.length);
        document.getElementById("age-data-note").textContent = `${yearLabel} | ${filters.user}. Male/Female bars use complete published groups; unavailable or suppressed combinations remain unplotted.`;
        if (!drawable.length) return;
        const width = chartWidth(container), height = Math.max(310, ages.length * 36 + 90);
        const margin = { top: 28, right: 26, bottom: 48, left: 60 };
        const maximum = d3.max(drawable, (row) => row.value) || 1;
        const x = d3.scaleLinear().domain([-maximum * 1.08, maximum * 1.08]).range([margin.left, width - margin.right]);
        const y = d3.scaleBand().domain(ages).range([margin.top, height - margin.bottom]).padding(0.08);
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
            .attr("aria-label", `Population pyramid for ${filters.user}, ${yearLabel}: Male left, Female right`);
        const maleFill = addColorPattern(svg, "pyramid-male-pattern", "var(--series-blue)", false);
        const femaleFill = addColorPattern(svg, "pyramid-female-pattern", "var(--series-orange)", true);
        svg.append("g").attr("class", "grid").attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(5).tickFormat((value) => numberFormat.format(Math.abs(value))).tickSize(-(height - margin.top - margin.bottom)));
        svg.selectAll(".grid line").filter((value) => value === 0).attr("stroke", "var(--chart-axis)").attr("stroke-width", 2.5);
        const centerAxis = svg.append("line").attr("class", "pyramid-center-axis").attr("x1", x(0)).attr("x2", x(0))
            .attr("y1", margin.top - 2).attr("y2", height - margin.bottom + 1)
            .attr("stroke", "var(--chart-axis)").attr("stroke-width", 2.5);
        svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left - 7},0)`).call(d3.axisLeft(y).tickSize(0)).call((axis) => axis.select(".domain").remove());
        svg.append("text").attr("x", margin.left + (x(0) - margin.left) / 2).attr("y", height - 10).attr("text-anchor", "middle").text("Male cases (left)");
        svg.append("text").attr("x", x(0) + (width - margin.right - x(0)) / 2).attr("y", height - 10).attr("text-anchor", "middle").text("Female cases (right)");
        const label = (row) => `${row.age}, ${row.sex}: ${numberFormat.format(row.value)} recorded hospitalisations, ${yearLabel}, ${filters.user}`;
        const bars = svg.selectAll(".pyramid-bar").data(drawable).join("rect").attr("class", "bar focusable-mark pyramid-bar")
            .attr("tabindex", 0).attr("role", "img").attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight").attr("aria-label", label)
            .attr("x", x(0))
            .attr("y", (row) => y(row.age))
            .attr("width", 0).attr("height", y.bandwidth())
            .attr("fill", (row) => row.sex.toLowerCase() === "male" ? maleFill : femaleFill)
            .attr("stroke", (row) => row.sex.toLowerCase() === "male" ? "var(--series-blue)" : "var(--series-orange)").attr("stroke-width", 1.5);
        centerAxis.raise();
        attachTooltip(bars, label);
        bars.transition("bar-enter").duration(reducedMotion.matches ? 0 : 750)
            .attr("x", (row) => row.sex.toLowerCase() === "male" ? x(-row.value) : x(0))
            .attr("width", (row) => Math.abs(x(row.value) - x(0)));
        animateMarks(bars);
        const legend = svg.append("g").attr("class", "pyramid-legend").attr("transform", `translate(${margin.left},6)`);
        [["Male (diagonal)", "var(--series-blue)"], ["Female (crosshatch)", "var(--series-orange)"]].forEach((entry, index) => {
            const group = legend.append("g").attr("transform", `translate(${index * 110},0)`);
            group.append("rect").attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", entry[1]);
            group.append("text").attr("x", 17).attr("y", 10).text(entry[0]);
        });
        revealChart(svg);
    }
    export function renderSexIllustration(rows, yearLabel) {
        const container = document.getElementById("sex-chart"), empty = document.getElementById("sex-empty");
        clearChart(container);
        document.getElementById("sex-data-note").textContent = "";
        const groups = aggregateDemographic(rows, (row) => row.sex);
        const bySex = new Map(groups.map((row) => [row.key.toLowerCase(), row]));
        const female = bySex.get("female"), male = bySex.get("male");
        const knownTotal = d3.sum(groups.filter((row) => row.value !== null), (row) => row.value);
        if (!groups.length) {
            setEmptyState(empty, "No sex records match this road-user and year selection.", true);
            return;
        }
        setEmptyState(empty, "", false);
        const width = chartWidth(container), height = 520;
        const spokenValue = (row) => row?.value === null || row?.value === undefined
            ? "unknown" : `${numberFormat.format(row.value)} cases, ${knownTotal ? (row.value / knownTotal * 100).toFixed(1) : "share unavailable"}% of known counts`;
        const otherValues = groups.filter((row) => !["male", "female"].includes(row.key.toLowerCase()))
            .map((row) => `${row.key}: ${row.value === null ? "unknown" : numberFormat.format(row.value)}`).join("; ");
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
            .attr("aria-label", `${filters.user}, ${yearLabel}. Female: ${spokenValue(female)}. Male: ${spokenValue(male)}. ${otherValues ? `Other recorded categories: ${otherValues}.` : ""}`);
        const femaleFill = addColorPattern(svg, "sex-female-pattern", "var(--series-orange)", true);
        const maleFill = addColorPattern(svg, "sex-male-pattern", "var(--series-blue)", false);
        const positions = [{ sex: "Female", row: female, x: width * 0.28, color: "var(--series-orange)", fill: femaleFill }, { sex: "Male", row: male, x: width * 0.72, color: "var(--series-blue)", fill: maleFill }];
        positions.forEach((item) => {
            const value = item.row?.value ?? null, pct = value === null || !knownTotal ? null : value / knownTotal * 100;
            const group = svg.append("g").attr("transform", `translate(${item.x},125)`);
            svg.append("text").attr("class", "sex-count").attr("x", item.x).attr("y", 24).attr("text-anchor", "middle").text(value === null ? "Unknown" : numberFormat.format(value));
            svg.append("text").attr("class", "sex-percent").attr("x", item.x).attr("y", 46).attr("text-anchor", "middle").text(pct === null ? "share unavailable" : `${pct.toFixed(1)}% of known counts`);
            group.append("circle").attr("cy", 8).attr("r", 10).attr("fill", item.color);
            if (item.sex === "Female") group.append("path").attr("d", "M-8,21 Q0,16 8,21 L12,43 L19,69 L10,71 L5,52 L5,91 L-5,91 L-5,52 L-10,71 L-19,69 L-12,43 Z").attr("fill", item.fill);
            else {
                group.append("path").attr("d", "M-10,20 Q0,15 10,20 L14,49 L8,51 L8,91 L-8,91 L-8,51 L-14,49 Z").attr("fill", item.fill);
                group.append("path").attr("d", "M-10,24 L-19,49 L-13,52 L-4,34 M10,24 L19,49 L13,52 L4,34").attr("fill", "none").attr("stroke", item.color).attr("stroke-width", 7).attr("stroke-linecap", "round");
            }
            svg.append("text").attr("class", "sex-name").attr("x", item.x).attr("y", 226).attr("text-anchor", "middle").text(item.sex);
        });
        const femaleValue = female?.value ?? null, maleValue = male?.value ?? null;
        let ratio = "Male/Female ratio unavailable";
        if (femaleValue > 0 && maleValue !== null) ratio = `For every 1 Female, ${(maleValue / femaleValue).toFixed(2)} Males recorded`;
        svg.append("text").attr("class", "ratio-label").attr("x", width / 2).attr("y", 250).attr("text-anchor", "middle").text(ratio);
        svg.append("text").attr("class", "pictogram-caption").attr("x", width / 2).attr("y", 273).attr("text-anchor", "middle").text("100-unit Male/Female split (known counts)");
        const pairComplete = femaleValue !== null && maleValue !== null;
        const pairTotal = pairComplete ? femaleValue + maleValue : 0;
        const pairReady = pairComplete && pairTotal > 0;
        const femaleUnits = pairReady ? Math.round(femaleValue / pairTotal * 100) : 0;
        const unknownFill = addColorPattern(svg, "sex-ratio-unknown-pattern", "var(--chart-pattern-background)", true);
        const gridStepX = 25, gridStepY = 18, unitRadius = 7.5;
        const gridX = (width - 10 * gridStepX) / 2;
        const ratioUnits = svg.selectAll(".ratio-unit").data(d3.range(100).map((index) => ({ index, female: index < femaleUnits }))).join("circle")
            .attr("class", "ratio-unit").attr("cx", (unit) => gridX + unit.index % 10 * gridStepX + gridStepX / 2)
            .attr("cy", (unit) => 295 + Math.floor(unit.index / 10) * gridStepY).attr("r", unitRadius)
            .attr("fill", (unit) => !pairReady ? unknownFill : unit.female ? femaleFill : maleFill).attr("stroke", "var(--surface)").attr("stroke-width", 1.2);
        animateMarks(ratioUnits);
        if (!pairReady) svg.append("text").attr("class", "sex-other-badge").attr("x", width / 2).attr("y", 480)
            .attr("text-anchor", "middle").text("Pictogram unavailable: no complete positive Male/Female total");
        const others = groups.filter((row) => !["male", "female"].includes(row.key.toLowerCase()));
        const badge = others.map((row) => `${row.key}: ${row.value === null ? "unknown" : numberFormat.format(row.value)}`).join("; ");
        if (badge) svg.append("text").attr("class", "sex-other-badge").attr("x", width / 2).attr("y", 502).attr("text-anchor", "middle").text(badge);
        document.getElementById("sex-data-note").textContent = `${yearLabel} | ${filters.user}. Percentages and pictogram compare known Male/Female counts; all other source categories are shown separately.`;
        revealChart(svg);
    }
    export function renderAgeSexTrajectory(rows, yearLabel) {
        const container = document.getElementById("age-sex-line-chart"), empty = document.getElementById("age-sex-line-empty");
        clearChart(container);
        const grouped = aggregateDemographic(rows, (row) => `${row.age}\u0000${row.sex}`)
            .map((item) => { const [age, sex] = item.key.split("\u0000"); return { age, sex, ...item }; });
        const ages = [...new Set(grouped.map((row) => row.age))].sort((a, b) => demographicAgeOrder(a) - demographicAgeOrder(b) || a.localeCompare(b));
        const series = ["Male", "Female"].map((sex) => ({ sex, values: ages.map((age) => grouped.find((row) => row.age === age && row.sex.toLowerCase() === sex.toLowerCase()) || { age, sex, value: null }) }));
        const available = series.some((item) => item.values.some((row) => row.value !== null));
        setEmptyState(empty, "No Male/Female age trajectory records match this selection.", !available);
        if (!available) return;
        const width = chartWidth(container), height = 350;
        const margin = { top: 45, right: 20, bottom: 80, left: 64 };
        const x = d3.scalePoint().domain(ages).range([margin.left, width - margin.right]).padding(0.2);
        const max = d3.max(series, (item) => d3.max(item.values, (row) => row.value || 0)) || 1;
        const y = d3.scaleLinear().domain([0, max * 1.25]).nice().range([height - margin.bottom, margin.top]);
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
            .attr("aria-label", `Male and Female counts by age group for ${filters.user}, ${yearLabel}`);
        svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat(""));
        svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).tickSize(0)).selectAll("text").attr("text-anchor", "end").attr("dx", "-0.6em").attr("dy", "0.4em").attr("transform", "rotate(-35)");
        svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((value) => numberFormat.format(value)));
        const colors = { Male: "var(--series-blue)", Female: "var(--series-orange)" };
        const line = d3.line().defined((row) => row.value !== null).x((row) => x(row.age)).y((row) => y(row.value));
        series.forEach((item) => {
            const trajectory = svg.append("path").datum(item.values).attr("class", "series-line").attr("stroke", colors[item.sex])
                .attr("stroke-dasharray", item.sex === "Female" ? "7 4" : "")
                .attr("d", d3.line().defined((row) => row.value !== null).x((row) => x(row.age)).y(() => y(0)));
            trajectory.transition("series-enter").duration(reducedMotion.matches ? 0 : 750).attr("d", line);
            const marks = svg.append("g").selectAll(`.age-sex-${item.sex}`).data(item.values.filter((row) => row.value !== null)).join("path")
                .attr("class", `series-point focusable-mark age-sex-${item.sex}`).attr("tabindex", 0).attr("role", "img")
                .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
                .attr("aria-label", (row) => `${row.sex}, age ${row.age}: ${numberFormat.format(row.value)} recorded hospitalisations`)
                .attr("transform", (row) => `translate(${x(row.age)},${y(row.value)})`)
                .attr("d", d3.symbol().type(item.sex === "Male" ? d3.symbolCircle : d3.symbolSquare).size(58)())
                .attr("fill", colors[item.sex]).attr("stroke", "var(--surface)");
            attachTooltip(marks, (row) => `${row.sex}, age ${row.age}: ${numberFormat.format(row.value)} recorded hospitalisations, ${yearLabel}`);
            animateMarks(marks);
        });
        const trajectoryLabels = [];
        ages.forEach((age, index) => {
            const m = series[0].values.find((row) => row.age === age), f = series[1].values.find((row) => row.age === age);
            if (!m || !f) return;
            const close = m.value !== null && f.value !== null && Math.abs(y(m.value) - y(f.value)) < 25;
            [[m, -12], [f, close ? 18 : -12]].forEach(([row, offset]) => {
                if (row.value === null) return;
                trajectoryLabels.push({ row, x: x(age), y: y(row.value) + offset - (index % 2 ? 10 : 0) });
            });
        });
        const labels = svg.selectAll(".trajectory-label").data(trajectoryLabels).join("text")
            .attr("class", "trajectory-label").attr("x", (item) => item.x).attr("y", (item) => item.y)
            .attr("text-anchor", "middle").text((item) => numberFormat.format(item.row.value));
        const occupied = [];
        labels.each(function () {
            let box = this.getBBox(), attempts = 0;
            while (attempts < 8 && occupied.some((other) => box.x < other.x + other.width + 2 && box.x + box.width + 2 > other.x && box.y < other.y + other.height + 2 && box.y + box.height + 2 > other.y)) {
                const nextY = Number(this.getAttribute("y")) + (attempts % 2 ? 12 : -12);
                this.setAttribute("y", String(Math.max(margin.top + 12, nextY)));
                box = this.getBBox();
                attempts += 1;
            }
            occupied.push(box);
        });
        const legend = svg.append("g").attr("class", "trajectory-legend").attr("transform", `translate(${margin.left},17)`);
        ["Male", "Female"].forEach((sex, index) => {
            const group = legend.append("g").attr("transform", `translate(${index * 95},0)`);
            group.append("path").attr("d", d3.symbol().type(sex === "Male" ? d3.symbolCircle : d3.symbolSquare).size(48)())
                .attr("transform", "translate(5,0)").attr("fill", colors[sex]);
            group.append("text").attr("x", 15).attr("y", 4).text(sex);
        });
        revealChart(svg);
    }
