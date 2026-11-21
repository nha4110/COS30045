import { d3, data, filters, setEmptyState, chartWidth, attachTooltip, revealChart, clearChart, numberFormat, SERIES_COLORS, reducedMotion, fullStateName } from "./state.js";

const STATE_NAMES = ["ACT", "NSW", "NT", "Qld", "SA", "Tas", "Vic", "WA"];
const STATE_SHAPES = {
    WA: "55,70 195,70 195,218 218,232 203,320 58,300",
    NT: "195,70 305,70 305,158 245,158 245,218 195,218",
    SA: "195,218 245,218 245,158 305,158 305,244 255,260 218,238 203,232",
    Qld: "305,70 443,70 467,164 431,188 365,166 305,158",
    NSW: "305,158 365,166 431,188 418,252 330,260 305,244",
    Vic: "295,260 330,260 418,252 400,300 298,300",
    Tas: "365,326 388,326 396,350 374,356 360,344",
    ACT: "350,230 361,230 361,241 350,241"
};
const STATE_LABELS = { WA: [118,180], NT: [250,135], SA: [250,220], Qld: [382,132], NSW: [370,220], Vic: [354,286], Tas: [380,350], ACT: [356,237] };
const duration = (ms) => reducedMotion.matches ? 0 : ms;
let selectedRoadUser = "Pedal cyclist";
let hasChosenJurisdiction = false;
let hasRevealedTreemap = false;

function jurisdictionTotals() {
    return d3.rollups(data.state, (rows) => d3.sum(rows.filter((row) => !row.suppressed && row.value !== null), (row) => row.value), (row) => row.state)
        .map(([state, total]) => ({ state, total }));
}

function renderJurisdictionMap() {
    const container = document.getElementById("jurisdiction-map-chart");
    if (!container) return;
    clearChart(container);
    const totals = jurisdictionTotals();
    const topFive = new Set([...totals].sort((a, b) => b.total - a.total).slice(0, 5).map((row) => row.state.toUpperCase()));
    const totalByCode = new Map(totals.map((row) => [row.state.toUpperCase(), row.total]));
    const width = chartWidth(container);
    const height = 400;
    const scale = Math.min((width - 30) / 620, (height - 54) / 380);
    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img").attr("aria-label", "Clickable map of Australian states and territories; the five with highest known recorded totals are highlighted");
    const map = svg.append("g").attr("transform", `translate(${(width - 620 * scale) / 2},${(height - 360 * scale) / 2}) scale(${scale})`);
    const regions = map.selectAll("g").data(STATE_NAMES).join("g").attr("class", "jurisdiction-region")
        .attr("data-jurisdiction", (state) => state);
    regions.append("polygon").attr("points", (state) => STATE_SHAPES[state])
        .attr("fill", (state) => topFive.has(state.toUpperCase()) ? "#c94b40" : "#8ab7c7")
        .attr("stroke", "var(--surface)")
        .attr("stroke-width", 3 / scale)
        .attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", (state) => `${fullStateName(state)}: ${numberFormat.format(totalByCode.get(state.toUpperCase()) || 0)} known recorded injuries${topFive.has(state.toUpperCase()) ? ", among the five highest" : ""}`)
        .on("click", (_, state) => selectJurisdiction(state))
        .on("keydown", (event, state) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); selectJurisdiction(state); } });
    regions.filter((state) => state !== "ACT").append("text")
        .attr("x", (state) => STATE_LABELS[state][0]).attr("y", (state) => STATE_LABELS[state][1])
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle").attr("class", "jurisdiction-map-label")
        .each(function (state) {
            const words = fullStateName(state).split(" ");
            const label = d3.select(this);
            if (words.length > 1) {
                label.append("tspan").attr("x", STATE_LABELS[state][0]).text(words.slice(0, Math.ceil(words.length / 2)).join(" "));
                label.append("tspan").attr("x", STATE_LABELS[state][0]).attr("dy", "1.1em")
                    .text(words.slice(Math.ceil(words.length / 2)).join(" "));
            } else label.text(words[0]);
        });
    attachTooltip(regions.select("polygon"), (state) => `${fullStateName(state)}: ${numberFormat.format(totalByCode.get(state.toUpperCase()) || 0)} known recorded injuries` +
        (topFive.has(state.toUpperCase()) ? " Top five recorded total" : ""));
    const legend = svg.append("g").attr("class", "jurisdiction-map-legend").attr("transform", `translate(${Math.max(14, width / 2 - 118)},${height - 18})`);
    [["#c94b40", "Top 5 recorded totals"], ["#8ab7c7", "Other jurisdictions"]].forEach(([fill, label], i) => {
        const item = legend.append("g").attr("transform", `translate(${i * 155},0)`);
        item.append("rect").attr("width", 13).attr("height", 13).attr("rx", 2).attr("fill", fill);
        item.append("text").attr("x", 19).attr("y", 11).text(label);
    });
    revealChart(svg);
}

function selectJurisdiction(state) {
    filters.state = state;
    if (!hasRevealedTreemap) {
        hasChosenJurisdiction = true;
        hasRevealedTreemap = true;
    }
    selectedRoadUser = "Pedal cyclist";
    renderRoadUserComposition();
}

function renderTreemap() {
    const container = document.getElementById("road-user-composition-chart");
    const empty = document.getElementById("road-user-composition-empty");
    if (!container || !empty) return;
    const dataNote = document.getElementById("road-user-composition-note");
    clearChart(container);
    const selectedRows = data.state.filter((row) => !filters.state || row.state.toUpperCase() === filters.state.toUpperCase());
    const totals = d3.rollups(selectedRows, (rows) => ({
        value: d3.sum(rows.filter((row) => !row.suppressed && row.value !== null), (row) => row.value),
        suppressed: rows.filter((row) => row.suppressed || row.value === null).length
    }), (row) => row.user).map(([user, summary]) => ({ user, ...summary }))
        .filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
    const suppressedCount = selectedRows.filter((row) => row.suppressed || row.value === null).length;
    setEmptyState(empty, "No recorded road-user counts are available for this jurisdiction.", !totals.length);
    if (dataNote) dataNote.textContent = `${suppressedCount} suppressed or unavailable record(s) excluded. Unknown values remain unknown, not zero.`;
    if (!totals.length) return;

    const width = chartWidth(container);
    const height = 400;
    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img").attr("aria-label", `Treemap of known recorded hospitalisations by road-user group${filters.state ? ` in ${fullStateName(filters.state)}` : " across all jurisdictions"}`);
    const color = d3.scaleOrdinal().domain(totals.map((row) => row.user)).range(SERIES_COLORS);
    const root = d3.hierarchy({ children: totals }).sum((row) => row.value).sort((a, b) => b.value - a.value);
    d3.treemap().size([width, height]).paddingInner(4).paddingOuter(2).round(true)(root);
    const leaves = root.leaves();
    const tiles = svg.selectAll("g.road-user-tile").data(leaves).join("g").attr("class", "road-user-tile")
        .attr("transform", (node) => `translate(${node.x0},${node.y0})`)
        .on("click", (_, node) => { selectedRoadUser = node.data.user; renderTreemap(); renderBars(); });
    tiles.append("rect").attr("width", (node) => node.x1 - node.x0).attr("height", (node) => node.y1 - node.y0)
        .attr("rx", 6).attr("fill", (node) => color(node.data.user)).attr("stroke", "var(--surface)").attr("stroke-width", 2)
        .attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", (node) => `${node.data.user}: ${numberFormat.format(node.data.value)} known hospitalisations; select to show annual bars`)
        .on("keydown", (event, node) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); selectedRoadUser = node.data.user; renderTreemap(); renderBars(); } });
    attachTooltip(tiles.select("rect"), (node) => `${node.data.user}: ${numberFormat.format(node.data.value)} known recorded hospitalisations` +
        (node.data.suppressed ? `; ${node.data.suppressed} suppressed records excluded` : ""));
    const defs = svg.append("defs");
    const labelLayer = svg.append("g").attr("class", "treemap-label-layer").attr("pointer-events", "none");
    leaves.forEach((node, index) => {
        const w = node.x1 - node.x0, h = node.y1 - node.y0;
        const clipId = `road-user-tile-clip-${index}`;
        defs.append("clipPath").attr("id", clipId).append("rect")
            .attr("x", node.x0 + 6).attr("y", node.y0 + 3)
            .attr("width", Math.max(0, w - 12)).attr("height", Math.max(0, h - 6));
        const fontSize = Math.max(7, Math.min(14, w / 14, h / 3.4));
        if (w < 58 || h < 28) return;
        const charsPerLine = Math.max(3, Math.floor((w - 18) / (fontSize * 0.58)));
        const maxLines = Math.max(1, Math.floor((h - 8) / (fontSize * 1.15)));
        const lines = [];
        let current = "";
        node.data.user.split(/\s+/).forEach((word) => {
            if (word.length > charsPerLine) {
                if (current) { lines.push(current); current = ""; }
                lines.push(word.slice(0, charsPerLine));
            } else if (!current) current = word;
            else if (`${current} ${word}`.length <= charsPerLine) current += ` ${word}`;
            else { lines.push(current); current = word; }
        });
        if (current) lines.push(current);
        const visibleLines = lines.slice(0, maxLines);
        const label = labelLayer.append("text").attr("class", "treemap-tile-label")
            .attr("x", node.x0 + 9).attr("y", node.y0 + fontSize + 4)
            .attr("clip-path", `url(#${clipId})`).attr("font-size", fontSize);
        visibleLines.forEach((line, lineIndex) => label.append("tspan")
            .attr("x", node.x0 + 9).attr("dy", lineIndex ? "1.15em" : null).text(line));
        if (h > fontSize * (visibleLines.length + 2) && w > 64) label.append("tspan")
            .attr("x", node.x0 + 9).attr("dy", "1.25em").attr("class", "treemap-tile-value")
            .text(numberFormat.format(node.data.value));
    });
    tiles.filter((node) => node.data.user === selectedRoadUser).select("rect").attr("stroke", "#111").attr("stroke-width", 4);
    revealChart(svg);
}

function renderBars() {
    const container = document.getElementById("jurisdiction-user-bars-chart");
    const empty = document.getElementById("jurisdiction-user-bars-empty");
    if (!container || !empty) return;
    clearChart(container);
    const note = document.getElementById("jurisdiction-user-bars-note");
    const stateRows = data.state.filter((row) => (!filters.state || row.state.toUpperCase() === filters.state.toUpperCase()) && row.user === selectedRoadUser);
    const yearly = d3.rollups(stateRows, (rows) => rows.some((row) => row.suppressed || row.value === null)
        ? null : d3.sum(rows, (row) => row.value), (row) => row.year)
        .map(([year, value]) => ({ year, value })).sort((a, b) => b.year - a.year).filter((row) => row.value !== null);
    const place = filters.state ? fullStateName(filters.state) : "all jurisdictions";
    if (note) note.textContent = `${selectedRoadUser} annual recorded counts for ${place}. 2021 appears first. A star marks a top-five yearly count. Select a treemap tile to change group; selecting a map region resets to pedal cyclist.`;
    setEmptyState(empty, `No complete annual counts are available for ${selectedRoadUser} in this selection.`, !yearly.length);
    if (!yearly.length) return;
    const width = chartWidth(container), height = 360;
    const margin = { top: 18, right: 74, bottom: 30, left: 62 };
    const max = d3.max(yearly, (row) => row.value) || 1;
    const x = d3.scaleLinear().domain([0, max * 1.08]).nice().range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(yearly.map((row) => row.year)).range([margin.top, height - margin.bottom]).padding(0.2);
    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img").attr("aria-label", `Horizontal bars of ${selectedRoadUser} hospitalisations by year for ${place}`);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat((value) => numberFormat.format(value)));
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(5).tickSize(-(height - margin.top - margin.bottom)).tickFormat("")).lower();
    svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y));
    const topYears = new Set([...yearly].sort((a, b) => b.value - a.value).slice(0, 5).map((row) => row.year));
    const bars = svg.selectAll(".jurisdiction-year-bar").data(yearly).join("rect")
        .attr("class", "bar jurisdiction-year-bar").attr("x", x(0)).attr("y", (row) => y(row.year))
        .attr("height", y.bandwidth()).attr("width", 0).attr("rx", 3)
        .attr("fill", (row) => topYears.has(row.year) ? "var(--series-vermilion)" : "var(--chart-primary)")
        .attr("tabindex", 0).attr("role", "img").attr("opacity", 1)
        .attr("aria-label", (row) => `${row.year}: ${numberFormat.format(row.value)} ${selectedRoadUser} hospitalisations`);
    attachTooltip(bars, (row) => `${row.year}: ${numberFormat.format(row.value)} recorded ${selectedRoadUser} hospitalisations`);
    const valueLabels = svg.selectAll(".jurisdiction-year-value").data(yearly).join("text")
        .attr("class", (row) => `bar-value jurisdiction-year-value${topYears.has(row.year) ? " is-top-five" : ""}`)
        .attr("data-mark", (row) => row.year)
        .attr("x", (row) => x(row.value) + 7).attr("y", (row) => y(row.year) + y.bandwidth() / 2 + 4)
        .text((row) => `${numberFormat.format(row.value)}${topYears.has(row.year) ? " \u2605" : ""}`);
    bars.on("pointerenter.bar-focus focus.bar-focus", (_, row) => {
        valueLabels.interrupt("bar-focus").transition("bar-focus").duration(duration(140))
            .style("opacity", (datum) => datum.year === row.year ? 1 : 0);
    }).on("pointerleave.bar-focus blur.bar-focus", () => {
        valueLabels.interrupt("bar-focus").transition("bar-focus").duration(duration(160)).style("opacity", 1);
    });
    bars.transition("horizontal-bar-enter").duration(duration(700)).ease(d3.easeCubicOut).attr("width", (row) => x(row.value) - x(0));
    revealChart(svg);
}

export function renderRoadUserComposition() {
    const layout = document.getElementById("jurisdiction-visual-pair");
    if (layout) layout.classList.toggle("has-jurisdiction", hasChosenJurisdiction);
    renderJurisdictionMap();
    renderTreemap();
    renderBars();
}
