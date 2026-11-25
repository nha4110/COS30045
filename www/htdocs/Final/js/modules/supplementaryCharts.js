import { d3, data, filters, setEmptyState, chartWidth, attachTooltip, revealChart, clearChart, numberFormat, SERIES_COLORS, reducedMotion, fullStateName } from "./state.js";

const WORLD_BOUNDARIES_URL = "maps/world_countries.geojson";
const AUSTRALIA_JURISDICTIONS_URL = "maps/australia_jurisdictions.geojson";
const CODE_BY_NAME = new Map([["New South Wales", "NSW"], ["Victoria", "Vic"], ["Queensland", "Qld"], ["South Australia", "SA"], ["Western Australia", "WA"], ["Tasmania", "Tas"], ["Northern Territory", "NT"], ["Australian Capital Territory", "ACT"]]);
const JURISDICTION_MAP = [
    { code: "WA", points: [[112,-14],[129,-14],[129,-31],[126,-33],[120,-35],[115,-34],[113,-27],[114,-22]] },
    { code: "NT", points: [[129,-14],[138,-14],[138,-26],[129,-26]] },
    { code: "SA", points: [[129,-26],[138,-26],[141,-26],[141,-34],[138,-35],[135,-35],[129,-32]] },
    { code: "Qld", points: [[138,-10],[143,-10],[153,-25],[150,-29],[141,-29],[138,-26]] },
    { code: "NSW", points: [[141,-29],[150,-29],[153,-29],[153,-34],[150,-37],[146,-36],[141,-34]] },
    { code: "Vic", points: [[141,-34],[146,-36],[150,-37],[149,-39],[146,-39],[143,-38]] },
    { code: "Tas", points: [[144,-40],[148,-40],[148,-43],[145,-44],[143,-42]] },
    { code: "ACT", points: [[148.76,-35.12],[149.40,-35.12],[149.40,-35.92],[148.76,-35.92]] }
];
const duration = (ms) => reducedMotion.matches ? 0 : ms;
let selectedRoadUser = "Pedal cyclist";
let mapRenderSequence = 0;

function jurisdictionTotals() {
    return d3.rollups(data.state, (rows) => {
        const known = rows.filter((row) => !row.suppressed && row.value !== null);
        return known.length ? d3.sum(known, (row) => row.value) : null;
    }, (row) => row.state)
        .map(([state, total]) => ({ state, total }));
}

function renderJurisdictionMap() {
    const container = document.getElementById("jurisdiction-map-chart");
    if (!container) return;
    clearChart(container);
    const totals = jurisdictionTotals();
    const topFive = new Set([...totals].filter(row => row.total !== null).sort((a, b) => b.total - a.total).slice(0, 5).map((row) => stateCode(row.state)));
    const totalByCode = new Map(totals.map((row) => [stateCode(row.state), row.total]));
    const knownRows = data.state.filter(row => !row.suppressed && row.value !== null);
    totalByCode.set("AUS", knownRows.length ? d3.sum(knownRows, row => row.value) : null);
    const suppressedByCode = new Map(d3.rollups(data.state.filter((row) => row.suppressed || row.value === null), rows => rows.length, row => stateCode(row.state)));
    suppressedByCode.set("AUS", data.state.filter(row => row.suppressed || row.value === null).length);
    const renderId = ++mapRenderSequence;
    const drawMap = (boundaryData) => {
        if (renderId !== mapRenderSequence || !container.isConnected) return;
        const width = chartWidth(container), height = 210;
        const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "group").attr("aria-label", "Zoomed map of Australian states and territories. Click a region to filter the charts.");
        const features = boundaryData.features.map(feature => ({ ...feature, properties: { ...feature.properties,
            code: CODE_BY_NAME.get(feature.properties.STATE_NAME) } })).filter(feature => feature.properties.code)
            .map(feature => ({ ...feature, geometry: { ...feature.geometry, coordinates: feature.geometry.type === "MultiPolygon"
                ? feature.geometry.coordinates.filter(polygon => {
                    const ring = polygon[0];
                    const xs = ring.map(point => point[0]), ys = ring.map(point => point[1]);
                    return Math.max(...xs) - Math.min(...xs) > 1 && Math.max(...ys) - Math.min(...ys) > 1;
                }) : feature.geometry.coordinates } }));
        const projection = d3.geoMercator().center([134, -27]).scale(2.66 * Math.min(width, height)).translate([width * .49, height * .47]);
        const path = d3.geoPath(projection);
        const regions = svg.selectAll("path.australia-jurisdiction").data(features).join("path")
            .attr("class", feature => `australia-jurisdiction${totalByCode.get(feature.properties.code) != null ? " has-jurisdiction-data" : ""}`)
            .attr("data-jurisdiction", feature => feature.properties.code).attr("d", path)
            .attr("fill", feature => feature.properties.code === (filters.state && stateCode(filters.state)) ? "#123f62" : topFive.has(feature.properties.code) ? "#c94b40" : "#cbd3d9")
            .attr("stroke", "var(--surface)").attr("stroke-width", 1.2).attr("vector-effect", "non-scaling-stroke")
            .attr("tabindex", feature => totalByCode.has(feature.properties.code) && totalByCode.get(feature.properties.code) !== null ? 0 : -1)
            .attr("role", feature => totalByCode.has(feature.properties.code) && totalByCode.get(feature.properties.code) !== null ? "button" : null)
            .attr("aria-disabled", feature => String(totalByCode.get(feature.properties.code) == null))
            .attr("aria-label", feature => mapValueLabel(feature.properties.code, totalByCode, suppressedByCode))
          .on("click", (_, feature) => {
              const code = feature.properties.code;
              if (totalByCode.has(code) && totalByCode.get(code) !== null) selectJurisdiction(code);
          }).on("keydown", (event, feature) => {
              const code = feature.properties.code;
              if (totalByCode.has(code) && totalByCode.get(code) !== null && ["Enter", " "].includes(event.key)) {
                  event.preventDefault(); selectJurisdiction(code);
              }
          });
        attachTooltip(regions, feature => mapValueLabel(feature.properties.code, totalByCode, suppressedByCode) +
            (topFive.has(feature.properties.code) ? "; among top five known totals" : ""));
        const labelPoints = { WA:[121,-25], NT:[133,-20], SA:[135,-31], Qld:[146,-21], NSW:[147,-33], Vic:[145,-37], Tas:[146,-42], ACT:[149,-35.5] };
        svg.selectAll("text.jurisdiction-map-label").data(features).join("text").attr("class", "jurisdiction-map-label")
            .attr("x", feature => projection(labelPoints[feature.properties.code])[0]).attr("y", feature => projection(labelPoints[feature.properties.code])[1])
            .attr("pointer-events", "none").attr("text-anchor", "middle").attr("dominant-baseline", "middle").text(feature => feature.properties.code);
        revealChart(svg);
    };
    d3.json(AUSTRALIA_JURISDICTIONS_URL).then(drawMap).catch(() => {
        if (renderId !== mapRenderSequence) return;
        container.innerHTML = '<p class="empty-state">Local Australia jurisdiction boundaries could not be loaded from maps/australia_jurisdictions.geojson.</p>';
    });
}

function countryJurisdictionCode(feature) {
    const name = feature.properties?.name || feature.properties?.ADMIN || feature.properties?.NAME || "";
    return name.toLowerCase() === "australia" ? "AUS" : "";
}

function stateCode(value) {
    const normalized = String(value).trim().toLowerCase();
    const codes = { act:"ACT", nsw:"NSW", nt:"NT", qld:"Qld", queensland:"Qld", sa:"SA", tas:"Tas", tasmania:"Tas", vic:"Vic", victoria:"Vic", wa:"WA", "western australia":"WA", "south australia":"SA", "northern territory":"NT", "new south wales":"NSW", "australian capital territory":"ACT" };
    return codes[normalized] || value;
}

function mapValueLabel(code, totals, suppressed) {
    const name = fullStateName(code);
    const known = totals.get(code);
    const unknown = suppressed.get(code) || 0;
    return `${name}: ${known == null ? "n.p. / unknown (suppressed)" : `${numberFormat.format(known)} known recorded hospitalisations`}${unknown ? `; ${unknown} suppressed or unavailable records` : ""}`;
}

function selectJurisdiction(state) {
    filters.state = state === "AUS" ? "" : state;
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
    svg.style("opacity", 1);
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
    renderJurisdictionMap();
    renderTreemap();
    renderBars();
}
