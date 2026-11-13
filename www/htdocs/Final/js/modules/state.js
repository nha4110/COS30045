export const d3 = window.d3;
// Charts use only the team-prepared BITRE records; missing counts are never generated or imputed.
export const FILES = {
        national: "data/national_road_user_by_year.csv",
        state: "data/state_road_user_by_year.csv",
        firstNations: "data/first_nations_road_user_by_year.csv",
        demographic: "data/national_road_user_age_sex_by_year.csv"
    };
export const COLORS = {
        complete: "var(--chart-primary)",
        firstNations: "var(--chart-primary)"
    };
export const SERIES_COLORS = ["var(--series-blue)", "var(--series-orange)", "var(--series-green)", "var(--series-purple)",
        "var(--series-sky)", "var(--series-vermilion)", "var(--series-yellow)", "var(--series-grey)"];
export const SERIES_DASHES = ["", "7 4", "2 3", "9 3 2 3", "5 2", "1 3", "8 2 2 2", "4 4"];
export const SERIES_SYMBOLS = [d3.symbolCircle, d3.symbolSquare, d3.symbolDiamond, d3.symbolTriangle,
        d3.symbolCross, d3.symbolStar, d3.symbolWye, d3.symbolPlus];
export const SUPPRESSED_VALUES = new Set([
        "", "na", "n/a", "nan", "null", "suppressed", "s", "np",
        "n.p.", "not available", "-", "—", "–", "..", "..."
    ]);
export const data = { national: [], state: [], firstNations: [], demographic: [] };
export const filters = { year: "", state: "", user: "Pedal cyclist", demographicYear: "" };
export const tooltip = document.getElementById("chart-tooltip");
export const themeToggle = document.getElementById("theme-toggle");
export const themeToggleLabel = document.getElementById("theme-toggle-label");
export const numberFormat = new Intl.NumberFormat("en-AU");
export const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
export const annotationLabels = {
        2012: "Victoria: break in the source series from 2012",
        2017: "New South Wales: break in the source series from June 2017"
    };

    export function normalizeHeader(value) {
        return value.toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    export function findColumn(columns, candidates) {
        const normalized = new Map(columns.map((column) => [normalizeHeader(column), column]));
        for (const candidate of candidates) {
            const found = normalized.get(normalizeHeader(candidate));
            if (found) return found;
        }
        return null;
    }
    export function parseValue(value) {
        if (value === undefined || value === null) return null;
        const text = String(value).trim();
        if (SUPPRESSED_VALUES.has(text.toLowerCase())) return null;
        const numeric = Number(text.replace(/,/g, ""));
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
    }
    export function isFlaggedSuppressed(value) {
        return ["1", "true", "yes", "y", "suppressed"].includes(String(value).trim().toLowerCase());
    }
    export function canonicalRoadUser(value) {
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
    export function parseRows(rows, kind) {
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
    export async function loadDataset(kind, path) {
        return parseRows(await d3.csv(path), kind);
    }
    export function selectedYear() {
        if (filters.year) return Number(filters.year);
        return data.national.reduce((latest, row) => Math.max(latest, row.year), 0);
    }
    export function setStatus(messages) {
        const element = document.getElementById("data-status");
        if (!messages.length) {
            element.hidden = true;
            element.textContent = "";
            return;
        }
        element.hidden = false;
        element.textContent = `Data notice: ${messages.join(" ")}`;
    }
    export function updateSelect(select, values, placeholder, currentValue, labelFor = (value) => value) {
        select.replaceChildren(new Option(placeholder, ""));
        values.forEach((value) => select.add(new Option(labelFor(value), value)));
        select.value = values.includes(currentValue) ? currentValue : "";
    }
    export function updateFilters() {
        const years = [...new Set([...data.national, ...data.state, ...data.firstNations].map((row) => row.year))]
            .sort((a, b) => a - b)
            .map(String);
        const states = [...new Set(data.state.map((row) => row.state).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
        const users = [...new Set([...data.national, ...data.state, ...data.firstNations].map((row) => row.user).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));

        updateSelect(document.getElementById("year-filter"), years, "Latest available year", filters.year);
        updateSelect(document.getElementById("state-filter"), states, "All jurisdictions", filters.state, fullStateName);
        updateSelect(document.getElementById("user-filter"), users, "Choose a road-user group", filters.user);
        const demographicYears = [...new Set(data.demographic.map((row) => row.year))].sort((a, b) => a - b).map(String);
        updateSelect(document.getElementById("demographic-year-filter"), demographicYears, "All Years Total (2011\u20132021)", filters.demographicYear);
        const userSelect = document.getElementById("user-filter");
        userSelect.options[0].disabled = true;
        if (!userSelect.value && users.length) userSelect.value = users.includes("Pedal cyclist") ? "Pedal cyclist" : users[0];
        filters.year = document.getElementById("year-filter").value;
        filters.state = document.getElementById("state-filter").value;
        filters.user = document.getElementById("user-filter").value;
        filters.demographicYear = document.getElementById("demographic-year-filter").value;
    }
    export function rowsForUser(rows) {
        return filters.user ? rows.filter((row) => row.user === filters.user) : rows;
    }
    export function summarizeRows(rows, keyFn) {
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
    export function addChartPatterns(svg, chartName, transparentDots) {
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
    export function revealChart(svg) {
        svg.style("opacity", 0)
            .transition("chart-reveal")
            .duration(reducedMotion.matches ? 0 : 750)
            .style("opacity", 1);
    }
    export function setEmptyState(element, message, isEmpty) {
        element.hidden = !isEmpty;
        if (isEmpty) element.textContent = message;
    }
    export function showTooltip(event, text) {
        tooltip.textContent = text;
        tooltip.hidden = false;
        const rect = tooltip.getBoundingClientRect();
        const left = Math.min(event.clientX + 12, window.innerWidth - rect.width - 8);
        const top = Math.min(event.clientY + 12, window.innerHeight - rect.height - 8);
        tooltip.style.left = `${Math.max(8, left)}px`;
        tooltip.style.top = `${Math.max(8, top)}px`;
    }
    export function hideTooltip() {
        tooltip.hidden = true;
    }
    export function setTheme(theme, persist) {
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
    export function initializeTheme(onChange) {
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
            onChange();
        });
    }
    export function handleChartArrowNavigation(event) {
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
    export function attachTooltip(selection, labelFn) {
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
    export function chartWidth(element) {
        return Math.max(280, element.clientWidth);
    }
    export function addAxes(svg, x, y, width, height, margin, yLabel) {
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
    export function fullStateName(code) {
        const names = { ACT: "Australian Capital Territory", NSW: "New South Wales", NT: "Northern Territory", QLD: "Queensland", SA: "South Australia", TAS: "Tasmania", VIC: "Victoria", WA: "Western Australia" };
        return names[String(code).trim().toUpperCase()] || code;
    }
    export function addColorPattern(svg, id, color, crosshatch) {
        const pattern = svg.append("defs").append("pattern").attr("id", id).attr("patternUnits", "userSpaceOnUse").attr("width", 8).attr("height", 8);
        pattern.append("rect").attr("width", 8).attr("height", 8).attr("fill", color);
        pattern.append("path").attr("d", crosshatch ? "M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4 M-2,6 l4,4 M0,0 l8,8 M6,-2 l4,4" : "M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4")
            .attr("fill", "none").attr("stroke", "var(--pattern-contrast)").attr("stroke-width", 1.5);
        return `url(#${id})`;
    }
    export function clearChart(container) {
        [...container.children].forEach((node) => {
            node.classList.add("chart-exit"); node.style.position = "absolute"; node.style.inset = "0"; node.style.pointerEvents = "none";
            d3.select(node).interrupt().transition("chart-exit").duration(reducedMotion.matches ? 0 : 180).style("opacity", 0).remove();
        });
    }
    export function animateMarks(selection, targetOpacity = 1) {
        selection.attr("opacity", 0).transition("mark-enter").duration(reducedMotion.matches ? 0 : 750).attr("opacity", targetOpacity);
    }
    export function attachSeriesHover(selection) {
        const emphasize = function () {
            const active = this;
            d3.select(this.ownerSVGElement).selectAll(".series-line")
                .interrupt("series-focus")
                .transition("series-focus")
                .duration(reducedMotion.matches ? 0 : 180)
                .style("opacity", function () { return this === active ? 1 : 0.18; })
                .style("pointer-events", function () { return this === active ? "stroke" : "none"; });
        };
        const restore = function () {
            d3.select(this.ownerSVGElement).selectAll(".series-line")
                .interrupt("series-focus")
                .transition("series-focus")
                .duration(reducedMotion.matches ? 0 : 220)
                .style("opacity", 1)
                .style("pointer-events", null);
        };
        selection.attr("tabindex", 0).attr("role", "img").on("pointerenter focus", emphasize).on("pointerleave blur", restore);
        return selection;
    }
    export function bindFilterListeners(handlers) {
        document.getElementById("year-filter").addEventListener("change", (event) => { filters.year = event.target.value; handlers.onYear(); });
        document.getElementById("state-filter").addEventListener("change", (event) => { filters.state = event.target.value; handlers.onState(); });
        document.getElementById("user-filter").addEventListener("change", (event) => { filters.user = event.target.value; handlers.onUser(); });
        document.getElementById("demographic-year-filter").addEventListener("change", (event) => { filters.demographicYear = event.target.value; handlers.onDemographicYear(); });
        document.getElementById("reset-filters").addEventListener("click", () => {
            filters.year = ""; filters.state = ""; filters.user = "Pedal cyclist"; filters.demographicYear = "";
            updateFilters(); handlers.onReset();
        });
    }
