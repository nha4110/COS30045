(function () {
    "use strict";

    // Charts use only the team-prepared BITRE records; missing counts are never generated or imputed.
    const FILES = {
        national: "data/national_road_user_by_year.csv",
        state: "data/state_road_user_by_year.csv",
        firstNations: "data/first_nations_road_user_by_year.csv"
    };
    const COLORS = {
        complete: "var(--chart-primary)",
        firstNations: "var(--chart-primary)"
    };
    const SUPPRESSED_VALUES = new Set([
        "", "na", "n/a", "nan", "null", "suppressed", "s", "np",
        "not available", "-", "—", "–", "..", "..."
    ]);
    const data = { national: [], state: [], firstNations: [] };
    const filters = { year: "", state: "", user: "" };
    const tooltip = document.getElementById("chart-tooltip");
    const themeToggle = document.getElementById("theme-toggle");
    const themeToggleLabel = document.getElementById("theme-toggle-label");
    const numberFormat = new Intl.NumberFormat("en-AU");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const annotationLabels = {
        2012: "Victoria Emergency Department (ED) reporting-criteria change",
        2017: "NSW reporting-criteria change"
    };

    function normalizeHeader(value) {
        return value.toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function findColumn(columns, candidates) {
        const normalized = new Map(columns.map((column) => [normalizeHeader(column), column]));
        for (const candidate of candidates) {
            const found = normalized.get(normalizeHeader(candidate));
            if (found) return found;
        }
        return null;
    }

    function parseValue(value) {
        if (value === undefined || value === null) return null;
        const text = String(value).trim();
        if (SUPPRESSED_VALUES.has(text.toLowerCase())) return null;
        const numeric = Number(text.replace(/,/g, ""));
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
    }

    function isFlaggedSuppressed(value) {
        return ["1", "true", "yes", "y", "suppressed"].includes(String(value).trim().toLowerCase());
    }

    function canonicalRoadUser(value) {
        const user = String(value).trim();
        const normalized = normalizeHeader(user);
        // Harmonize source groupings so the same road-user filter works across all three files.
        if (["cardriver", "carpassenger", "carunknownposition", "cardriverpassengerorunknownposition"].includes(normalized)) {
            return "Car occupant";
        }
        if ([
            "heavytransportdriver",
            "heavytransportpassenger",
            "heavytransportunknownposition",
            "heavytransportdriverpassengerorunknownposition"
        ].includes(normalized)) {
            return "Heavy transport occupant";
        }
        return user;
    }

    function parseRows(rows, kind) {
        if (!rows.length) return [];
        const columns = rows.columns || Object.keys(rows[0]);
        const yearColumn = findColumn(columns, ["year", "calendar_year", "reporting_year", "financial_year"]);
        const stateColumn = findColumn(columns, ["state", "state_territory", "jurisdiction", "state_or_territory"]);
        const userColumn = findColumn(columns, ["road_user", "road_user_type", "road_user_group", "road_user_category", "user_type", "roaduser"]);
        const valueColumn = findColumn(columns, [
            "injuries", "hospitalisations", "hospitalizations", "hospitalised_injuries",
            "hospitalized_injuries", "hospitalisations_count", "count", "value", "total", "number"
        ]);
        const suppressedColumn = findColumn(columns, ["suppressed", "suppression_flag", "is_suppressed"]);

        if (!yearColumn) {
            throw new Error("Missing a year column (for example: year or reporting_year).");
        }
        if (kind === "state" && !stateColumn) {
            throw new Error("Missing a jurisdiction column (for example: state or state_territory).");
        }
        if (!valueColumn && !userColumn) {
            throw new Error("Could not identify a count column or road-user columns.");
        }

        const metadataColumns = new Set([yearColumn, stateColumn, userColumn, suppressedColumn].filter(Boolean));
        if (valueColumn) metadataColumns.add(valueColumn);
        const wideValueColumns = valueColumn ? [] : columns.filter((column) => !metadataColumns.has(column));
        const output = [];

        rows.forEach((row) => {
            const year = Number(String(row[yearColumn]).trim());
            if (!Number.isInteger(year) || year < 1900 || year > 2200) return;
            const rawValue = valueColumn ? row[valueColumn] : undefined;
            const parsedValue = valueColumn ? parseValue(rawValue) : null;
            const flagged = isFlaggedSuppressed(row[suppressedColumn]);
            const suppressed = flagged || (valueColumn && parsedValue === null);
            const common = {
                year,
                state: stateColumn ? String(row[stateColumn]).trim() : "",
                suppressed,
                value: suppressed ? null : parsedValue
            };

            if (valueColumn) {
                common.user = userColumn ? canonicalRoadUser(row[userColumn]) : "All road users";
                output.push(common);
            } else {
                wideValueColumns.forEach((column) => {
                    const wideValue = parseValue(row[column]);
                    const wideSuppressed = common.suppressed || wideValue === null;
                    output.push({
                        ...common,
                        user: canonicalRoadUser(column),
                        value: wideSuppressed ? null : wideValue,
                        suppressed: wideSuppressed
                    });
                });
            }
        });

        return output.filter((row) => row.user && row.user.toLowerCase() !== "undefined");
    }

    async function loadDataset(kind, path) {
        return parseRows(await d3.csv(path), kind);
    }

    function selectedYear() {
        if (filters.year) return Number(filters.year);
        return data.national.reduce((latest, row) => Math.max(latest, row.year), 0);
    }

    function setStatus(messages) {
        const element = document.getElementById("data-status");
        if (!messages.length) {
            element.hidden = true;
            element.textContent = "";
            return;
        }
        element.hidden = false;
        element.textContent = `Data notice: ${messages.join(" ")}`;
    }

    function updateSelect(select, values, placeholder, currentValue) {
        select.replaceChildren(new Option(placeholder, ""));
        values.forEach((value) => select.add(new Option(value, value)));
        select.value = values.includes(currentValue) ? currentValue : "";
    }

    function updateFilters() {
        const years = [...new Set([...data.national, ...data.state, ...data.firstNations].map((row) => row.year))]
            .sort((a, b) => a - b)
            .map(String);
        const states = [...new Set(data.state.map((row) => row.state).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
        const users = [...new Set([...data.national, ...data.state, ...data.firstNations].map((row) => row.user).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));

        updateSelect(document.getElementById("year-filter"), years, "Latest available year", filters.year);
        updateSelect(document.getElementById("state-filter"), states, "All jurisdictions", filters.state);
        updateSelect(document.getElementById("user-filter"), users, "All road users", filters.user);
        filters.year = document.getElementById("year-filter").value;
        filters.state = document.getElementById("state-filter").value;
        filters.user = document.getElementById("user-filter").value;
    }

    function rowsForUser(rows) {
        return filters.user ? rows.filter((row) => row.user === filters.user) : rows;
    }

    function summarizeRows(rows, keyFn) {
        // Retain known subtotals, but carry suppression counts through to chart styling and tooltips.
        return d3.rollups(rows, (group) => {
            const known = group.filter((row) => row.value !== null);
            return {
                value: known.length ? d3.sum(known, (row) => row.value) : null,
                suppressedCount: group.filter((row) => row.suppressed || row.value === null).length
            };
        }, keyFn).map(([key, summary]) => ({ key, ...summary }));
    }

    // GenAI-assisted helper: generate reusable texture patterns so chart completeness is not color-only.
    function addChartPatterns(svg, chartName, transparentDots) {
        const ids = {
            partial: `${chartName}-partial-pattern`,
            dots: `${chartName}-dots-pattern`
        };
        const defs = svg.append("defs");
        const partial = defs.append("pattern")
            .attr("id", ids.partial)
            .attr("patternUnits", "userSpaceOnUse")
            .attr("width", 8)
            .attr("height", 8);
        partial.append("rect")
            .attr("width", 8)
            .attr("height", 8)
            .attr("fill", "var(--chart-pattern-background)");
        partial.append("path")
            .attr("d", "M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4")
            .attr("fill", "none")
            .attr("stroke", "var(--chart-pattern-mark)")
            .attr("stroke-width", 1.5);

        const dots = defs.append("pattern")
            .attr("id", ids.dots)
            .attr("patternUnits", "userSpaceOnUse")
            .attr("width", 8)
            .attr("height", 8);
        dots.append("rect")
            .attr("width", 8)
            .attr("height", 8)
            .attr("fill", transparentDots ? "transparent" : "var(--chart-pattern-background)");
        dots.append("circle")
            .attr("cx", 2)
            .attr("cy", 2)
            .attr("r", 1.5)
            .attr("fill", "var(--chart-pattern-mark)");
        dots.append("circle")
            .attr("cx", 6)
            .attr("cy", 6)
            .attr("r", 1.5)
            .attr("fill", "var(--chart-pattern-mark)");
        return ids;
    }

    function revealChart(svg) {
        svg.style("opacity", 0)
            .transition("chart-reveal")
            .duration(reducedMotion.matches ? 0 : 750)
            .style("opacity", 1);
    }

    function setEmptyState(element, message, isEmpty) {
        element.hidden = !isEmpty;
        if (isEmpty) element.textContent = message;
    }

    function updateSummary() {
        const year = selectedYear();
        const source = filters.state ? data.state : data.national;
        const currentRows = rowsForUser(source).filter((row) =>
            row.year === year && (!filters.state || row.state === filters.state)
        );
        const total = summarizeRows(currentRows, () => "total")[0];
        const label = filters.state ? filters.state : "National";
        document.getElementById("kpi-national").textContent =
            total && total.value !== null ? numberFormat.format(total.value) : "—";
        document.getElementById("kpi-total-label").textContent =
            `${label.toUpperCase()} INJURIES · SELECTED YEAR`;
        document.getElementById("kpi-national-note").textContent = total && total.suppressedCount
            ? `Known subtotal; ${total.suppressedCount} suppressed or missing value(s) excluded`
            : `${label} records for ${year || "the selected year"}`;
        document.getElementById("kpi-latest-year").textContent = year ? String(year) : "—";
        document.getElementById("kpi-current-view").textContent = filters.user || "All road users";
        document.getElementById("kpi-current-note").textContent = label;
    }

    function showTooltip(event, text) {
        tooltip.textContent = text;
        tooltip.hidden = false;
        const rect = tooltip.getBoundingClientRect();
        const left = Math.min(event.clientX + 12, window.innerWidth - rect.width - 8);
        const top = Math.min(event.clientY + 12, window.innerHeight - rect.height - 8);
        tooltip.style.left = `${Math.max(8, left)}px`;
        tooltip.style.top = `${Math.max(8, top)}px`;
    }

    function hideTooltip() {
        tooltip.hidden = true;
    }

    function setTheme(theme, persist) {
        const dark = theme === "dark";
        document.documentElement.dataset.theme = dark ? "dark" : "light";
        themeToggle.setAttribute("aria-pressed", String(dark));
        themeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
        themeToggleLabel.textContent = dark ? "Light mode" : "Dark mode";
        document.querySelector('meta[name="theme-color"]').content = dark ? "#102333" : "#102a43";
        if (!persist) return;
        try {
            window.localStorage.setItem("road-injury-explorer-theme", dark ? "dark" : "light");
        } catch (error) {
            console.warn("Theme changed, but this browser did not allow saving the preference.", error);
        }
    }

    function initializeTheme() {
        let preference = "";
        try {
            preference = window.localStorage.getItem("road-injury-explorer-theme") || "";
        } catch (error) {
            console.warn("Could not read the saved theme preference; using the system preference.", error);
        }
        if (preference !== "dark" && preference !== "light") {
            preference = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        setTheme(preference, false);
        themeToggle.addEventListener("click", () => {
            setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
        });
    }

    function handleChartArrowNavigation(event) {
        const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
        if (!keys.includes(event.key) || !(event.target instanceof Element)) return;
        const current = event.target.closest(".focusable-mark");
        if (!current) return;
        const marks = [...current.ownerSVGElement.querySelectorAll(".focusable-mark")];
        const currentIndex = marks.indexOf(current);
        if (currentIndex < 0 || marks.length < 2) return;
        const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
        const nextIndex = (currentIndex + (forward ? 1 : marks.length - 1)) % marks.length;
        event.preventDefault();
        marks[nextIndex].focus();
    }

    function attachTooltip(selection, labelFn) {
        selection
            .attr("aria-describedby", "chart-tooltip")
            .on("pointerenter", function (event, datum) { showTooltip(event, labelFn(datum)); })
            .on("pointermove", function (event, datum) { showTooltip(event, labelFn(datum)); })
            .on("pointerleave", hideTooltip)
            .on("focus", function (event, datum) {
                const bounds = this.getBoundingClientRect();
                showTooltip({ clientX: bounds.left + bounds.width / 2, clientY: bounds.top }, labelFn(datum));
            })
            .on("blur", hideTooltip);
    }

    function chartWidth(element) {
        return Math.max(280, element.clientWidth);
    }

    function addAxes(svg, x, y, width, height, margin, yLabel) {
        svg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(Math.min(11, Math.max(4, Math.floor(width / 75)))).tickFormat(d3.format("d")));
        svg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).ticks(5).tickFormat((value) => numberFormat.format(value)));
        svg.append("g")
            .attr("class", "grid")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
            .lower();
        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -(height / 2))
            .attr("y", 13)
            .attr("text-anchor", "middle")
            .text(yLabel);
    }

    function renderNationalTrend() {
        const container = document.getElementById("national-chart");
        const empty = document.getElementById("national-empty");
        container.replaceChildren();
        const selectedRows = rowsForUser(data.national);
        const allYearly = summarizeRows(selectedRows, (row) => row.year)
            .map((row) => ({ year: row.key, ...row }))
            .sort((a, b) => a.year - b.year);
        const yearly = allYearly.filter((row) => row.value !== null);

        if (!yearly.length) {
            setEmptyState(empty, "No national trend data matches these filters.", true);
            return;
        }
        setEmptyState(empty, "", false);

        const width = chartWidth(container);
        const height = 270;
        const margin = { top: 24, right: 20, bottom: 40, left: 66 };
        const minYear = d3.min(allYearly, (row) => row.year);
        const maxYear = d3.max(allYearly, (row) => row.year);
        const xDomain = minYear === maxYear ? [minYear - 1, maxYear + 1] : [minYear, maxYear];
        const svg = d3.select(container).append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", `Total national hospitalised injuries, ${minYear} to ${maxYear}`);
        const patterns = addChartPatterns(svg, "national");
        const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]);
        const y = d3.scaleLinear()
            .domain([0, (d3.max(yearly, (row) => row.value) || 1) * 1.08])
            .nice()
            .range([height - margin.bottom, margin.top]);
        addAxes(svg, x, y, width, height, margin, "Hospitalised injuries");

        Object.entries(annotationLabels).forEach(([yearText, label]) => {
            const year = Number(yearText);
            if (year < minYear || year > maxYear) return;
            const group = svg.append("g")
                .attr("class", "focusable-mark")
                .attr("tabindex", 0)
                .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
                .attr("aria-label", `${year}: ${label}`);
            group.append("line")
                .attr("class", "annotation-line")
                .attr("x1", x(year))
                .attr("x2", x(year))
                .attr("y1", margin.top)
                .attr("y2", height - margin.bottom);
            group.append("text")
                .attr("class", "annotation-label")
                .attr("x", x(year) + 4)
                .attr("y", margin.top + (year === 2012 ? 11 : 25))
                .text(year);
            attachTooltip(group, () => `${year}: ${label}. Administrative reporting change; interpret comparisons across the marker with care.`);
        });

        const line = d3.line()
            .defined((row) => row.value !== null)
            .x((row) => x(row.year))
            .y((row) => y(row.value));
        svg.append("path")
            .datum(allYearly)
            .attr("class", "series-line")
            .attr("stroke", COLORS.complete)
            .attr("d", line);
        const points = svg.selectAll(".trend-point")
            .data(yearly)
            .join("circle")
            .attr("class", "series-point focusable-mark trend-point")
            .attr("tabindex", 0)
            .attr("role", "img")
            .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
            .attr("cx", (row) => x(row.year))
            .attr("cy", (row) => y(row.value))
            .attr("r", 4)
            .attr("fill", (row) => row.suppressedCount ? `url(#${patterns.dots})` : COLORS.complete)
            .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
            .attr("aria-label", (row) => `${row.year}: ${numberFormat.format(row.value)} hospitalised injuries${row.suppressedCount ? `, ${row.suppressedCount} values suppressed` : ""}`);
        attachTooltip(points, (row) =>
            `${row.year}: ${numberFormat.format(row.value)} ${filters.user || "hospitalised injuries"}` +
            (row.suppressedCount ? ` (known subtotal; ${row.suppressedCount} suppressed or missing value(s) excluded)` : "")
        );
        revealChart(svg);
    }

    function renderRoadUserBars() {
        const container = document.getElementById("road-user-chart");
        const empty = document.getElementById("road-user-empty");
        const dataNote = document.getElementById("road-user-data-note");
        const unit = document.getElementById("road-user-chart-unit");
        container.replaceChildren();
        const year = selectedYear();
        const source = filters.state ? data.state : data.national;
        const rows = rowsForUser(source).filter((row) =>
            row.year === year && (!filters.state || row.state === filters.state)
        );
        const summaries = summarizeRows(rows, (row) => row.user)
            .map((row) => ({ user: row.key, ...row }));
        const grouped = summaries.filter((row) => row.value !== null)
            .sort((a, b) => d3.descending(a.value, b.value));
        const omitted = summaries.filter((row) => row.value === null).length;
        const partial = grouped.filter((row) => row.suppressedCount).length;
        const noteParts = [];
        if (omitted) noteParts.push(`${omitted} fully suppressed or missing group(s) omitted, not zero.`);
        if (partial) noteParts.push(`${partial} patterned bar(s) show known subtotals with suppressed values excluded.`);
        dataNote.hidden = !noteParts.length;
        dataNote.textContent = noteParts.join(" ");

        unit.textContent = `${filters.state || "National"} · ${year || "no year"} · raw counts`;
        if (!grouped.length) {
            setEmptyState(empty, rows.length
                ? "All matching road-user values are suppressed or missing; no bar is shown."
                : "No road-user records match this year and filter.", true);
            return;
        }
        setEmptyState(empty, "", false);

        const width = chartWidth(container);
        const barHeight = 28;
        const margin = { top: 8, right: 66, bottom: 28, left: Math.min(175, Math.max(102, width * 0.39)) };
        const height = margin.top + margin.bottom + grouped.length * barHeight;
        const svg = d3.select(container).append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", `Road-user injury counts for ${filters.state || "Australia"} in ${year}, sorted descending`);
        const patterns = addChartPatterns(svg, "road-user");
        const x = d3.scaleLinear()
            .domain([0, d3.max(grouped, (row) => row.value) || 1])
            .nice()
            .range([margin.left, width - margin.right]);
        const y = d3.scaleBand()
            .domain(grouped.map((row) => row.user))
            .range([margin.top, height - margin.bottom])
            .padding(0.24);
        svg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(4).tickFormat(d3.format("~s")));
        svg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).tickSize(0))
            .call((axis) => axis.select(".domain").remove());

        const bars = svg.selectAll(".bar")
            .data(grouped)
            .join("rect")
            .attr("class", "bar focusable-mark")
            .attr("tabindex", 0)
            .attr("role", "img")
            .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
            .attr("fill", (row) => row.suppressedCount ? `url(#${patterns.partial})` : COLORS.complete)
            .attr("x", margin.left)
            .attr("y", (row) => y(row.user))
            .attr("width", (row) => Math.max(0, x(row.value) - margin.left))
            .attr("height", y.bandwidth())
            .attr("rx", 2)
            .attr("aria-label", (row) => `${row.user}: ${numberFormat.format(row.value)} injuries${row.suppressedCount ? `, ${row.suppressedCount} suppressed values excluded` : ""}`);
        svg.selectAll(".bar-value")
            .data(grouped)
            .join("text")
            .attr("class", "bar-value")
            .attr("x", (row) => Math.min(x(row.value) + 6, width - 58))
            .attr("y", (row) => y(row.user) + y.bandwidth() / 2 + 4)
            .text((row) => numberFormat.format(row.value));
        attachTooltip(bars, (row) =>
            `${row.user}: ${numberFormat.format(row.value)} injuries` +
            (row.suppressedCount ? ` (known subtotal; ${row.suppressedCount} suppressed or missing value(s) excluded)` : "")
        );
        revealChart(svg);
    }

    function renderRoadUserTrends() {
        const container = document.getElementById("road-user-trend-chart");
        const legend = document.getElementById("road-user-trend-legend");
        const empty = document.getElementById("road-user-trend-empty");
        const unit = document.getElementById("road-user-trend-unit");
        const description = document.getElementById("road-user-trend-description");
        container.replaceChildren();
        legend.replaceChildren();

        const source = filters.state ? data.state : data.national;
        const filteredRows = rowsForUser(source).filter((row) =>
            !filters.state || row.state === filters.state
        );
        const year = selectedYear();
        const yearRows = filteredRows.filter((row) => row.year === year);
        const leaders = summarizeRows(yearRows, (row) => row.user)
            .filter((row) => row.value !== null)
            .sort((a, b) => d3.descending(a.value, b.value))
            .slice(0, 5)
            .map((row) => row.key);
        const years = [...new Set(filteredRows.map((row) => row.year))].sort((a, b) => a - b);

        unit.textContent = `${filters.state || "National"} · leading groups`;
        description.textContent = `Trends for the five leading groups in ${year || "the selected year"}${filters.state ? ` in ${filters.state}` : " nationally"}. Line styles and point shapes distinguish groups; gaps indicate suppressed or missing records. Use Tab and arrow keys to explore the points.`;

        if (!leaders.length || !years.length) {
            setEmptyState(empty, yearRows.length
                ? "All road-user values for the selected year are suppressed or missing."
                : "No road-user trend data matches these filters.", true);
            return;
        }
        setEmptyState(empty, "", false);

        const series = leaders.map((name) => {
            const rows = filteredRows.filter((row) => row.user === name);
            const yearly = summarizeRows(rows, (row) => row.year);
            const byYear = new Map(yearly.map((row) => [row.key, row]));
            return {
                name,
                values: years.map((chartYear) => {
                    const summary = byYear.get(chartYear);
                    return summary
                        ? { year: chartYear, value: summary.value, suppressedCount: summary.suppressedCount }
                        : { year: chartYear, value: null, suppressedCount: 0 };
                })
            };
        });

        const width = chartWidth(container);
        const height = 300;
        const margin = { top: 16, right: 14, bottom: 38, left: 62 };
        const svg = d3.select(container).append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", `Annual injuries for the leading road-user groups in ${filters.state || "Australia"}`);
        const xDomain = years.length === 1 ? [years[0] - 1, years[0] + 1] : d3.extent(years);
        const x = d3.scaleLinear()
            .domain(xDomain)
            .range([margin.left, width - margin.right]);
        const maxValue = d3.max(series, (item) => d3.max(item.values, (row) => row.value)) || 1;
        const y = d3.scaleLinear()
            .domain([0, maxValue * 1.08])
            .nice()
            .range([height - margin.bottom, margin.top]);
        addAxes(svg, x, y, width, height, margin, "Hospitalised injuries");

        const dashPatterns = ["", "7 3", "2 3", "9 3 2 3", "1 3"];
        const symbols = [d3.symbolCircle, d3.symbolSquare, d3.symbolDiamond, d3.symbolTriangle, d3.symbolCross];
        const line = d3.line()
            .defined((row) => row.value !== null)
            .x((row) => x(row.year))
            .y((row) => y(row.value));
        const seriesGroups = svg.selectAll(".trend-series")
            .data(series)
            .join("g")
            .attr("class", "trend-series");

        seriesGroups.append("path")
            .attr("class", "series-line")
            .attr("stroke", COLORS.complete)
            .attr("stroke-dasharray", (values, index) => dashPatterns[index])
            .attr("d", (item) => line(item.values));

        const pointGenerator = (index) => d3.symbol().type(symbols[index]).size(48);
        const points = seriesGroups.selectAll(".trend-point")
            .data((item) => item.values
                .filter((row) => row.value !== null)
                .map((row) => ({ ...row, user: item.name })))
            .join("path")
            .attr("class", "series-point focusable-mark trend-point")
            .attr("tabindex", 0)
            .attr("role", "img")
            .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
            .attr("transform", (row) => `translate(${x(row.year)},${y(row.value)})`)
            .attr("d", (row) => pointGenerator(leaders.indexOf(row.user))())
            .attr("fill", COLORS.complete)
            .attr("aria-label", (row) => `${row.year}, ${row.user}: ${numberFormat.format(row.value)} injuries${row.suppressedCount ? `, ${row.suppressedCount} suppressed or missing value(s) excluded` : ""}`);
        attachTooltip(points, (row) =>
            `${row.year} · ${row.user}: ${numberFormat.format(row.value)} injuries` +
            (row.suppressedCount ? ` (known subtotal; ${row.suppressedCount} suppressed or missing value(s) excluded)` : "")
        );

        legend.replaceChildren(...series.map((item, index) => {
            const entry = document.createElement("span");
            entry.className = "trend-legend-item";
            const swatch = document.createElement("span");
            swatch.className = "trend-legend-line";
            swatch.style.borderTopStyle = dashPatterns[index] ? "dashed" : "solid";
            swatch.setAttribute("aria-hidden", "true");
            const label = document.createElement("span");
            label.className = "trend-legend-label";
            label.textContent = item.name;
            entry.append(swatch, label);
            return entry;
        }));
        revealChart(svg);
    }

    function renderStateHeatmap() {
        const container = document.getElementById("state-chart");
        const empty = document.getElementById("state-empty");
        const dataNote = document.getElementById("state-data-note");
        container.replaceChildren();
        const year = selectedYear();
        const rows = rowsForUser(data.state).filter((row) =>
            row.year === year && (!filters.state || row.state === filters.state)
        );
        document.getElementById("comparison-year-label").textContent = `Selected year: ${year || "unavailable"}`;
        const states = [...new Set(data.state.map((row) => row.state).filter(Boolean))]
            .filter((state) => !filters.state || state === filters.state)
            .sort((a, b) => a.localeCompare(b));
        const users = [...new Set(data.state.map((row) => row.user).filter(Boolean))]
            .filter((user) => !filters.user || user === filters.user)
            .sort((a, b) => a.localeCompare(b));

        if (!rows.length || !states.length || !users.length) {
            dataNote.hidden = true;
            setEmptyState(empty, "No jurisdiction records match this year and filter.", true);
            return;
        }
        setEmptyState(empty, "", false);

        const summaries = d3.rollups(rows, (group) => {
            const known = group.filter((row) => row.value !== null);
            return {
                value: known.length ? d3.sum(known, (row) => row.value) : null,
                suppressedCount: group.filter((row) => row.suppressed || row.value === null).length
            };
        }, (row) => `${row.state}\u0000${row.user}`);
        const cellData = new Map(summaries.map(([key, summary]) => [key, summary]));
        const cells = states.flatMap((state) => users.map((user) => {
            const summary = cellData.get(`${state}\u0000${user}`);
            return {
                state,
                user,
                value: summary ? summary.value : null,
                suppressedCount: summary ? summary.suppressedCount : 0,
                hasRecord: Boolean(summary)
            };
        }));
        const missingCells = cells.filter((cell) => !cell.hasRecord).length;
        const suppressedCells = cells.filter((cell) => cell.suppressedCount > 0).length;
        const noteParts = [];
        if (missingCells) noteParts.push(`${missingCells} cell(s) have no record.`);
        if (suppressedCells) noteParts.push(`${suppressedCells} cell(s) include suppressed values or are fully suppressed.`);
        dataNote.hidden = !noteParts.length;
        dataNote.textContent = noteParts.length
            ? `${noteParts.join(" ")} Patterned cells are unknown, not zero.`
            : "";

        const width = Math.max(460, chartWidth(container));
        const margin = { top: 8, right: 12, bottom: 126, left: 66 };
        const cellHeight = 30;
        const height = margin.top + margin.bottom + states.length * cellHeight;
        const svg = d3.select(container).append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", `Heatmap of injury counts by jurisdiction and road-user group for ${year}`);
        const patterns = addChartPatterns(svg, "jurisdiction-heatmap", true);
        const x = d3.scaleBand()
            .domain(users)
            .range([margin.left, width - margin.right])
            .padding(0.06);
        const y = d3.scaleBand()
            .domain(states)
            .range([margin.top, height - margin.bottom])
            .padding(0.08);
        const maximum = d3.max(cells, (cell) => cell.value) || 1;
        const color = d3.scaleSequential()
            .domain([0, maximum])
            .interpolator(d3.interpolateRgb(
                getComputedStyle(document.documentElement).getPropertyValue("--heat-low").trim(),
                getComputedStyle(document.documentElement).getPropertyValue("--heat-high").trim()
            ));

        svg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).tickSize(0))
            .call((axis) => axis.select(".domain").remove());
        svg.append("g")
            .attr("class", "heatmap-column-labels")
            .selectAll("text")
            .data(users)
            .join("text")
            .attr("x", (user) => x(user) + x.bandwidth() / 2)
            .attr("y", height - margin.bottom + 5)
            .attr("class", "heatmap-column-label")
            .attr("text-anchor", "end")
            .attr("transform", (user) => `rotate(-55,${x(user) + x.bandwidth() / 2},${height - margin.bottom + 5})`)
            .text((user) => user);

        const cellsGroup = svg.append("g").attr("class", "heatmap-cells");
        const rects = cellsGroup.selectAll(".heatmap-cell")
            .data(cells)
            .join("rect")
            .attr("class", "heatmap-cell focusable-mark")
            .attr("tabindex", 0)
            .attr("role", "img")
            .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
            .attr("x", (cell) => x(cell.user))
            .attr("y", (cell) => y(cell.state))
            .attr("width", x.bandwidth())
            .attr("height", y.bandwidth())
            .attr("rx", 2)
            .attr("fill", (cell) => cell.value === null ? `url(#${patterns.partial})` : color(cell.value))
            .attr("aria-label", (cell) => {
                if (!cell.hasRecord) return `${cell.state}, ${cell.user}: no record for ${year}`;
                if (cell.value === null) return `${cell.state}, ${cell.user}: suppressed for ${year}; value unknown`;
                return `${cell.state}, ${cell.user}: ${numberFormat.format(cell.value)} injuries in ${year}` +
                    (cell.suppressedCount ? `; ${cell.suppressedCount} suppressed value(s) also excluded` : "");
            });
        const partialCells = cells.filter((cell) => cell.value !== null && cell.suppressedCount > 0);
        cellsGroup.selectAll(".heatmap-partial-overlay")
            .data(partialCells)
            .join("rect")
            .attr("class", "heatmap-partial-overlay")
            .attr("x", (cell) => x(cell.user))
            .attr("y", (cell) => y(cell.state))
            .attr("width", x.bandwidth())
            .attr("height", y.bandwidth())
            .attr("rx", 2)
            .attr("fill", `url(#${patterns.dots})`)
            .attr("pointer-events", "none");

        attachTooltip(rects, (cell) => {
            if (!cell.hasRecord) return `${cell.state} · ${cell.user}: no record for ${year}`;
            if (cell.value === null) return `${cell.state} · ${cell.user}: suppressed for ${year}; value unknown, not zero`;
            return `${cell.state} · ${cell.user}: ${numberFormat.format(cell.value)} injuries in ${year}` +
                (cell.suppressedCount ? ` (known subtotal; ${cell.suppressedCount} suppressed value(s) excluded)` : "");
        });
        revealChart(svg);
    }

    function renderFirstNationsTrend() {
        const container = document.getElementById("first-nations-chart");
        const empty = document.getElementById("first-nations-empty");
        container.replaceChildren();
        const rows = rowsForUser(data.firstNations);
        const allYearly = summarizeRows(rows, (row) => row.year)
            .map((row) => ({ year: row.key, ...row }))
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
        addAxes(svg, x, y, width, height, margin, "Known injuries");
        const line = d3.line()
            .defined((row) => row.value !== null)
            .x((row) => x(row.year))
            .y((row) => y(row.value));
        svg.append("path")
            .datum(allYearly)
            .attr("class", "series-line")
            .attr("stroke", COLORS.firstNations)
            .attr("stroke-dasharray", "6 3")
            .attr("d", line);
        const points = svg.selectAll(".first-nations-point")
            .data(yearly)
            .join("circle")
            .attr("class", "series-point focusable-mark first-nations-point")
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
        revealChart(svg);
    }

    function render() {
        updateSummary();
        renderNationalTrend();
        renderRoadUserBars();
        renderRoadUserTrends();
        renderStateHeatmap();
        renderFirstNationsTrend();
    }

    function bindControls() {
        document.getElementById("year-filter").addEventListener("change", (event) => {
            filters.year = event.target.value;
            render();
        });
        document.getElementById("state-filter").addEventListener("change", (event) => {
            filters.state = event.target.value;
            render();
        });
        document.getElementById("user-filter").addEventListener("change", (event) => {
            filters.user = event.target.value;
            render();
        });
        document.getElementById("reset-filters").addEventListener("click", () => {
            filters.year = "";
            filters.state = "";
            filters.user = "";
            updateFilters();
            render();
        });
    }

    async function start() {
        initializeTheme();
        document.addEventListener("keydown", handleChartArrowNavigation);
        bindControls();
        const results = await Promise.all(Object.entries(FILES).map(async ([kind, path]) => {
            try {
                return { kind, rows: await loadDataset(kind, path) };
            } catch (error) {
                return { kind, error };
            }
        }));

        const messages = [];
        results.forEach((result) => {
            if (result.error) {
                messages.push(`${FILES[result.kind]} could not be loaded: ${result.error.message}`);
                return;
            }
            data[result.kind] = result.rows;
            if (!result.rows.length) messages.push(`${FILES[result.kind]} contains no usable records.`);
        });
        const suppressedStateRows = data.state.filter((row) => row.suppressed).length;
        const suppressedFirstNationsRows = data.firstNations.filter((row) => row.suppressed).length;
        if (suppressedStateRows) {
            messages.push(`${suppressedStateRows} state record(s) are flagged suppressed; they are excluded from known subtotals.`);
        }
        if (suppressedFirstNationsRows) {
            messages.push(`${suppressedFirstNationsRows} First Nations record(s) are flagged suppressed; trend points identify known subtotals.`);
        }

        setStatus(messages);
        updateFilters();
        render();
        window.addEventListener("resize", render);
    }

    start();
}());
