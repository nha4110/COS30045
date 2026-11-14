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
        return filters.demographicYear || "All years combined (2011\u20132021)";
    }
    export function renderDemographics() {
        const yearLabel = demographicLabelYear();
        document.getElementById("demographic-title").textContent = `Age and sex patterns: ${filters.user.toLowerCase()}`;
        const rows = demographicRows();
        document.getElementById("demographic-description").textContent =
            `${filters.user} · ${yearLabel}. Compare recorded cases by age and sex. This period selector is independent of the comparison year. Counts do not measure differences in risk.`;
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
        document.getElementById("age-data-note").textContent = `${yearLabel} · ${filters.user}. Male/Female bars use complete published groups; unavailable or suppressed combinations remain unplotted.`;
        if (!drawable.length) return;
        const width = chartWidth(container), height = Math.max(320, ages.length * 40 + 90);
        const margin = { top: 34, right: 44, bottom: 52, left: 64 };
        const maximum = d3.max(drawable, (row) => row.value) || 1;
        const x = d3.scaleLinear().domain([-maximum * 1.24, maximum * 1.24]).range([margin.left, width - margin.right]);
        const y = d3.scaleBand().domain(ages).range([margin.top, height - margin.bottom]).padding(0.08);
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
            .attr("aria-label", `Recorded hospitalisations by age and sex for ${filters.user}, ${yearLabel}: Male left, Female right`);
        const maleFill = "var(--series-blue)";
        const femaleFill = "var(--series-orange)";
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
        bars.transition("bar-enter").duration(reducedMotion.matches ? 0 : 300)
            .attr("x", (row) => row.sex.toLowerCase() === "male" ? x(-row.value) : x(0))
            .attr("width", (row) => Math.abs(x(row.value) - x(0)));
        animateMarks(bars);
        svg.selectAll(".pyramid-value").data(drawable).join("text")
            .attr("class", "bar-value pyramid-value")
            .attr("x", row => row.sex.toLowerCase() === "male" ? x(-row.value) - 7 : x(row.value) + 7)
            .attr("text-anchor", row => row.sex.toLowerCase() === "male" ? "end" : "start")
            .attr("y", row => y(row.age) + y.bandwidth() / 2)
            .attr("dominant-baseline", "middle")
            .text(row => numberFormat.format(row.value));

        const legend = svg.append("g").attr("class", "pyramid-legend").attr("transform", `translate(${margin.left},6)`);
        [["Male · left", "var(--series-blue)"], ["Female · right", "var(--series-orange)"]].forEach((entry, index) => {
            const group = legend.append("g").attr("transform", `translate(${index * 110},0)`);
            group.append("rect").attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", entry[1]);
            group.append("text").attr("x", 17).attr("y", 10).text(entry[0]);
        });
        revealChart(svg);
    }
    export function renderSexIllustration(rows, yearLabel) {
        const container = document.getElementById("sex-chart");
        const empty = document.getElementById("sex-empty");
        clearChart(container);
        const groups = aggregateDemographic(rows, row => row.sex).sort((a, b) => {
            const order = name => name.toLowerCase() === "male" ? 0 : name.toLowerCase() === "female" ? 1 : 2;
            return order(a.key) - order(b.key) || a.key.localeCompare(b.key);
        });
        setEmptyState(empty, "No recorded sex categories match this selection.", !groups.length);
        document.getElementById("sex-data-note").textContent = "";
        if (!groups.length) return;

        const known = groups.filter(row => row.value !== null);
        const total = d3.sum(known, row => row.value);
        const width = chartWidth(container);
        const height = Math.max(220, groups.length * 78 + 48);
        const margin = { top: 20, right: 78, bottom: 32, left: 20 };
        const x = d3.scaleLinear().domain([0, d3.max(known, row => row.value) || 1])
            .range([margin.left, width - margin.right]);
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img").attr("aria-label", `Recorded hospitalisations by sex, ${filters.user}, ${yearLabel}`);
        const label = row => `${row.key}: ${row.value === null ? "unavailable for the complete selected period" : numberFormat.format(row.value) + " cases"}; ${yearLabel}; ${filters.user}`;
        const categories = svg.selectAll(".sex-category").data(groups).join("g")
            .attr("class", "focusable-mark sex-category").attr("tabindex", 0).attr("role", "img")
            .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight").attr("aria-label", label)
            .attr("transform", (row, index) => `translate(0,${margin.top + index * 78})`);
        categories.append("text").attr("x", margin.left).attr("y", 0)
            .attr("class", "sex-category-name").text(row => row.key);
        categories.filter(row => row.value !== null).append("rect")
            .attr("class", "bar sex-distribution-bar")
            .attr("x", x(0)).attr("y", 12).attr("height", 16)
            .attr("width", row => x(row.value) - x(0)).attr("rx", 2)
            .attr("fill", row => row.key.toLowerCase() === "male" ? "var(--series-blue)" : row.key.toLowerCase() === "female" ? "var(--series-orange)" : "var(--series-grey)");
        categories.append("text").attr("class", "bar-value")
            .attr("x", row => row.value === null ? margin.left : x(row.value) + 7)
            .attr("y", 25).text(row => row.value === null ? "Unavailable" : numberFormat.format(row.value));
        categories.append("text").attr("class", "sex-distribution-share")
            .attr("x", margin.left).attr("y", 47)
            .text(row => row.value !== null && total > 0 ? `${(row.value / total * 100).toFixed(1)}% of known recorded counts` : "No share calculated");
        attachTooltip(categories, label);
        svg.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(width < 400 ? 3 : 4).tickFormat(d3.format("~s")));
        const unavailable = groups.filter(row => row.value === null);
        document.getElementById("sex-data-note").textContent = `${yearLabel} · ${filters.user}. ` +
            (unavailable.length ? `${unavailable.length} category has incomplete or unavailable coverage; percentages use known categories only.` : "All displayed category totals are available.");
        revealChart(svg);
    }

    export function renderAgeSexTrajectory(rows, yearLabel) {
        const container = document.getElementById("age-sex-line-chart"), empty = document.getElementById("age-sex-line-empty");
        clearChart(container);
        const grouped = aggregateDemographic(rows, (row) => `${row.age}\u0000${row.sex}`)
            .map((item) => { const [age, sex] = item.key.split("\u0000"); return { age, sex, ...item }; });
        const ages = [...new Set(grouped.filter(row => row.age !== "Missing").map((row) => row.age))].sort((a, b) => demographicAgeOrder(a) - demographicAgeOrder(b) || a.localeCompare(b));
        const series = ["Male", "Female"].map((sex) => ({ sex, values: ages.map((age) => grouped.find((row) => row.age === age && row.sex.toLowerCase() === sex.toLowerCase()) || { age, sex, value: null }) }));
        const available = series.some((item) => item.values.some((row) => row.value !== null));
        setEmptyState(empty, "No Male/Female age profile records match this selection.", !available);
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
            trajectory.transition("series-enter").duration(reducedMotion.matches ? 0 : 300).attr("d", line);
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
