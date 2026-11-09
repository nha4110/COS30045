(function () {
    "use strict";

    // Charts use only the team-prepared BITRE records; missing counts are never generated or imputed.
    const FILES = {
        national: "data/national_road_user_by_year.csv",
        state: "data/state_road_user_by_year.csv",
        firstNations: "data/first_nations_road_user_by_year.csv",
        demographic: "data/national_road_user_age_sex_by_year.csv"
    };
    const COLORS = {
        complete: "var(--chart-primary)",
        firstNations: "var(--chart-primary)"
    };
    const SUPPRESSED_VALUES = new Set([
        "", "na", "n/a", "nan", "null", "suppressed", "s", "np",
        "n.p.", "not available", "-", "—", "–", "..", "..."
    ]);
    const data = { national: [], state: [], firstNations: [], demographic: [] };
    const filters = { year: "", state: "", user: "Pedal cyclist", sex: "" };
    const tooltip = document.getElementById("chart-tooltip");
    const themeToggle = document.getElementById("theme-toggle");
    const themeToggleLabel = document.getElementById("theme-toggle-label");
    const numberFormat = new Intl.NumberFormat("en-AU");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const annotationLabels = {
        2012: "Victoria: break in the source series from 2012",
        2017: "NSW: break in the source series from June 2017"
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
        const ageColumn = findColumn(columns, ["age_group", "age"]);
        const sexColumn = findColumn(columns, ["sex"]);
        if (kind === "demographic" && (!ageColumn || !sexColumn || !userColumn || !valueColumn)) {
            throw new Error("Demographic data require year, road_user, age_group, sex and injuries columns.");
        }

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
                age: ageColumn ? String(row[ageColumn]).trim() : "",
                sex: sexColumn ? String(row[sexColumn]).trim() : "",
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
        updateSelect(document.getElementById("user-filter"), users, "Choose a road-user group", filters.user);
        const sexValues = [...new Set(data.demographic.map((row) => row.sex).filter(Boolean))].sort();
        updateSelect(document.getElementById("sex-filter"), sexValues, "All recorded sex categories", filters.sex);
        const userSelect = document.getElementById("user-filter");
        userSelect.options[0].disabled = true;
        if (!userSelect.value && users.length) userSelect.value = users.includes("Pedal cyclist") ? "Pedal cyclist" : users[0];
        filters.year = document.getElementById("year-filter").value;
        filters.state = document.getElementById("state-filter").value;
        filters.user = document.getElementById("user-filter").value;
        filters.sex = document.getElementById("sex-filter").value;
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
            render();
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
        const selectedRows = data.national;
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
            const markerYear = year === 2017 ? 2017.5 : year;
            if (year < minYear || year > maxYear) return;
            const group = svg.append("g")
                .attr("class", "focusable-mark")
                .attr("tabindex", 0)
                .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
                .attr("aria-label", `${year}: ${label}`);
            group.append("line")
                .attr("class", "annotation-line")
                .attr("x1", x(markerYear))
                .attr("x2", x(markerYear))
                .attr("y1", margin.top)
                .attr("y2", height - margin.bottom);
            group.append("text")
                .attr("class", "annotation-label")
                .attr("x", x(markerYear) + 4)
                .attr("y", margin.top + (year === 2012 ? 11 : 25))
                .text(year === 2012 ? "Vic · 2012" : "NSW · Jun 2017");
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
            `${row.year}: ${numberFormat.format(row.value)} hospitalised injuries nationally` +
            (row.suppressedCount ? ` (known subtotal; ${row.suppressedCount} suppressed or missing value(s) excluded)` : "")
        );
        revealChart(svg);
    }

    function signed(value) {
        return `${value > 0 ? "+" : value < 0 ? "−" : ""}${numberFormat.format(Math.abs(value))}`;
    }

    function percent(value) {
        return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
    }

    function nationalCount(year, user) {
        const rows = data.national.filter((row) => row.year === year && (!user || row.user === user));
        return rows.length && rows.every((row) => row.value !== null)
            ? d3.sum(rows, (row) => row.value) : null;
    }

    function shortUser(user) {
        return user === "Pick-up truck or van occupant" ? "Pick-up / van occupant" : user;
    }

    function updateSummary() {
        const year = selectedYear();
        const national = nationalCount(year);
        const baseline = nationalCount(2011);
        const start = nationalCount(2011, filters.user);
        const end = nationalCount(year, filters.user);
        const change = start !== null && end !== null ? end - start : null;
        const net = national !== null && baseline !== null ? national - baseline : null;
        document.getElementById("kpi-national").textContent = national === null ? "—" : numberFormat.format(national);
        document.getElementById("kpi-total-label").textContent = `NATIONAL INJURIES · ${year || "UNAVAILABLE"}`;
        document.getElementById("kpi-national-note").textContent = "All road users · all recorded sex categories";
        document.getElementById("kpi-change-label").textContent = `${filters.user.toUpperCase()} · CHANGE SINCE 2011`;
        document.getElementById("kpi-latest-year").textContent = change === null || !start ? "—" : percent(change / start * 100);
        document.getElementById("kpi-change-note").textContent = change === null ? "Endpoint data unavailable" : `${signed(change)} cases · 2011 to ${year}`;
        document.getElementById("kpi-current-view").textContent = change === null || !net ? "—" : `${(change / net * 100).toFixed(1)}%`;
        document.getElementById("kpi-current-note").textContent = !net
            ? "No national net change to divide by"
            : `${filters.user} change ÷ national net change; not a share of all cases`;
    }

    function renderRoadUserBars() {
        const container = document.getElementById("road-user-chart");
        container.replaceChildren();
        const year = selectedYear();
        const users = [...new Set(data.national.map((row) => row.user))];
        const groups = users.map((user) => {
            const before = nationalCount(2011, user), after = nationalCount(year, user);
            return { user, before, after, change: before !== null && after !== null ? after - before : null };
        }).filter((row) => row.change !== null).sort((a, b) => b.change - a.change);
        document.getElementById("road-user-chart-unit").textContent = `National · 2011 → ${year}`;
        document.getElementById("road-user-data-note").textContent = "Car and heavy-transport positions are grouped consistently across files. Bar length shows an absolute change in cases, not percentage growth.";
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
            .call(d3.axisBottom(x).ticks(width < 400 ? 3 : 4).tickFormat(d3.format("~s")));
        svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left - 6},0)`)
            .call(d3.axisLeft(y).tickSize(0).tickFormat(shortUser)).call((axis) => axis.select(".domain").remove());
        svg.append("line").attr("class", "zero-line").attr("x1", x(0)).attr("x2", x(0))
            .attr("y1", margin.top).attr("y2", height - margin.bottom);
        const label = (row) => `${row.user}: ${numberFormat.format(row.before)} in 2011; ${numberFormat.format(row.after)} in ${year}; change ${signed(row.change)} cases`;
        const bars = svg.selectAll(".change-bar").data(groups).join("rect")
            .attr("class", "bar focusable-mark change-bar").attr("tabindex", 0).attr("role", "img")
            .attr("aria-label", label).attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
            .attr("x", (row) => x(Math.min(0, row.change))).attr("y", (row) => y(row.user))
            .attr("width", (row) => Math.max(1, Math.abs(x(row.change) - x(0)))).attr("height", y.bandwidth())
            .attr("fill", (row) => row.user === filters.user ? "var(--chart-primary)" : "var(--chart-secondary)")
            .attr("opacity", (row) => row.user === filters.user ? 1 : 0.65).attr("rx", 2);
        attachTooltip(bars, label);
        svg.selectAll(".bar-value").data(groups).join("text").attr("class", "bar-value")
            .attr("x", (row) => x(Math.max(0, row.change)) + 5)
            .attr("text-anchor", "start")
            .attr("y", (row) => y(row.user) + y.bandwidth() / 2 + 4).text((row) => signed(row.change));
        svg.append("text").attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 5)
            .attr("text-anchor", "middle").text("Change in recorded hospitalisations");
        revealChart(svg);
    }

    function renderRoadUserTrends() {
        const container = document.getElementById("road-user-trend-chart");
        const legend = document.getElementById("road-user-trend-legend");
        container.replaceChildren(); legend.replaceChildren();
        const years = [...new Set(data.national.map((row) => row.year))].sort((a, b) => a - b);
        const series = [{ name: filters.user, user: filters.user, color: "var(--chart-primary)", dash: "" },
            { name: "All road users", user: "", color: "var(--chart-secondary)", dash: "6 4" }].map((item) => {
            const baseline = nationalCount(2011, item.user);
            return { ...item, values: years.map((year) => {
                const count = nationalCount(year, item.user);
                return { year, count, value: baseline > 0 && count !== null ? count / baseline * 100 : null };
            }) };
        });
        document.getElementById("road-user-trend-unit").textContent = `${filters.user} vs national · 2011 = 100`;
        const values = series.flatMap((item) => item.values).filter((row) => row.value !== null);
        setEmptyState(document.getElementById("road-user-trend-empty"), "A positive 2011 baseline is required to calculate the index.", !values.length);
        if (!values.length) return;
        const width = chartWidth(container), height = 340;
        const margin = { top: 18, right: 16, bottom: 40, left: 62 };
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img").attr("aria-label", `${filters.user} and all road users, indexed counts, 2011 equals 100`);
        const x = d3.scaleLinear().domain(d3.extent(years)).range([margin.left, width - margin.right]);
        const y = d3.scaleLinear().domain([0, d3.max(values, (row) => row.value) * 1.12]).nice().range([height - margin.bottom, margin.top]);
        addAxes(svg, x, y, width, height, margin, "Recorded count index · 2011 = 100");
        svg.append("line").attr("class", "baseline-guide").attr("x1", margin.left).attr("x2", width - margin.right)
            .attr("y1", y(100)).attr("y2", y(100));
        const line = d3.line().defined((row) => row.value !== null).x((row) => x(row.year)).y((row) => y(row.value));
        series.forEach((item, index) => {
            svg.append("path").datum(item.values).attr("class", "series-line").attr("stroke", item.color)
                .attr("stroke-dasharray", item.dash).attr("d", line);
            const label = (row) => `${row.year} · ${item.name}: index ${row.value.toFixed(1)}; ${numberFormat.format(row.count)} cases`;
            const marks = svg.append("g").selectAll("path").data(item.values.filter((row) => row.value !== null)).join("path")
                .attr("class", "series-point focusable-mark").attr("tabindex", 0).attr("role", "img")
                .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight").attr("aria-label", label)
                .attr("transform", (row) => `translate(${x(row.year)},${y(row.value)})`)
                .attr("d", d3.symbol().type(index ? d3.symbolSquare : d3.symbolCircle).size(45)()).attr("fill", item.color);
            attachTooltip(marks, label);
            const entry = document.createElement("span"); entry.className = "trend-legend-item";
            const swatch = document.createElement("span"); swatch.className = "trend-legend-line";
            swatch.style.borderTopColor = item.color; swatch.style.borderTopStyle = index ? "dashed" : "solid";
            swatch.setAttribute("aria-hidden", "true");
            const text = document.createElement("span"); text.className = "trend-legend-label"; text.textContent = item.name;
            entry.append(swatch, text); legend.append(entry);
        });
        revealChart(svg);
    }

    function demographicRows() {
        return data.demographic.filter((row) => row.user === filters.user && (!filters.sex || row.sex === filters.sex));
    }

    function renderDemographics() {
        const year = selectedYear();
        document.getElementById("demographic-title").textContent = `Who contributed within the ${filters.user.toLowerCase()} group?`;
        document.getElementById("demographic-unit").textContent = `National · 2011 versus ${year}`;
        const ageRows = demographicRows();
        const baseline40 = ageRows.filter((row) => row.year === 2011 && row.age === "40-64");
        const current40 = ageRows.filter((row) => row.year === year && row.age === "40-64");
        const scope = filters.sex || "all recorded sex categories";
        document.getElementById("demographic-description").textContent = baseline40.length && current40.length
            ? `For ${filters.user.toLowerCase()}, ages 40–64 changed from ${numberFormat.format(d3.sum(baseline40, (row) => row.value))} cases in 2011 to ${numberFormat.format(d3.sum(current40, (row) => row.value))} in ${year} (${scope}). Explore the other ages below. These counts do not measure differences in risk.`
            : `Explore the age and sex profile for ${filters.user.toLowerCase()} (${scope}). Endpoint combinations without a record remain unavailable; they are not filled with zero.`;
        renderAgeComparison(ageRows, year);
        renderSexBars(ageRows, year);
    }

    function renderAgeComparison(rows, year) {
        const container = document.getElementById("age-chart"); container.replaceChildren();
        document.getElementById("age-year-key").textContent = year;
        const endpoints = rows.filter((row) => row.year === 2011 || row.year === year);
        const ageOrder = ["0-7", "8-16", "17-25", "26-39", "40-64", "65-74", "75+", "Missing"];
        const ages = [...new Set(endpoints.map((row) => row.age))].sort((a, b) => {
            const ai = ageOrder.indexOf(a), bi = ageOrder.indexOf(b);
            return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
        });
        const summaries = summarizeRows(endpoints, (row) => `${row.year}|${row.age}`);
        const lookup = new Map(summaries.map((row) => [row.key, row.value]));
        const values = ages.map((age) => ({ age, before: lookup.get(`2011|${age}`) ?? null, after: lookup.get(`${year}|${age}`) ?? null }));
        setEmptyState(document.getElementById("age-empty"), "No age records match this selection.", !values.length);
        document.getElementById("age-data-note").textContent = values.some((row) => row.before === null || row.after === null)
            ? "An absent endpoint has no mark; it is not a reported zero. Missing is retained as a source age label."
            : `${filters.sex || "All recorded sex categories"} · ${filters.user}. Hover or focus an endpoint for its exact count.`;
        if (!values.length) return;
        const width = chartWidth(container), height = Math.max(270, ages.length * 35 + 50);
        const margin = { top: 14, right: 22, bottom: 44, left: 57 };
        const maximum = d3.max(values, (row) => Math.max(row.before ?? 0, row.after ?? 0)) || 1;
        const x = d3.scaleLinear().domain([0, maximum * 1.08]).nice().range([margin.left, width - margin.right]);
        const y = d3.scaleBand().domain(ages).range([margin.top, height - margin.bottom]).padding(0.4);
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img").attr("aria-label", `Age comparison for ${filters.user}, ${filters.sex || "all sex categories"}, 2011 and ${year}`);
        svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(width < 400 ? 3 : 4).tickFormat(d3.format("~s")));
        svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).tickSize(0)).call((axis) => axis.select(".domain").remove());
        svg.selectAll(".age-connector").data(values.filter((row) => row.before !== null && row.after !== null)).join("line")
            .attr("class", "age-connector").attr("x1", (row) => x(row.before)).attr("x2", (row) => x(row.after))
            .attr("y1", (row) => y(row.age) + y.bandwidth() / 2).attr("y2", (row) => y(row.age) + y.bandwidth() / 2);
        const points = values.flatMap((row) => [
            { age: row.age, year: 2011, value: row.before, baseline: true },
            { age: row.age, year, value: row.after, baseline: false }
        ]).filter((row) => row.value !== null);
        const label = (row) => `${filters.user}, age ${row.age}, ${filters.sex || "all sex categories"}: ${numberFormat.format(row.value)} cases in ${row.year}`;
        const marks = svg.selectAll(".age-point").data(points).join("path")
            .attr("class", "series-point focusable-mark age-point").attr("tabindex", 0).attr("role", "img")
            .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight").attr("aria-label", label)
            .attr("transform", (row) => `translate(${x(row.value)},${y(row.age) + y.bandwidth() / 2})`)
            .attr("d", (row) => d3.symbol().type(row.baseline ? d3.symbolCircle : d3.symbolSquare).size(62)())
            .attr("fill", (row) => row.baseline ? "var(--surface)" : "var(--chart-primary)")
            .style("stroke", "var(--chart-primary)").style("stroke-width", 2);
        attachTooltip(marks, label);
        svg.append("text").attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 7)
            .attr("text-anchor", "middle").text("Recorded hospitalisations");
        revealChart(svg);
    }

    function renderSexBars(rows, year) {
        const container = document.getElementById("sex-chart"); container.replaceChildren();
        const grouped = summarizeRows(rows.filter((row) => row.year === year), (row) => row.sex)
            .filter((row) => row.value !== null).sort((a, b) => d3.descending(a.value, b.value));
        setEmptyState(document.getElementById("sex-empty"), "No sex records match this selection.", !grouped.length);
        document.getElementById("sex-data-note").textContent = grouped.length
            ? `${year} · ${grouped.map((row) => `${row.key}: ${numberFormat.format(row.value)}`).join("; ")}.` : "";
        if (!grouped.length) return;
        const width = chartWidth(container), height = 270;
        const margin = { top: 14, right: 53, bottom: 44, left: Math.min(138, width * 0.38) };
        const x = d3.scaleLinear().domain([0, (d3.max(grouped, (row) => row.value) || 1) * 1.05]).nice().range([margin.left, width - margin.right]);
        const y = d3.scaleBand().domain(grouped.map((row) => row.key)).range([margin.top, height - margin.bottom]).padding(0.55);
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img").attr("aria-label", `Recorded hospitalisations by sex for ${filters.user}, ${year}`);
        svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(width < 400 ? 3 : 4).tickFormat(d3.format("~s")));
        const axis = svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left - 5},0)`)
            .call(d3.axisLeft(y).tickSize(0)).call((group) => group.select(".domain").remove());
        axis.selectAll(".tick text").each(function (name) {
            if (name !== "intersex or indeterminate or missing") return;
            const text = d3.select(this).text("");
            ["intersex or", "indeterminate", "or missing"].forEach((part, i) => text.append("tspan").attr("x", -9).attr("dy", i ? "1.1em" : "-0.9em").text(part));
        });
        const total = d3.sum(grouped, (row) => row.value);
        const label = (row) => `${row.key}: ${numberFormat.format(row.value)} ${filters.user.toLowerCase()} cases in ${year}; ${total ? (row.value / total * 100).toFixed(1) + "% of displayed counts" : "share unavailable because the displayed total is zero"}`;
        const bars = svg.selectAll(".sex-bar").data(grouped).join("rect").attr("class", "bar focusable-mark sex-bar")
            .attr("tabindex", 0).attr("role", "img").attr("aria-label", label)
            .attr("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight")
            .attr("x", x(0)).attr("y", (row) => y(row.key)).attr("width", (row) => Math.max(1, x(row.value) - x(0)))
            .attr("height", y.bandwidth()).attr("fill", "var(--chart-primary)").attr("rx", 2);
        attachTooltip(bars, label);
        svg.selectAll(".bar-value").data(grouped).join("text").attr("class", "bar-value")
            .attr("x", (row) => x(row.value) + 5).attr("y", (row) => y(row.key) + y.bandwidth() / 2 + 4)
            .text((row) => numberFormat.format(row.value));
        svg.append("text").attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 7)
            .attr("text-anchor", "middle").text("Recorded hospitalisations");
        revealChart(svg);
    }


    function renderStateHeatmap() {
        const container = document.getElementById("state-chart");
        const empty = document.getElementById("state-empty");
        const dataNote = document.getElementById("state-data-note");
        container.replaceChildren();
        const year = selectedYear();
        const rows = data.state.filter((row) =>
            row.year === year && (!filters.state || row.state === filters.state)
        );
        document.getElementById("comparison-year-label").textContent = `Selected year: ${year || "unavailable"}`;
        const states = [...new Set(data.state.map((row) => row.state).filter(Boolean))]
            .filter((state) => !filters.state || state === filters.state)
            .sort((a, b) => a.localeCompare(b));
        const users = [...new Set(data.state.map((row) => row.user).filter(Boolean))]
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
        document.getElementById("first-nations-title").textContent = `First Nations · ${filters.user}`;
        const missingCount = rows.filter((row) => row.suppressed || row.value === null).length;
        document.getElementById("first-nations-data-note").textContent = `${filters.user}: ${missingCount} suppressed or unavailable year(s). No partial totals are connected. The jurisdiction and sex filters do not apply to this panel.`;
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
        hideTooltip();
        updateSummary();
        renderNationalTrend();
        renderRoadUserBars();
        renderRoadUserTrends();
        renderDemographics();
        if (document.getElementById("supplementary").open) {
            renderStateHeatmap();
            renderFirstNationsTrend();
        }
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
        document.getElementById("sex-filter").addEventListener("change", (event) => {
            filters.sex = event.target.value;
            render();
        });
        document.getElementById("supplementary").addEventListener("toggle", () => {
            if (document.getElementById("supplementary").open) render();
        });
        document.getElementById("reset-filters").addEventListener("click", () => {
            filters.year = "";
            filters.state = "";
            filters.user = "Pedal cyclist";
            filters.sex = "";
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
        document.getElementById("supplementary-data-status").textContent =
            `Across the complete CSVs, ${suppressedStateRows} state records and ${suppressedFirstNationsRows} First Nations records are suppressed. They remain unknown, not zero. The visible selection may contain fewer suppressed records.`;

        setStatus(messages);
        updateFilters();
        render();
        window.addEventListener("resize", render);
    }

    start();
}());