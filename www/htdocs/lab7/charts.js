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
    let mapAnimationFrame = null;
    let countryRows = [];
    let activeRegionLabels = [];

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

    function ringCoordinates(ring, arcs) {
        const points = [];
        ring.forEach((arcId, index) => {
            const arc = arcs[arcId < 0 ? ~arcId : arcId];
            const sequence = arcId < 0 ? [...arc].reverse() : arc;
            points.push(...(index ? sequence.slice(1) : sequence));
        });
        if (points.length > 1) {
            const first = points[0];
            const last = points[points.length - 1];
            if (Math.abs(first[1] - last[1]) < 1e-6 &&
                (Math.abs(first[0] - last[0]) < 1e-6 || Math.abs(Math.abs(first[0] - last[0]) - 360) < 1e-6)) {
                points.pop();
            }
        }
        return points;
    }

    function unwrapRing(points) {
        const unwrapped = [];
        points.forEach((point, index) => {
            if (!index) {
                unwrapped.push(point);
                return;
            }
            const previousLongitude = unwrapped[index - 1][0];
            const longitude = point[0] + 360 * Math.round((previousLongitude - point[0]) / 360);
            unwrapped.push([longitude, point[1]]);
        });
        return unwrapped;
    }

    function clipRingToWorld(points) {
        let clipped = points;
        [-180, 180].forEach(boundary => {
            const keepGreater = boundary === -180;
            const output = [];
            for (let index = 0; index < clipped.length; index += 1) {
                const current = clipped[index];
                const previous = clipped[(index + clipped.length - 1) % clipped.length];
                const currentInside = keepGreater ? current[0] >= boundary : current[0] <= boundary;
                const previousInside = keepGreater ? previous[0] >= boundary : previous[0] <= boundary;
                if (currentInside !== previousInside) {
                    const fraction = (boundary - previous[0]) / (current[0] - previous[0]);
                    output.push([boundary, previous[1] + fraction * (current[1] - previous[1])]);
                }
                if (currentInside) output.push(current);
            }
            clipped = output;
        });
        return clipped;
    }

    function ringPath(ring, arcs, project, antarctica) {
        const points = ringCoordinates(ring, arcs);
        const crossesDateline = points.some((point, index) =>
            Math.abs(points[(index + 1) % points.length][0] - point[0]) > 180
        );
        const antarcticaCap = antarctica && crossesDateline;
        const continuous = antarcticaCap ? points : unwrapRing(points);
        const pathParts = [];
        const shifts = crossesDateline && !antarcticaCap ? [-360, 0, 360] : [0];
        shifts.forEach(shift => {
            const shifted = continuous.map(([longitude, latitude]) => [longitude + shift, latitude]);
            const clipped = antarcticaCap ? shifted : clipRingToWorld(shifted);
            if (clipped.length < 3) return;
            const copy = clipped.map(point => project(point));
            if (antarcticaCap) copy.push(project([180 + shift, -90]), project([-180 + shift, -90]));
            pathParts.push(`M${copy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`);
        });
        return pathParts.join("");
    }

    function geometryPath(geometry, arcs, project, isAntarctica) {
        const polygons = geometry.type === "Polygon" ? [geometry.arcs] : geometry.arcs;
        return polygons.map(polygon => polygon.map(ring => ringPath(ring, arcs, project, isAntarctica)).join("")).join("");
    }

    function makeMapTooltip(path, map, item) {
        addTooltip(path, map, item.name, `${item.value} per 100,000`, item.detail);
    }

    function addMapLabel(svg, project, item) {
        const [x, y] = project(item.point);
        const labelX = x + item.dx;
        const labelY = y + item.dy;
        const group = svgElement("g", { "aria-hidden": "true", class: `map-top-label ${item.labelClass || ""}`.trim() });
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

    const regionOverrides = {
        Russia: "asia", Turkey: "asia", Cyprus: "asia", Georgia: "asia", Armenia: "asia",
        Azerbaijan: "asia", Israel: "asia", Jordan: "asia", Iraq: "asia", Syria: "asia",
        Lebanon: "asia", Palestine: "asia", "Timor-Leste": "asia", "East Timor": "asia",
        Indonesia: "asia", Malaysia: "asia", Brunei: "asia", Malta: "europe",
        Panama: "northAmerica", "Costa Rica": "northAmerica", "Trinidad and Tobago": "northAmerica",
        Trinidad: "northAmerica", Samoa: "oceania", Tonga: "oceania", Kiribati: "oceania",
        Micronesia: "oceania", "Federated States of Micronesia": "oceania", Palau: "oceania",
        "Marshall Islands": "oceania", Nauru: "oceania", Tuvalu: "oceania",
        "New Caledonia": "oceania", "French Polynesia": "oceania", "Cook Islands": "oceania",
        Niue: "oceania", Fiji: "oceania", Australia: "oceania", "New Zealand": "oceania",
        "Papua New Guinea": "oceania", Vanuatu: "oceania", "Solomon Islands": "oceania"
    };

    function regionFor([longitude, latitude], name) {
        if (regionOverrides[name]) return regionOverrides[name];
        if (longitude < -30) return latitude > 12 ? "northAmerica" : "southAmerica";
        if (longitude <= 45 && latitude > 36) return "europe";
        if (longitude >= 105 && latitude < -5) return "oceania";
        if (longitude >= 45 && longitude < 60 && latitude < 13) return "africa";
        if (longitude >= 45 && latitude > -15) return "asia";
        return "africa";
    }

    function createCountryTable(container, rows, showSource = true) {
        const table = document.createElement("table");
        table.className = "data-table";
        const caption = document.createElement("caption");
        caption.textContent = "Incarceration rates per 100,000 people, all ages";
        table.appendChild(caption);
        const thead = document.createElement("thead");
        const header = document.createElement("tr");
        (showSource ? ["Country", "Rate", "Data note"] : ["Country", "Rate"]).forEach(label => {
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
            const cells = showSource
                ? [item.name, item.value === null ? "—" : item.value.toLocaleString(), item.source]
                : [item.name, item.value === null ? "—" : item.value.toLocaleString()];
            cells.forEach(value => {
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

    function renderCountryTable() {
        const query = document.getElementById("country-search").value.trim().toLocaleLowerCase();
        const region = document.getElementById("country-region-filter").value;
        const source = document.getElementById("country-source-filter").value;
        const rows = countryRows
            .filter(item => item.name.toLocaleLowerCase().includes(query))
            .filter(item => region === "all" || item.region === region)
            .filter(item => {
                if (source === "pew") return item.isPew;
                if (source === "mock") return !item.isPew && item.value !== null;
                if (source === "none") return item.value === null;
                return true;
            })
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(item => ({
                ...item,
                source: item.isPew ? "Pew article figure" : item.value === null ? "No national rate" : "Illustrative mock · not official"
            }));
        createCountryTable(document.getElementById("country-data-table"), rows, false);
        const noun = rows.length === 1 ? "country" : "countries";
        document.getElementById("country-result-count").textContent = `Showing ${rows.length} ${noun}.`;
    }

    function initializeCountryFilters() {
        ["country-search", "country-region-filter", "country-source-filter"].forEach(id => {
            const control = document.getElementById(id);
            control.addEventListener(id === "country-search" ? "input" : "change", renderCountryTable);
        });
    }

    function projectPoint([longitude, latitude]) {
        const radians = Math.PI / 180;
        const lambda = longitude * radians;
        const phi = latitude * radians;
        const phi2 = phi * phi;
        const phi4 = phi2 * phi2;
        const phi6 = phi4 * phi2;
        const phi8 = phi4 * phi4;
        const phi10 = phi8 * phi2;
        const phi12 = phi6 * phi6;
        const xFactor = 0.8707 + phi12 * (-0.013791 + phi2 * (0.003971 * phi2 - 0.001529 * phi4)) - 0.131979 * phi2;
        const yFactor = 1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4));
        const maxY = Math.PI / 2 * (1.007226 + Math.PI ** 2 / 4 * (
            0.015085 + (Math.PI ** 4 / 16) * (-0.044475 + 0.028874 * Math.PI ** 2 / 4 - 0.005916 * Math.PI ** 4 / 16)
        ));
        return [
            mapWidth / 2 + lambda * xFactor * mapWidth / (2 * Math.PI * 0.8707),
            mapHeight / 2 - phi * yFactor * mapHeight / (2 * maxY)
        ];
    }

    function setMapRegion(region) {
        if (!regions[region] || !mapSvg) return;
        let targetViewBox;
        if (region === "world") {
            targetViewBox = [0, 0, mapWidth, mapHeight];
        } else {
            const [minLongitude, minLatitude, maxLongitude, maxLatitude] = regions[region].bounds;
            const corners = [
                projectPoint([minLongitude, minLatitude]),
                projectPoint([minLongitude, maxLatitude]),
                projectPoint([maxLongitude, minLatitude]),
                projectPoint([maxLongitude, maxLatitude])
            ];
            const xs = corners.map(point => point[0]);
            const ys = corners.map(point => point[1]);
            const padding = 12;
            const left = Math.min(...xs) - padding;
            const top = Math.min(...ys) - padding;
            const width = Math.max(...xs) - Math.min(...xs) + padding * 2;
            const height = Math.max(...ys) - Math.min(...ys) + padding * 2;
            targetViewBox = [left, top, width, height];
        }
        animateMapView(targetViewBox);
        mapSvg.classList.toggle("regional-zoom", region !== "world");
        document.querySelectorAll(".region-button").forEach(button => {
            const active = button.dataset.region === region;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        renderRegionalTopLabels(region);
        renderRegionRates(region);
    }

    function renderRegionalTopLabels(region) {
        mapSvg.querySelectorAll(".region-top-label").forEach(label => label.remove());
        activeRegionLabels = [];
        if (region === "world") return;

        const topCountries = countryRows
            .filter(item => item.region === region && item.value !== null)
            .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
            .slice(0, 5);
        const measureContext = document.createElement("canvas").getContext("2d");
        if (!measureContext) throw new Error("Could not measure regional map labels.");
        measureContext.font = "700 12px Arial, Helvetica, sans-serif";

        topCountries.forEach(item => {
            const group = svgElement("g", { "aria-hidden": "true", class: "region-top-label" });
            const connector = svgElement("line", { class: "region-label-line" });
            const marker = svgElement("circle", { class: "region-label-dot" });
            const background = svgElement("rect", { class: "region-label-background" });
            const text = svgElement("text", { class: "region-label-text", "dominant-baseline": "middle" }, `${item.name} · ${item.value}`);
            group.append(connector, marker, background, text);
            mapSvg.appendChild(group);
            activeRegionLabels.push({
                group,
                connector,
                marker,
                background,
                text,
                point: projectPoint(item.center),
                width: measureContext.measureText(`${item.name} · ${item.value}`).width + 16,
                height: 26
            });
        });
        updateRegionalTopLabelPositions();
    }

    function updateRegionalTopLabelPositions() {
        if (!mapSvg || !activeRegionLabels.length) return;
        const transform = mapSvg.getScreenCTM();
        if (!transform) return;
        const inverse = transform.inverse();
        const screenPoint = mapSvg.createSVGPoint();
        const scale = Math.hypot(transform.a, transform.b);
        const bounds = mapSvg.getBoundingClientRect();
        const placed = [];
        const directions = [
            [1, 0], [-1, 0], [0, -1], [0, 1],
            [1, -1], [-1, -1], [1, 1], [-1, 1]
        ];
        const gaps = [9, 20, 32, 48, 70];

        const toMapPoint = (x, y) => {
            screenPoint.x = x;
            screenPoint.y = y;
            return screenPoint.matrixTransform(inverse);
        };
        const overlaps = (a, b) =>
            a.left < b.right + 4 && a.right + 4 > b.left &&
            a.top < b.bottom + 4 && a.bottom + 4 > b.top;

        activeRegionLabels.forEach(label => {
            screenPoint.x = label.point[0];
            screenPoint.y = label.point[1];
            const anchor = screenPoint.matrixTransform(transform);
            const options = gaps.flatMap(gap => directions.map(([dx, dy]) => {
                const x = anchor.x + dx * (label.width / 2 + gap);
                const y = anchor.y + dy * (label.height / 2 + gap);
                const box = {
                    left: x - label.width / 2,
                    right: x + label.width / 2,
                    top: y - label.height / 2,
                    bottom: y + label.height / 2
                };
                const outside = Math.max(0, bounds.left + 4 - box.left) +
                    Math.max(0, box.right - bounds.right + 4) +
                    Math.max(0, bounds.top + 4 - box.top) +
                    Math.max(0, box.bottom - bounds.bottom + 4);
                const collisions = placed.reduce((count, other) => count + Number(overlaps(box, other)), 0);
                return { x, y, box, score: outside * 10 + collisions * 10000 + gap * 2 + Math.abs(dx) + Math.abs(dy) };
            })).sort((a, b) => a.score - b.score);
            const placement = options[0];
            placed.push(placement.box);

            const point = toMapPoint(anchor.x, anchor.y);
            const topLeft = toMapPoint(placement.box.left, placement.box.top);
            const bottomRight = toMapPoint(placement.box.right, placement.box.bottom);
            const labelX = (topLeft.x + bottomRight.x) / 2;
            const labelY = (topLeft.y + bottomRight.y) / 2;
            const scaleSafe = Math.max(scale, .01);
            const left = topLeft.x;
            const right = bottomRight.x;
            const top = topLeft.y;
            const bottom = bottomRight.y;
            const nearestX = Math.max(left, Math.min(point.x, right));
            const nearestY = Math.max(top, Math.min(point.y, bottom));

            label.connector.setAttribute("x1", point.x);
            label.connector.setAttribute("y1", point.y);
            label.connector.setAttribute("x2", nearestX);
            label.connector.setAttribute("y2", nearestY);
            label.marker.setAttribute("cx", point.x);
            label.marker.setAttribute("cy", point.y);
            label.marker.setAttribute("r", 3 / scaleSafe);
            label.background.setAttribute("x", left);
            label.background.setAttribute("y", top);
            label.background.setAttribute("width", right - left);
            label.background.setAttribute("height", bottom - top);
            label.background.setAttribute("rx", 5 / scaleSafe);
            label.text.setAttribute("x", labelX);
            label.text.setAttribute("y", labelY);
            label.text.setAttribute("font-size", 12 / scaleSafe);
        });
    }

    function animateMapView(targetViewBox) {
        if (mapAnimationFrame !== null) cancelAnimationFrame(mapAnimationFrame);
        const current = mapSvg.viewBox.baseVal;
        const startViewBox = [current.x, current.y, current.width, current.height];
        const duration = 550;
        const startedAt = performance.now();
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            mapSvg.setAttribute("viewBox", targetViewBox.join(" "));
            mapAnimationFrame = null;
            updateRegionalTopLabelPositions();
            return;
        }
        const step = now => {
            const progress = Math.min((now - startedAt) / duration, 1);
            const eased = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            const viewBox = startViewBox.map((value, index) => value + (targetViewBox[index] - value) * eased);
            mapSvg.setAttribute("viewBox", viewBox.join(" "));
            updateRegionalTopLabelPositions();
            if (progress < 1) {
                mapAnimationFrame = requestAnimationFrame(step);
            } else {
                mapAnimationFrame = null;
            }
        };
        mapAnimationFrame = requestAnimationFrame(step);
    }

    async function drawWorldMap() {
        const container = document.getElementById("world-map");
        const response = await fetch("data/countries-110m.json");
        if (!response.ok) throw new Error(`Could not load map geometry (${response.status}).`);
        const topology = await response.json();
        const arcs = decodeArcs(topology);
        const project = projectPoint;
        const svg = svgElement("svg", { viewBox: `0 0 ${mapWidth} ${mapHeight}`, role: "group", "aria-label": container.getAttribute("aria-label") });
        const defs = svgElement("defs");
        const clipPath = svgElement("clipPath", { id: "world-map-clip" });
        clipPath.appendChild(svgElement("rect", { x: 0, y: 0, width: mapWidth, height: mapHeight }));
        defs.appendChild(clipPath);
        svg.appendChild(defs);
        const countryLayer = svgElement("g", { "clip-path": "url(#world-map-clip)" });
        svg.appendChild(countryLayer);
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
                d: geometryPath(geometry, arcs, project, item && item.name === "Antarctica"),
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
                path.setAttribute("aria-label", `${item.name}: no national rate represented. Activate to zoom out.`);
                path.addEventListener("click", () => setMapRegion("world"));
            }
            countryLayer.appendChild(path);
        });
        window.addEventListener("resize", updateRegionalTopLabelPositions);
        svg.addEventListener("click", event => {
            if (event.target === svg || event.target === countryLayer) setMapRegion("world");
        });

        [
            { name: "United States", value: 639, point: [-98, 39], dx: -10, dy: -23 },
            { name: "Cuba", value: 510, point: [-79, 22], dx: 36, dy: 20 },
            { name: "El Salvador", value: 564, point: [-89, 13], dx: -36, dy: 35 },
            { name: "Turkmenistan", value: 552, point: [59, 39], dx: 34, dy: -15 },
            { name: "Rwanda", value: 545, point: [30, -2], dx: 32, dy: 20 }
        ].forEach(item => addMapLabel(svg, project, { ...item, labelClass: "world-top-label" }));
        initializeCountryFilters();
        renderCountryTable();
        setMapRegion("world");
    }

    function initializeThemeToggle() {
        const themeToggle = document.getElementById("theme-toggle");
        const themeLabel = themeToggle.querySelector(".theme-toggle-label");
        const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
        const isDark = () => document.documentElement.dataset.theme
            ? document.documentElement.dataset.theme === "dark"
            : colorScheme.matches;
        const updateThemeLabel = () => {
            const nextMode = isDark() ? "light" : "dark";
            themeLabel.textContent = `${nextMode[0].toUpperCase()}${nextMode.slice(1)} mode`;
            themeToggle.setAttribute("aria-label", `Switch to ${nextMode} mode`);
            themeToggle.title = `Switch to ${nextMode} mode`;
        };
        themeToggle.addEventListener("click", () => {
            document.documentElement.dataset.theme = isDark() ? "light" : "dark";
            updateThemeLabel();
        });
        colorScheme.addEventListener("change", () => {
            if (!document.documentElement.dataset.theme) updateThemeLabel();
        });
        updateThemeLabel();
    }

    function drawTop5(region) {
        const container = document.getElementById("top5-chart");
        if (!container) return;
        const rows = countryRows
            .filter(item => item.value !== null && (region === "world" || item.region === region))
            .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
            .slice(0, 5);
        document.querySelectorAll(".top5-region-button").forEach(button => {
            const active = button.dataset.top5Region === region;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        if (!rows.length) {
            const empty = document.createElement("p");
            empty.className = "map-status";
            empty.textContent = "No country rates are available for this region.";
            container.replaceChildren(empty);
            return;
        }
        const scope = region === "world" ? "worldwide" : `in ${regions[region].label}`;
        const width = 900;
        const rowHeight = 44;
        const top = 18;
        const left = 210;
        const right = 84;
        const max = Math.max(100, Math.ceil(Math.max(...rows.map(item => item.value)) / 100) * 100);
        const plotWidth = width - left - right;
        const height = top + rows.length * rowHeight + 34;
        const svg = svgElement("svg", {
            viewBox: `0 0 ${width} ${height}`,
            role: "group",
            "aria-label": `Five highest incarceration rates ${scope}: ${rows.map((item, index) => `${index + 1}. ${item.name}, ${item.value} per 100,000`).join("; ")}.`
        });
        container.replaceChildren(svg);

        const step = max / 4;
        for (let value = 0; value <= max + 0.001; value += step) {
            const x = left + value / max * plotWidth;
            svg.appendChild(svgElement("line", { x1: x, y1: top - 6, x2: x, y2: height - 26, class: "bar-grid" }));
            svg.appendChild(svgElement("text", { x, y: height - 8, "text-anchor": "middle", class: "axis-label" }, String(Math.round(value))));
        }

        rows.forEach((item, index) => {
            const y = top + index * rowHeight;
            const length = item.value / max * plotWidth;
            svg.appendChild(svgElement("text", { x: 18, y: y + 27, class: "bar-rank" }, `${index + 1}`));
            const label = svgElement("text", { x: left - 12, y: y + 27, "text-anchor": "end", class: "bar-label" });
            label.appendChild(svgElement("tspan", {}, item.name));
            if (item.isPew) label.appendChild(svgElement("tspan", { class: "pew-star" }, " ★"));
            svg.appendChild(label);
            const bar = svgElement("rect", {
                x: left, y: y + 6, width: Math.max(length, 1), height: 26, rx: 3,
                class: item.isPew ? "rate-bar highlight" : "rate-bar",
                tabindex: "0", role: "img",
                "aria-label": `${item.name}: ${item.value} per 100,000${item.isPew ? ", Pew article figure" : ", illustrative mock value"}`
            });
            addTooltip(bar, container, item.name, `${item.value} per 100,000`, item.isPew
                ? `Pew article figure. ${item.detail}`
                : "Illustrative mock value for map coverage; not an official statistic.");
            svg.appendChild(bar);
            svg.appendChild(svgElement("text", {
                x: Math.min(left + length + 8, width - 46), y: y + 27, class: "bar-value"
            }, String(item.value)));
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
        document.querySelectorAll(".top5-region-button").forEach(button => {
            button.addEventListener("click", () => drawTop5(button.dataset.top5Region));
        });
    }

    initializeThemeToggle();
    setupTabs();
    drawWorldMap()
        .then(() => drawTop5("world"))
        .catch(error => {
            const status = document.querySelector("#world-map .map-status");
            if (status) status.textContent = "The map could not be loaded. Please view this page through the local web server so its map data file is available.";
            console.error(error);
        });
}());
