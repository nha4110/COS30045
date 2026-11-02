(function () {
    "use strict";

    const namespace = "http://www.w3.org/2000/svg";
    const pewRates = {
        "840": { name: "United States", value: 639, detail: "As of 2018; all ages." },
        "222": { name: "El Salvador", value: 564, detail: "Latest available data cited by Pew in 2021." },
        "192": { name: "Cuba", value: 510, detail: "Latest available data cited by Pew in 2021." },
        "795": { name: "Turkmenistan", value: 552, detail: "Latest available data cited by Pew in 2021." },
        "646": { name: "Rwanda", value: 545, detail: "Latest available data cited by Pew in 2021." },
        "076": { name: "Brazil", value: 357, detail: "Latest available data cited by Pew in 2021." },
        "792": { name: "Turkey", value: 335, detail: "Latest available data cited by Pew in 2021." },
        "250": { name: "France", value: 93, detail: "Latest available data cited by Pew in 2021." },
        "276": { name: "Germany", value: 69, detail: "Latest available data cited by Pew in 2021." }
    };
    const regions = {
        world: { label: "World", bounds: [-180, -90, 180, 90] },
        northAmerica: { label: "North America", bounds: [-170, 5, -50, 82] },
        southAmerica: { label: "South America", bounds: [-85, -60, -30, 15] },
        europe: { label: "Europe", bounds: [-25, 33, 45, 72] },
        africa: { label: "Africa", bounds: [-22, -38, 55, 38] },
        asia: { label: "Asia", bounds: [35, -15, 180, 82] },
        oceania: { label: "Oceania", bounds: [105, -50, 180, 5] }
    };
    const mapWidth = 960;
    const mapHeight = 450;
    let mapSvg;
    let countryRows = [];

    function svgElement(tag, attributes, text) {
        const element = document.createElementNS(namespace, tag);
        Object.entries(attributes || {}).forEach(([key, value]) => element.setAttribute(key, value));
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function addTooltip(target, container, title, metric, context) {
        let tooltip = container.querySelector(".chart-tooltip");
        if (!tooltip) {
            tooltip = document.createElement("div");
            tooltip.className = "chart-tooltip";
            tooltip.setAttribute("role", "tooltip");
            tooltip.id = `${container.id}-tooltip`;
            tooltip.hidden = true;
            container.appendChild(tooltip);
            window.addEventListener("resize", () => {
                if (!tooltip.hidden && tooltip.reposition) tooltip.reposition();
            });
        }
        target.setAttribute("aria-describedby", tooltip.id);
        let pointerActive = false;
        let focusActive = false;

        const show = () => {
            tooltip.reposition = show;
            const titleNode = document.createElement("strong");
            titleNode.textContent = title;
            const metricNode = document.createElement("span");
            metricNode.className = "tooltip-metric";
            metricNode.textContent = metric;
            const noteNode = document.createElement("span");
            noteNode.textContent = context;
            tooltip.replaceChildren(titleNode, metricNode, noteNode);

            const box = container.getBoundingClientRect();
            const mark = target.getBoundingClientRect();
            tooltip.hidden = false;
            const x = mark.left + mark.width / 2 - box.left;
            const y = mark.top - box.top;
            const left = Math.max(6, Math.min(x - tooltip.offsetWidth / 2, box.width - tooltip.offsetWidth - 6));
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${y < 110 ? y + mark.height + 8 : y - tooltip.offsetHeight - 8}px`;
        };
        const hideIfInactive = () => {
            if (!pointerActive && !focusActive) tooltip.hidden = true;
        };
        target.addEventListener("pointerenter", () => { pointerActive = true; show(); });
        target.addEventListener("pointerleave", () => { pointerActive = false; hideIfInactive(); });
        target.addEventListener("focus", () => { focusActive = true; show(); });
        target.addEventListener("blur", () => { focusActive = false; hideIfInactive(); });
    }

    function rateBin(value) {
        if (value >= 600) return 6;
        return Math.floor(value / 100);
    }

    function decodeArcs(topology) {
        const [scaleX, scaleY] = topology.transform.scale;
        const [translateX, translateY] = topology.transform.translate;
        return topology.arcs.map(arc => {
            let x = 0;
            let y = 0;
            return arc.map(([dx, dy]) => {
                x += dx;
                y += dy;
                return [x * scaleX + translateX, y * scaleY + translateY];
            });
        });
    }

    function ringPath(ring, arcs, project) {
        const points = [];
        ring.forEach((arcId, index) => {
            const arc = arcs[arcId < 0 ? ~arcId : arcId];
            const sequence = arcId < 0 ? [...arc].reverse() : arc;
            points.push(...(index ? sequence.slice(1) : sequence));
        });
        if (!points.length) return "";
        return `M${points.map(point => {
            const [x, y] = project(point);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join("L")}Z`;
    }

    function geometryPath(geometry, arcs, project) {
        const polygons = geometry.type === "Polygon" ? [geometry.arcs] : geometry.arcs;
        return polygons.map(polygon => polygon.map(ring => ringPath(ring, arcs, project)).join("")).join("");
    }

    function makeMapTooltip(path, map, item) {
        addTooltip(path, map, item.name, `${item.value} per 100,000`, item.detail);
    }

    function addMapLabel(svg, project, item) {
        const [x, y] = project(item.point);
        const labelX = x + item.dx;
        const labelY = y + item.dy;
        const group = svgElement("g", { "aria-hidden": "true", class: "map-top-label" });
        group.appendChild(svgElement("circle", { cx: x, cy: y, r: 3.3, class: "map-label-dot" }));
        group.appendChild(svgElement("line", { x1: x, y1: y, x2: labelX, y2: labelY - 5, class: "map-label-line" }));
        const anchor = item.dx < 0 ? "end" : "start";
        group.appendChild(svgElement("text", { x: labelX, y: labelY - 7, "text-anchor": anchor, class: "map-label" }, item.name));
        group.appendChild(svgElement("text", { x: labelX, y: labelY + 8, "text-anchor": anchor, class: "map-label map-label-value" }, `${item.value}`));
        svg.appendChild(group);
    }

    function approximateRate(id) {
        const overrides = {
            Canada: 104, Russia: 355, Kazakhstan: 186, China: 118, Iran: 255,
            Thailand: 315, Myanmar: 245, Vietnam: 155, Philippines: 140,
            "South Africa": 180, Mexico: 165, Argentina: 230, Chile: 230,
            Colombia: 235, Peru: 195, Venezuela: 165, India: 120,
            Australia: 150, Japan: 45, "United Kingdom": 140, Spain: 126,
            Italy: 90, Poland: 195, Sweden: 70, Norway: 65
        };
        const name = id.name;
        if (overrides[name] !== undefined) return overrides[name];
        const seed = Number(id.id) || 0;
        const bucket = (seed * 37 + 17) % 100;
        if (bucket < 45) return 30 + (seed * 13) % 70;
        if (bucket < 75) return 100 + (seed * 17) % 100;
        if (bucket < 90) return 200 + (seed * 19) % 100;
        if (bucket < 97) return 300 + (seed * 23) % 100;
        return 400 + (seed * 29) % 100;
    }

    function centerOfGeometry(geometry, arcs) {
        const points = [];
        const collect = value => {
            if (Array.isArray(value)) {
                value.forEach(collect);
            } else if (typeof value === "number") {
                const arc = arcs[value < 0 ? ~value : value];
                if (arc) points.push(...(value < 0 ? [...arc].reverse() : arc));
            }
        };
        collect(geometry.arcs);
        if (!points.length) return [0, 0];
        const total = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
        return [total[0] / points.length, total[1] / points.length];
    }

    function regionFor([longitude, latitude], name) {
        if (name === "Russia") return "asia";
        if (["Australia", "New Zealand", "Fiji", "Papua New Guinea"].includes(name)) return "oceania";
        if (longitude < -30) return latitude > 12 ? "northAmerica" : "southAmerica";
        if (longitude >= -25 && longitude <= 45 && latitude > 34) return "europe";
        if (longitude >= 105 && latitude < 5) return "oceania";
        if (longitude >= 45 && latitude > -15) return "asia";
        return "africa";
    }

    function createCountryTable(container, rows) {
        const table = document.createElement("table");
        table.className = "data-table";
        const caption = document.createElement("caption");
        caption.textContent = "Incarceration rates per 100,000 people, all ages";
        table.appendChild(caption);
        const thead = document.createElement("thead");
        const header = document.createElement("tr");
        ["Country", "Rate", "Data note"].forEach(label => {
            const cell = document.createElement("th");
            cell.scope = "col";
            cell.textContent = label;
            header.appendChild(cell);
        });
        thead.appendChild(header);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        rows.forEach(item => {
            const row = document.createElement("tr");
            [item.name, item.value === null ? "—" : item.value.toLocaleString(), item.source].forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            });
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        container.replaceChildren(table);
    }

    function renderRegionRates(region) {
        const container = document.getElementById("region-rates");
        if (region === "world") {
            container.replaceChildren();
            container.hidden = true;
            return;
        }
        const regionRows = countryRows
            .filter(item => item.region === region)
            .sort((a, b) => a.name.localeCompare(b.name));
        const title = document.createElement("h4");
        title.textContent = `${regions[region].label}: country rates`;
        const note = document.createElement("p");
        note.className = "table-intro";
        note.textContent = `${regionRows.length} countries shown. Pew figures are marked; other values are illustrative mock data.`;
        const tableWrap = document.createElement("div");
        tableWrap.className = "data-table-wrap region-table-wrap";
        createCountryTable(tableWrap, regionRows.map(item => ({
            ...item,
            source: item.isPew ? "Pew article figure" : item.value === null ? "No national rate" : "Illustrative mock"
        })));
        container.replaceChildren(title, note, tableWrap);
        container.hidden = false;
    }

    function projectPoint([longitude, latitude]) {
        return [(longitude + 180) / 360 * mapWidth, (90 - latitude) / 180 * mapHeight];
    }

    function setMapRegion(region) {
        if (!regions[region] || !mapSvg) return;
        const [minLongitude, minLatitude, maxLongitude, maxLatitude] = regions[region].bounds;
        const [left, top] = projectPoint([minLongitude, maxLatitude]);
        const [right, bottom] = projectPoint([maxLongitude, minLatitude]);
        const padding = region === "world" ? 0 : 12;
        mapSvg.setAttribute("viewBox", `${left - padding} ${top - padding} ${right - left + padding * 2} ${bottom - top + padding * 2}`);
        mapSvg.classList.toggle("regional-zoom", region !== "world");
        document.querySelectorAll(".region-button").forEach(button => {
            const active = button.dataset.region === region;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        renderRegionRates(region);
    }

    async function drawWorldMap() {
        const container = document.getElementById("world-map");
        const response = await fetch("data/countries-110m.json");
        if (!response.ok) throw new Error(`Could not load map geometry (${response.status}).`);
        const topology = await response.json();
        const arcs = decodeArcs(topology);
        const project = projectPoint;
        const svg = svgElement("svg", { viewBox: `0 0 ${mapWidth} ${mapHeight}`, role: "group", "aria-label": container.getAttribute("aria-label") });
        const countries = topology.objects.countries.geometries;
        countryRows = countries.map(geometry => {
            const id = String(geometry.id).padStart(3, "0");
            const name = geometry.properties.name;
            const center = centerOfGeometry(geometry, arcs);
            const pew = pewRates[id];
            const isNotApplicable = name === "Antarctica";
            const value = pew ? pew.value : isNotApplicable ? null : approximateRate({ id, name });
            return {
                id,
                name,
                value,
                center,
                region: isNotApplicable ? "world" : regionFor(center, name),
                isPew: Boolean(pew),
                detail: pew ? pew.detail : isNotApplicable
                    ? "No national incarceration rate is represented for Antarctica."
                    : "Illustrative mock value based on the reference map; not an official country statistic."
            };
        });
        const rowsById = new Map(countryRows.map(item => [item.id, item]));
        container.replaceChildren(svg);
        mapSvg = svg;

        countries.forEach(geometry => {
            const item = rowsById.get(String(geometry.id).padStart(3, "0"));
            const hasRate = item && item.value !== null;
            const path = svgElement("path", {
                d: geometryPath(geometry, arcs, project),
                class: hasRate ? `country ${item.isPew ? "selected" : "illustrative"} bin-${rateBin(item.value)}` : "country"
            });
            if (hasRate) {
                path.setAttribute("data-region", item.region);
                path.setAttribute("tabindex", item.isPew ? "0" : "-1");
                path.setAttribute("role", item.isPew ? "button" : "img");
                path.setAttribute("aria-label", `${item.name}: ${item.value} people per 100,000${item.isPew ? ", Pew article figure" : ", illustrative mock value"}. Activate to zoom to ${regions[item.region].label}.`);
                makeMapTooltip(path, container, item);
                path.addEventListener("click", () => setMapRegion(item.region));
                path.addEventListener("keydown", event => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setMapRegion(item.region);
                    }
                });
            } else if (item) {
                path.setAttribute("role", "img");
                path.setAttribute("aria-label", `${item.name}: no national rate represented.`);
            }
            svg.appendChild(path);
        });

        [
            { name: "United States", value: 639, point: [-98, 39], dx: -10, dy: -23 },
            { name: "Cuba", value: 510, point: [-79, 22], dx: 36, dy: 20 },
            { name: "El Salvador", value: 564, point: [-89, 13], dx: -36, dy: 35 },
            { name: "Turkmenistan", value: 552, point: [59, 39], dx: 34, dy: -15 },
            { name: "Rwanda", value: 545, point: [30, -2], dx: 32, dy: 20 }
        ].forEach(item => addMapLabel(svg, project, item));
        document.getElementById("country-data-table").replaceChildren();
        createCountryTable(
            document.getElementById("country-data-table"),
            [...countryRows].sort((a, b) => a.name.localeCompare(b.name)).map(item => ({
                ...item,
                source: item.isPew ? "Pew article figure" : item.value === null ? "No national rate" : "Illustrative mock · not official"
            }))
        );
        setMapRegion("world");
    }

    function drawBars() {
        const container = document.getElementById("country-bars");
        const entries = Object.values(pewRates).sort((a, b) => b.value - a.value);
        const width = 900;
        const rowHeight = 38;
        const top = 12;
        const left = 175;
        const right = 54;
        const max = 700;
        const plotWidth = width - left - right;
        const height = top + entries.length * rowHeight + 32;
        const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": container.getAttribute("aria-label") });
        const ticks = [0, 175, 350, 525, 700];
        container.replaceChildren(svg);

        ticks.forEach(value => {
            const x = left + value / max * plotWidth;
            svg.appendChild(svgElement("line", { x1: x, y1: 2, x2: x, y2: height - 23, class: "bar-grid" }));
            svg.appendChild(svgElement("text", { x, y: height - 5, "text-anchor": "middle", class: "axis-label" }, String(value)));
        });

        entries.forEach((item, index) => {
            const y = top + index * rowHeight;
            const length = item.value / max * plotWidth;
            svg.appendChild(svgElement("text", { x: left - 12, y: y + 22, "text-anchor": "end", class: "bar-label" }, item.name));
            const bar = svgElement("rect", {
                x: left, y: y + 4, width: length, height: 25, rx: 3,
                class: item.name === "United States" ? "rate-bar highlight" : "rate-bar",
                tabindex: "0", role: "img", "aria-label": `${item.name}: ${item.value} per 100,000`
            });
            addTooltip(bar, container, item.name, `${item.value} per 100,000`, item.detail);
            svg.appendChild(bar);
            svg.appendChild(svgElement("text", {
                x: Math.min(left + length + 8, width - 42), y: y + 22, class: "bar-value"
            }, String(item.value)));
        });
    }

    function drawUSMilestones() {
        const container = document.getElementById("us-milestones");
        const width = 900;
        const height = 270;
        const left = 72;
        const right = 36;
        const top = 22;
        const bottom = 52;
        const plotHeight = height - top - bottom;
        const plotWidth = width - left - right;
        const max = 1100;
        const data = [
            { year: "1995", value: 810, note: "The 2019 rate returned to this level.", detail: "810 inmates per 100,000 adults." },
            { year: "2006–08", value: 1000, note: "Peak period", detail: "About 1,000 inmates per 100,000 adults during this three-year period." },
            { year: "2019", value: 810, note: "Lowest since 1995", detail: "810 inmates per 100,000 adults at year-end." }
        ];
        const yFor = value => top + (max - value) / max * plotHeight;
        const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": container.getAttribute("aria-label") });
        container.replaceChildren(svg);

        [0, 500, 1000].forEach(value => {
            const y = yFor(value);
            svg.appendChild(svgElement("line", { x1: left, y1: y, x2: width - right, y2: y, class: "bar-grid" }));
            svg.appendChild(svgElement("text", { x: left - 12, y: y + 4, "text-anchor": "end", class: "axis-label" }, String(value)));
        });

        const groupWidth = plotWidth / data.length;
        data.forEach((item, index) => {
            const barWidth = 96;
            const x = left + groupWidth * index + (groupWidth - barWidth) / 2;
            const y = yFor(item.value);
            const bar = svgElement("rect", {
                x, y, width: barWidth, height: height - bottom - y, rx: 4,
                class: index === 1 ? "milestone-bar peak" : "milestone-bar",
                tabindex: "0", role: "img", "aria-label": `${item.year}: ${item.value.toLocaleString()} per 100,000 adults`
            });
            addTooltip(bar, container, item.year, `${item.value.toLocaleString()} per 100,000 adults`, item.detail);
            svg.appendChild(bar);
            svg.appendChild(svgElement("text", { x: x + barWidth / 2, y: y - 10, "text-anchor": "middle", class: "milestone-text" }, item.value.toLocaleString()));
            svg.appendChild(svgElement("text", { x: x + barWidth / 2, y: height - 25, "text-anchor": "middle", class: "milestone-text" }, item.year));
            svg.appendChild(svgElement("text", { x: x + barWidth / 2, y: height - 8, "text-anchor": "middle", class: "milestone-subtext" }, item.note));
        });
    }

    function setupTabs() {
        const tabs = [...document.querySelectorAll(".chart-tab")];
        const activateTab = (tab, moveFocus) => {
            tabs.forEach(candidate => {
                const active = candidate === tab;
                candidate.setAttribute("aria-selected", String(active));
                candidate.tabIndex = active ? 0 : -1;
                document.getElementById(candidate.getAttribute("aria-controls")).hidden = !active;
            });
            if (moveFocus) tab.focus();
        };
        tabs.forEach((tab, index) => {
            tab.addEventListener("click", () => activateTab(tab, false));
            tab.addEventListener("keydown", event => {
                let nextIndex = index;
                if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
                else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
                else if (event.key === "Home") nextIndex = 0;
                else if (event.key === "End") nextIndex = tabs.length - 1;
                else return;
                event.preventDefault();
                activateTab(tabs[nextIndex], true);
            });
        });
        document.querySelectorAll(".region-button").forEach(button => {
            button.addEventListener("click", () => setMapRegion(button.dataset.region));
        });
    }

    setupTabs();
    Promise.all([drawWorldMap(), Promise.resolve(drawBars()), Promise.resolve(drawUSMilestones())])
        .catch(error => {
            const status = document.querySelector("#world-map .map-status");
            if (status) status.textContent = "The map could not be loaded. Please view this page through the local web server so its map data file is available.";
            console.error(error);
        });
}());
