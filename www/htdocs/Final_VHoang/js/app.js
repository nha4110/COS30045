/* Interactive visual story for Australian road-hospitalisation records. */
(() => {
  "use strict";

  const YEARS = d3.range(2011, 2022);
  const AGE_GROUPS = ["0-7", "8-16", "17-25", "26-39", "40-64", "65-74", "75+"];
  const STATES = ["WA", "NT", "SA", "Qld", "NSW", "ACT", "Vic", "Tas"];
  const STATE_GRID = {
    WA: [0, 2], NT: [2, 0], SA: [2, 2], Qld: [3, 0],
    NSW: [4, 1], ACT: [4, 2], Vic: [3, 3], Tas: [4, 4]
  };
  const COLORS = [
    "#bd4d32", "#277568", "#477a9c", "#c28a24", "#7b639c", "#b85967",
    "#488c88", "#49627c", "#7b8b45", "#a76d49", "#647a8a", "#885d69"
  ];
  const dataFiles = {
    age: "data/national_road_user_age_sex_by_year.csv",
    national: "data/national_road_user_by_year.csv",
    state: "data/state_road_user_by_year.csv",
    firstNations: "data/first_nations_road_user_by_year.csv"
  };

  const yearSelect = document.querySelector("#year-select");
  const status = document.querySelector("#data-status");
  const tooltip = d3.select("body").append("div").attr("class", "tooltip").attr("role", "tooltip").attr("hidden", true);
  let datasets;
  let selectedYear = 2021;
  let resizeTimer;

  function numberOrNull(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatNumber(value) {
    return value === null || value === undefined || !Number.isFinite(value) ? "Not reported" : d3.format(",")(value);
  }

  function groupSum(rows, keyFn, valueFn) {
    return d3.rollups(rows, values => d3.sum(values, valueFn), keyFn);
  }

  function aggregateNational(rows) {
    return rows.map(row => ({
      year: Number(row.year),
      road_user: row.road_user,
      injuries: numberOrNull(row.injuries)
    })).filter(row => Number.isInteger(row.year) && row.road_user);
  }

  function aggregateState(rows) {
    return rows.map(row => ({
      year: Number(row.year),
      road_user: row.road_user,
      state: row.state,
      suppressed: String(row.suppressed).trim() === "1",
      injuries: numberOrNull(row.injuries)
    })).filter(row => Number.isInteger(row.year) && row.road_user && row.state);
  }

  function aggregateAge(rows) {
    return rows.map(row => ({
      year: Number(row.year),
      age_group: row.age_group,
      sex: row.sex,
      road_user: row.road_user,
      injuries: numberOrNull(row.injuries)
    })).filter(row => Number.isInteger(row.year) && row.age_group && row.sex && row.road_user);
  }

  function aggregateFirstNations(rows) {
    return rows.map(row => ({
      year: Number(row.year),
      road_user: row.road_user,
      suppressed: String(row.suppressed).trim() === "1",
      injuries: numberOrNull(row.injuries)
    })).filter(row => Number.isInteger(row.year) && row.road_user);
  }

  function colorFor(category, categories) {
    const index = Math.max(0, categories.indexOf(category));
    return COLORS[index % COLORS.length];
  }

  function roadUserColor(category) {
    const categories = Array.from(new Set([
      ...datasets.national.map(d => d.road_user),
      ...datasets.state.map(d => d.road_user)
    ])).sort();
    return colorFor(category, categories);
  }

  function tooltipText(selection, textFn) {
    selection
      .attr("tabindex", 0)
      .on("pointerenter focus", function (event, datum) {
        tooltip.text(textFn(datum)).attr("hidden", null);
        positionTooltip(event, this);
      })
      .on("pointermove", function (event) { positionTooltip(event, this); })
      .on("keydown", function (event) {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          tooltip.text(textFn(d3.select(this).datum())).attr("hidden", null);
          positionTooltip(event, this);
        }
      })
      .on("pointerleave blur", () => tooltip.attr("hidden", true));
  }

  function positionTooltip(event, element) {
    const rect = element.getBoundingClientRect();
    const x = event.clientX || rect.left + rect.width / 2;
    const y = event.clientY || rect.top;
    tooltip.style("left", `${Math.min(window.innerWidth - 275, Math.max(8, x + 12))}px`)
      .style("top", `${Math.min(window.innerHeight - 80, Math.max(8, y + 12))}px`);
  }

  function dimensions(container, margins, fallbackHeight = 330) {
    const width = Math.max(280, Math.floor(container.clientWidth));
    const height = Math.max(fallbackHeight, Math.floor(width * 0.54));
    const innerWidth = width - margins.left - margins.right;
    const innerHeight = height - margins.top - margins.bottom;
    return { width, height, innerWidth, innerHeight, margins };
  }

  function createSvg(selector, margins, label, fallbackHeight = 330) {
    const container = document.querySelector(selector);
    if (!container) return null;
    const box = dimensions(container, margins, fallbackHeight);
    const idPrefix = selector.replace(/[^a-z0-9]/gi, "");
    const patterns = {
      stripes: `${idPrefix}-stripes`,
      dots: `${idPrefix}-dots`,
      cross: `${idPrefix}-cross`,
      stipple: `${idPrefix}-stipple`
    };
    const svg = d3.select(container).html("").append("svg")
      .attr("viewBox", `0 0 ${box.width} ${box.height}`)
      .attr("role", "img")
      .attr("aria-label", label);
    const defs = svg.append("defs");
    const pattern = defs.append("pattern").attr("id", patterns.stripes).attr("width", 7).attr("height", 7).attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)");
    pattern.append("rect").attr("width", 7).attr("height", 7).attr("fill", "var(--green)");
    pattern.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 7).attr("stroke", "var(--surface)").attr("stroke-width", 2);
    const dots = defs.append("pattern").attr("id", patterns.dots).attr("width", 7).attr("height", 7).attr("patternUnits", "userSpaceOnUse");
    dots.append("rect").attr("width", 7).attr("height", 7).attr("fill", "var(--blue)");
    dots.append("circle").attr("cx", 3.5).attr("cy", 3.5).attr("r", 1.4).attr("fill", "var(--surface)");
    const cross = defs.append("pattern").attr("id", patterns.cross).attr("width", 8).attr("height", 8).attr("patternUnits", "userSpaceOnUse");
    cross.append("rect").attr("width", 8).attr("height", 8).attr("fill", "var(--gold)");
    cross.append("path").attr("d", "M0,0 L8,8 M8,0 L0,8").attr("stroke", "var(--surface)").attr("stroke-width", 1);
    const stipple = defs.append("pattern").attr("id", patterns.stipple).attr("width", 6).attr("height", 6).attr("patternUnits", "userSpaceOnUse");
    stipple.append("rect").attr("width", 6).attr("height", 6).attr("fill", "var(--purple)");
    stipple.append("circle").attr("cx", 1.5).attr("cy", 1.5).attr("r", 0.9).attr("fill", "var(--surface)");
    const plot = svg.append("g").attr("transform", `translate(${margins.left},${margins.top})`);
    if (container.dataset.keyboardNavigationBound !== "true") {
      container.addEventListener("keydown", event => {
        if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
        const items = Array.from(container.querySelectorAll('[tabindex="0"]'));
        const currentIndex = items.indexOf(document.activeElement);
        if (currentIndex < 0 || items.length < 2) return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        items[(currentIndex + direction + items.length) % items.length].focus();
      });
      container.dataset.keyboardNavigationBound = "true";
    }
    return { container, svg, plot, patterns, ...box };
  }

  function showEmpty(selector, message) {
    const container = document.querySelector(selector);
    if (container) d3.select(container).html("").append("p").attr("class", "chart-empty").text(message);
  }

  function withData(selector, rows, message, renderFn) {
    if (!rows || rows.length === 0) {
      showEmpty(selector, message);
      return;
    }
    renderFn(rows);
  }

  function chartTransition(selection) {
    return selection.transition().duration(750);
  }

  function renderPyramid() {
    const rows = datasets.age.filter(d => d.year === selectedYear && d.injuries !== null);
    withData("#pyramid-chart", rows, "No age and sex records are available for this year.", values => {
      const byAgeSex = d3.rollup(values, group => d3.sum(group, d => d.injuries), d => d.age_group, d => d.sex);
      const data = AGE_GROUPS.map(age => ({ age, Female: byAgeSex.get(age)?.get("Female") || 0, Male: byAgeSex.get(age)?.get("Male") || 0 }));
      const margin = { top: 24, right: 12, bottom: 40, left: 54 };
      const chart = createSvg("#pyramid-chart", margin, `Male and female road injury counts by age group, ${selectedYear}`, 350);
      if (!chart) return;
      const mid = chart.innerWidth / 2;
      const max = d3.max(data, d => Math.max(d.Female, d.Male)) || 1;
      const x = d3.scaleLinear().domain([0, max]).nice().range([0, mid - 12]);
      const y = d3.scaleBand().domain(AGE_GROUPS).range([0, chart.innerHeight]).padding(0.2);
      chart.plot.append("g").attr("class", "axis").attr("transform", `translate(0,${chart.innerHeight})`).call(d3.axisBottom(x).ticks(4).tickFormat(d3.format("~s")));
      chart.plot.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();
      chart.plot.append("g").attr("class", "axis").attr("transform", `translate(${mid},0)`).call(d3.axisRight(y).tickSize(0).tickFormat(() => "")).select(".domain").remove();
      chart.plot.append("text").attr("class", "chart-label").attr("x", mid / 2).attr("y", -9).attr("text-anchor", "middle").text("Female");
      chart.plot.append("text").attr("class", "chart-label").attr("x", mid + mid / 2).attr("y", -9).attr("text-anchor", "middle").text("Male");
      chart.plot.selectAll(".female-bar").data(data).join("rect")
        .attr("x", d => mid - x(d.Female)).attr("y", d => y(d.age)).attr("width", d => x(d.Female)).attr("height", y.bandwidth())
        .attr("fill", "var(--rose)").attr("aria-label", d => `${d.age}, female: ${formatNumber(d.Female)}`);
      chart.plot.selectAll(".male-bar").data(data).join("rect")
        .attr("x", mid).attr("y", d => y(d.age)).attr("width", d => x(d.Male)).attr("height", y.bandwidth())
        .attr("fill", "var(--blue)").attr("aria-label", d => `${d.age}, male: ${formatNumber(d.Male)}`);
      chart.plot.append("line").attr("x1", mid).attr("x2", mid).attr("y1", 0).attr("y2", chart.innerHeight).attr("stroke", "var(--line)");
      tooltipText(chart.plot.selectAll("rect"), d => `${d.age} · Female: ${formatNumber(d.Female)} · Male: ${formatNumber(d.Male)} injuries, ${selectedYear}`);
    });
  }

  function renderTrend() {
    const totals = groupSum(datasets.national.filter(d => d.injuries !== null), d => d.year, d => d.injuries)
      .map(([year, injuries]) => ({ year, injuries })).sort((a, b) => a.year - b.year);
    withData("#trend-chart", totals, "National trend records are unavailable.", data => {
      const margin = { top: 30, right: 24, bottom: 42, left: 54 };
      const chart = createSvg("#trend-chart", margin, "National hospitalisations from 2011 to 2021, with 2012 Victoria and 2017 NSW reporting annotations", 360);
      if (!chart) return;
      const x = d3.scaleLinear().domain([2011, 2021]).range([0, chart.innerWidth]);
      const y = d3.scaleLinear().domain([0, (d3.max(data, d => d.injuries) || 1) * 1.12]).nice().range([chart.innerHeight, 0]);
      chart.plot.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-chart.innerWidth).tickFormat(""));
      chart.plot.append("g").attr("class", "axis").attr("transform", `translate(0,${chart.innerHeight})`).call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(6));
      chart.plot.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")));
      const line = d3.line().x(d => x(d.year)).y(d => y(d.injuries)).curve(d3.curveMonotoneX);
      chart.plot.append("path").datum(data).attr("fill", "none").attr("stroke", "var(--green)").attr("stroke-width", 3).attr("d", line);
      const annotations = [
        { year: 2012, state: "VIC", note: "Victoria ED criteria change" },
        { year: 2017, state: "NSW", note: "NSW reporting criteria change" }
      ];
      annotations.forEach((note, i) => {
        const px = x(note.year);
        chart.plot.append("line").attr("x1", px).attr("x2", px).attr("y1", 0).attr("y2", chart.innerHeight).attr("stroke", "var(--accent)").attr("stroke-dasharray", "4 4");
        chart.plot.append("text").attr("class", "annotation-label").attr("x", px + (i ? 7 : -7)).attr("y", i ? 31 : 14).attr("text-anchor", i ? "start" : "end").text(`${note.state} · ${note.year}`);
      });
      const points = chart.plot.selectAll(".trend-point").data(data).join("circle").attr("class", "trend-point")
        .attr("cx", d => x(d.year)).attr("cy", d => y(d.injuries)).attr("r", 4).attr("fill", "var(--accent)");
      tooltipText(points, d => `${d.year} · ${formatNumber(d.injuries)} national hospitalisations`);
      annotations.forEach(note => {
        const point = chart.plot.append("circle").attr("cx", x(note.year)).attr("cy", chart.innerHeight + 2).attr("r", 8).attr("fill", "transparent").attr("stroke", "transparent");
        tooltipText(point, () => `${note.year} · ${note.note}. Interpret recorded changes with this administrative context.`);
      });
    });
  }

  function renderRoadUserBars() {
    const data = groupSum(datasets.national.filter(d => d.year === selectedYear && d.injuries !== null), d => d.road_user, d => d.injuries)
      .map(([roadUser, injuries]) => ({ roadUser, injuries })).sort((a, b) => d3.descending(a.injuries, b.injuries));
    withData("#bar-chart", data, "No road-user counts are available for this year.", values => {
      const margin = { top: 10, right: 42, bottom: 30, left: 156 };
      const chart = createSvg("#bar-chart", margin, `Road-user injury counts sorted by size, ${selectedYear}`, Math.max(310, data.length * 25));
      if (!chart) return;
      const x = d3.scaleLinear().domain([0, d3.max(values, d => d.injuries) || 1]).nice().range([0, chart.innerWidth]);
      const y = d3.scaleBand().domain(values.map(d => d.roadUser)).range([0, chart.innerHeight]).padding(0.18);
      chart.plot.append("g").attr("class", "axis").attr("transform", `translate(0,${chart.innerHeight})`).call(d3.axisBottom(x).ticks(4).tickFormat(d3.format("~s")));
      chart.plot.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();
      const bars = chart.plot.selectAll("rect").data(values).join("rect").attr("x", 0).attr("y", d => y(d.roadUser)).attr("height", y.bandwidth())
        .attr("fill", d => roadUserColor(d.roadUser));
      chartTransition(bars).attr("width", d => x(d.injuries));
      chart.plot.selectAll(".bar-value").data(values).join("text").attr("class", "chart-label").attr("x", d => x(d.injuries) + 4)
        .attr("y", d => y(d.roadUser) + y.bandwidth() / 2 + 3).text(d => d3.format("~s")(d.injuries));
      tooltipText(bars, d => `${d.roadUser} · ${formatNumber(d.injuries)} injuries, ${selectedYear}`);
    });
  }

  function renderGroupedBars() {
    const comparisonYears = [2011, 2014, 2017, 2021];
    const rows = datasets.state.filter(d => comparisonYears.includes(d.year));
    withData("#grouped-chart", rows, "State and territory records are unavailable.", values => {
      const summaries = d3.rollups(values, group => ({
        known: group.some(d => d.injuries !== null) ? d3.sum(group, d => d.injuries === null ? 0 : d.injuries) : null,
        suppressed: group.filter(d => d.suppressed || d.injuries === null).length
      }), d => d.state, d => d.year);
      const data = STATES.map(state => ({
        state,
        values: comparisonYears.map(year => {
          const entry = summaries.find(([s]) => s === state)?.[1].find(([y]) => y === year)?.[1];
          return { year, injuries: entry ? entry.known : null, suppressed: entry ? entry.suppressed : 0 };
        })
      }));
      const margin = { top: 18, right: 12, bottom: 34, left: 40 };
      const chart = createSvg("#grouped-chart", margin, "Grouped state and territory comparisons for 2011, 2014, 2017 and 2021; suppressed records are not counted as zero", 330);
      if (!chart) return;
      const x0 = d3.scaleBand().domain(STATES).range([0, chart.innerWidth]).padding(0.14);
      const x1 = d3.scaleBand().domain(comparisonYears).range([0, x0.bandwidth()]).padding(0.08);
      const max = d3.max(data.flatMap(d => d.values), d => d.injuries || 0) || 1;
      const y = d3.scaleLinear().domain([0, max * 1.08]).nice().range([chart.innerHeight, 0]);
      chart.plot.append("g").attr("class", "axis").attr("transform", `translate(0,${chart.innerHeight})`).call(d3.axisBottom(x0));
      chart.plot.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(4).tickFormat(d3.format("~s")));
      chart.plot.selectAll(".state-group").data(data).join("g").attr("class", "state-group").attr("transform", d => `translate(${x0(d.state)},0)`)
        .each(function (stateData) {
          const bars = d3.select(this).selectAll("rect").data(stateData.values).join("rect")
            .attr("x", d => x1(d.year)).attr("y", d => d.injuries === null ? chart.innerHeight - 4 : y(d.injuries))
            .attr("width", x1.bandwidth()).attr("height", d => d.injuries === null ? 4 : chart.innerHeight - y(d.injuries))
            .attr("fill", d => {
              if (d.injuries === null) return `url(#${chart.patterns.stripes})`;
              const patternName = ["stripes", "dots", "cross", "stipple"][comparisonYears.indexOf(d.year)];
              return `url(#${chart.patterns[patternName]})`;
            });
          tooltipText(bars, d => `${stateData.state} · ${d.year}: ${d.injuries === null ? "not reported" : `${formatNumber(d.injuries)} known injuries`}; ${d.suppressed} suppressed category record(s).`);
        });
      const legend = chart.svg.append("g").attr("transform", `translate(${margin.left},${chart.height - 4})`);
      comparisonYears.forEach((year, i) => {
        const patternName = ["stripes", "dots", "cross", "stipple"][i];
        legend.append("rect").attr("x", i * 70).attr("y", -8).attr("width", 9).attr("height", 9).attr("fill", `url(#${chart.patterns[patternName]})`);
        legend.append("text").attr("x", i * 70 + 13).attr("y", 0).text(String(year));
      });
    });
  }

  function renderArea() {
    const rows = datasets.national.filter(d => d.injuries !== null);
    withData("#area-chart", rows, "National road-user trends are unavailable.", values => {
      const categories = Array.from(new Set(values.map(d => d.road_user))).sort();
      const data = YEARS.map(year => {
        const row = { year };
        categories.forEach(category => {
          row[category] = d3.sum(values.filter(d => d.year === year && d.road_user === category), d => d.injuries);
        });
        return row;
      });
      const margin = { top: 18, right: 20, bottom: 40, left: 54 };
      const chart = createSvg("#area-chart", margin, "Stacked area chart of annual hospitalisations split by road-user type", 390);
      if (!chart) return;
      const stack = d3.stack().keys(categories)(data);
      const x = d3.scaleLinear().domain(d3.extent(YEARS)).range([0, chart.innerWidth]);
      const y = d3.scaleLinear().domain([0, d3.max(stack, series => d3.max(series, point => point[1])) || 1]).nice().range([chart.innerHeight, 0]);
      chart.plot.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-chart.innerWidth).tickFormat(""));
      chart.plot.append("g").attr("class", "axis").attr("transform", `translate(0,${chart.innerHeight})`).call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(6));
      chart.plot.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")));
      const area = d3.area().x(d => x(d.data.year)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveMonotoneX);
      const paths = chart.plot.selectAll(".area-series").data(stack).join("path").attr("class", "area-series").attr("d", area).attr("fill", d => roadUserColor(d.key)).attr("opacity", 0.78)
        .attr("stroke", "var(--surface)").attr("stroke-width", 0.5);
      tooltipText(paths, d => `${d.key} · ${formatNumber(d3.sum(d, p => p.data[d.key]))} injuries across 2011–2021`);
      const legend = chart.svg.append("g").attr("transform", `translate(${margin.left},${chart.height - 6})`);
      const itemWidth = Math.max(75, chart.innerWidth / categories.length);
      categories.forEach((category, i) => {
        const group = legend.append("g").attr("transform", `translate(${(i % 6) * itemWidth},${Math.floor(i / 6) * 15 - (categories.length > 6 ? 14 : 0)})`);
        group.append("rect").attr("width", 8).attr("height", 8).attr("fill", colorFor(category, categories));
        group.append("text").attr("x", 12).attr("y", 8).text(category.length > 17 ? `${category.slice(0, 16)}…` : category);
      });
    });
  }

  function renderMap() {
    const rows = datasets.state.filter(d => d.year === selectedYear);
    withData("#map-chart", rows, "Jurisdiction records are unavailable for this year.", values => {
      const summaries = d3.rollups(values, group => ({
        known: group.some(d => d.injuries !== null) ? d3.sum(group, d => d.injuries === null ? 0 : d.injuries) : null,
        suppressed: group.filter(d => d.suppressed || d.injuries === null).length
      }), d => d.state);
      const entries = STATES.map(state => {
        const entry = summaries.find(([name]) => name === state);
        return { state, known: entry ? entry[1].known : null, suppressed: entry ? entry[1].suppressed : 0 };
      });
      const margin = { top: 18, right: 16, bottom: 22, left: 16 };
      const chart = createSvg("#map-chart", margin, `Australian jurisdiction grid of known injury counts, ${selectedYear}; suppressed values remain unknown`, 300);
      if (!chart) return;
      const positions = entries.map(d => STATE_GRID[d.state]);
      const maxCol = d3.max(positions, d => d[0]) || 1;
      const maxRow = d3.max(positions, d => d[1]) || 1;
      const cell = Math.min((chart.innerWidth - 18) / (maxCol + 1), (chart.innerHeight - 18) / (maxRow + 1));
      const max = d3.max(entries, d => d.known || 0) || 1;
      const color = d3.scaleSequential().domain([0, max]).interpolator(t => d3.interpolateRgb("#e6d9c8", "#843620")(t));
      const groups = chart.plot.selectAll(".state-tile").data(entries).join("g").attr("class", "state-tile")
        .attr("transform", d => `translate(${STATE_GRID[d.state][0] * cell},${STATE_GRID[d.state][1] * cell})`);
      groups.append("rect").attr("width", cell - 5).attr("height", cell - 5).attr("rx", 3)
        .attr("fill", d => d.known === null ? `url(#${chart.patterns.stripes})` : color(d.known)).attr("stroke", "var(--surface)").attr("stroke-width", 2);
      groups.append("text").attr("class", "tile-label").attr("x", (cell - 5) / 2).attr("y", cell * 0.43).attr("text-anchor", "middle").text(d => d.state);
      groups.append("text").attr("class", "tile-value").attr("x", (cell - 5) / 2).attr("y", cell * 0.68).attr("text-anchor", "middle").text(d => d.known === null ? "n/a" : d3.format("~s")(d.known));
      tooltipText(groups, d => `${d.state} · ${d.known === null ? "no published count" : `${formatNumber(d.known)} known injuries`} · ${d.suppressed} suppressed record(s), ${selectedYear}.`);
    });
  }

  function renderHeatmap() {
    const rows = datasets.age.filter(d => d.year === selectedYear && d.injuries !== null);
    withData("#heatmap-chart", rows, "No demographic records are available for this year.", values => {
      const categories = Array.from(new Set(values.map(d => d.road_user))).sort();
      const totals = d3.rollup(values, group => d3.sum(group, d => d.injuries), d => d.age_group, d => d.road_user);
      const data = AGE_GROUPS.flatMap(age => categories.map(roadUser => ({ age, roadUser, injuries: totals.get(age)?.get(roadUser) || 0 })));
      const margin = { top: 12, right: 12, bottom: 88, left: 54 };
      const chart = createSvg("#heatmap-chart", margin, `Heat map of injury counts by age group and road-user type, ${selectedYear}`, 390);
      if (!chart) return;
      const x = d3.scaleBand().domain(categories).range([0, chart.innerWidth]).padding(0.08);
      const y = d3.scaleBand().domain(AGE_GROUPS).range([0, chart.innerHeight]).padding(0.08);
      const max = d3.max(data, d => d.injuries) || 1;
      const color = d3.scaleSequential().domain([0, max]).interpolator(d3.interpolateYlOrRd);
      chart.plot.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();
      chart.plot.append("g").attr("class", "axis").attr("transform", `translate(0,${chart.innerHeight})`)
        .call(d3.axisBottom(x).tickSize(0).tickFormat(label => label.length > 13 ? `${label.slice(0, 11)}…` : label))
        .selectAll("text").attr("transform", "rotate(-42)").style("text-anchor", "end").attr("dx", "-0.7em").attr("dy", "0.15em");
      const cells = chart.plot.selectAll("rect").data(data).join("rect").attr("x", d => x(d.roadUser)).attr("y", d => y(d.age))
        .attr("width", x.bandwidth()).attr("height", y.bandwidth()).attr("rx", 1).attr("fill", d => color(d.injuries));
      tooltipText(cells, d => `${d.age} · ${d.roadUser} · ${formatNumber(d.injuries)} injuries, ${selectedYear}`);
    });
  }

  function renderTreemap() {
    const rows = datasets.state.filter(d => d.year === selectedYear && d.injuries !== null);
    withData("#treemap-chart", rows, "No jurisdiction breakdown is available for this year.", values => {
      const treeData = d3.rollups(values, group => d3.rollups(group, items => d3.sum(items, d => d.injuries), d => d.road_user)
        .map(([name, value]) => ({ name, value })), d => d.state).map(([name, children]) => ({ name, children }));
      const margin = { top: 8, right: 4, bottom: 8, left: 4 };
      const chart = createSvg("#treemap-chart", margin, `Treemap of known road-user injury counts by jurisdiction, ${selectedYear}`, 330);
      if (!chart) return;
      const root = d3.hierarchy({ name: "Australia", children: treeData }).sum(d => d.value || 0).sort((a, b) => b.value - a.value);
      d3.treemap().size([chart.innerWidth, chart.innerHeight]).paddingOuter(3).paddingTop(16).paddingInner(1)(root);
      const groups = chart.plot.selectAll(".treemap-group").data(root.children || []).join("g").attr("class", "treemap-group");
      groups.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => Math.max(0, d.x1 - d.x0)).attr("height", d => Math.max(0, d.y1 - d.y0))
        .attr("fill", d => colorFor(d.data.name, STATES)).attr("fill-opacity", 0.22).attr("stroke", "var(--line)");
      groups.append("text").attr("class", "chart-label").attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 12).style("font-weight", 700).text(d => d.data.name);
      const leaves = groups.selectAll(".leaf").data(d => d.children || []).join("g").attr("class", "leaf");
      leaves.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => Math.max(0, d.x1 - d.x0)).attr("height", d => Math.max(0, d.y1 - d.y0))
        .attr("fill", d => roadUserColor(d.data.name)).attr("fill-opacity", 0.82).attr("stroke", "var(--surface)").attr("stroke-width", 1);
      leaves.filter(d => d.x1 - d.x0 > 45 && d.y1 - d.y0 > 22).append("text").attr("class", "tile-label").attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 14)
        .text(d => `${d.data.name.slice(0, 14)}${d.data.name.length > 14 ? "…" : ""}`);
      tooltipText(leaves.select("rect"), d => `${d.parent.data.name} · ${d.data.name}: ${formatNumber(d.value)} known injuries, ${selectedYear}`);
    });
  }

  function renderSlope() {
    const rows = datasets.national.filter(d => (d.year === 2011 || d.year === 2021) && d.injuries !== null);
    withData("#slope-chart", rows, "Baseline and final year records are unavailable.", values => {
      const data = d3.rollups(values, group => ({
        start: group.find(d => d.year === 2011)?.injuries,
        end: group.find(d => d.year === 2021)?.injuries
      }), d => d.road_user).map(([roadUser, pair]) => ({ roadUser, ...pair }))
        .filter(d => d.start !== undefined && d.end !== undefined);
      const margin = { top: 18, right: 105, bottom: 24, left: 105 };
      const chart = createSvg("#slope-chart", margin, "Slope chart comparing national road-user counts in 2011 and 2021", 370);
      if (!chart) return;
      const x = d3.scalePoint().domain([2011, 2021]).range([0, chart.innerWidth]);
      const y = d3.scaleLinear().domain([0, d3.max(data, d => Math.max(d.start, d.end)) || 1]).nice().range([chart.innerHeight, 0]);
      chart.plot.append("text").attr("class", "chart-label").attr("x", x(2011)).attr("y", -4).attr("text-anchor", "middle").text("2011");
      chart.plot.append("text").attr("class", "chart-label").attr("x", x(2021)).attr("y", -4).attr("text-anchor", "middle").text("2021");
      const lines = chart.plot.selectAll("line").data(data).join("line").attr("x1", x(2011)).attr("x2", x(2021))
        .attr("y1", d => y(d.start)).attr("y2", d => y(d.end)).attr("stroke", d => roadUserColor(d.roadUser)).attr("stroke-width", 2);
      chart.plot.selectAll(".slope-start").data(data).join("circle").attr("cx", x(2011)).attr("cy", d => y(d.start)).attr("r", 3).attr("fill", d => roadUserColor(d.roadUser));
      chart.plot.selectAll(".slope-end").data(data).join("circle").attr("cx", x(2021)).attr("cy", d => y(d.end)).attr("r", 3).attr("fill", d => roadUserColor(d.roadUser));
      chart.plot.selectAll(".slope-left").data(data).join("text").attr("class", "chart-label").attr("x", x(2011) - 6).attr("y", d => y(d.start) + 3).attr("text-anchor", "end").text(d => d.roadUser);
      chart.plot.selectAll(".slope-right").data(data).join("text").attr("class", "chart-label").attr("x", x(2021) + 7).attr("y", d => y(d.end) + 3).text(d => d.roadUser);
      tooltipText(lines, d => {
        const change = d.start ? ((d.end - d.start) / d.start) * 100 : null;
        return `${d.roadUser} · 2011: ${formatNumber(d.start)} · 2021: ${formatNumber(d.end)} · Change: ${change === null ? "not available" : `${change > 0 ? "+" : ""}${d3.format(".1f")(change)}%`}`;
      });
    });
  }

  function renderSparkCards() {
    const nationalByType = d3.rollups(datasets.national.filter(d => d.injuries !== null), group => d3.sum(group, d => d.injuries), d => d.road_user)
      .sort((a, b) => d3.descending(a[1], b[1])).slice(0, 3).map(([roadUser]) => roadUser);
    const series = nationalByType.map(name => ({
      name,
      rows: YEARS.map(year => ({ year, value: d3.sum(datasets.national.filter(d => d.year === year && d.road_user === name && d.injuries !== null), d => d.injuries) })),
      kind: "National"
    }));
    series.push({
      name: "First Nations · known minimum",
      rows: YEARS.map(year => {
        const yearRows = datasets.firstNations.filter(d => d.year === year);
        const published = yearRows.filter(d => d.injuries !== null);
        return { year, value: published.length ? d3.sum(published, d => d.injuries) : null, suppressed: yearRows.some(d => d.suppressed || d.injuries === null) };
      }),
      kind: "First Nations"
    });
    const selector = "#first-nations-chart";
    if (series.length === 0) {
      showEmpty(selector, "Summary trends are unavailable.");
      return;
    }
    const margin = { top: 5, right: 5, bottom: 5, left: 5 };
    const narrow = document.querySelector(selector).clientWidth < 420;
    const chart = createSvg(selector, margin, "Four sparkline cards: three largest national road-user categories and the known minimum First Nations total", narrow ? 440 : 300);
    if (!chart) return;
    const cols = chart.width < 420 ? 1 : 2;
    const rows = Math.ceil(series.length / cols);
    const cardW = (chart.innerWidth - (cols - 1) * 10) / cols;
    const cardH = (chart.innerHeight - (rows - 1) * 10) / rows;
    series.forEach((item, index) => {
      const x0 = (index % cols) * (cardW + 10);
      const y0 = Math.floor(index / cols) * (cardH + 10);
      const group = chart.plot.append("g").attr("transform", `translate(${x0},${y0})`);
      group.append("rect").attr("class", "spark-card").attr("width", cardW).attr("height", cardH).attr("rx", 3);
      group.append("text").attr("class", "spark-title").attr("x", 10).attr("y", 18).text(item.name.length > 30 ? `${item.name.slice(0, 28)}…` : item.name);
      const last = item.rows[item.rows.length - 1];
      group.append("text").attr("class", "spark-value").attr("x", 10).attr("y", 42).text(formatNumber(last.value));
      if (item.kind === "First Nations") group.append("text").attr("class", "spark-title").attr("x", cardW - 8).attr("y", 42).attr("text-anchor", "end").text(item.rows.some(d => d.suppressed) ? "known minimum*" : "known count");
      const sx = d3.scaleLinear().domain([2011, 2021]).range([10, cardW - 10]);
      const sy = d3.scaleLinear().domain([0, d3.max(item.rows, d => d.value || 0) || 1]).range([cardH - 10, 52]);
      group.append("path").datum(item.rows).attr("fill", "none").attr("stroke", item.kind === "First Nations" ? "var(--accent)" : roadUserColor(item.name))
        .attr("stroke-width", 2).attr("d", d3.line().defined(d => d.value !== null).x(d => sx(d.year)).y(d => sy(d.value)).curve(d3.curveMonotoneX));
      tooltipText(group, () => `${item.name} · 2011–2021. ${item.kind === "First Nations" ? "Known published values only; suppressed records are excluded." : "National recorded injuries."}`);
    });
  }

  function renderAll() {
    if (!datasets) return;
    renderPyramid();
    renderTrend();
    renderRoadUserBars();
    renderGroupedBars();
    renderArea();
    renderMap();
    renderHeatmap();
    renderTreemap();
    renderSlope();
    renderSparkCards();
  }

  function setupTheme() {
    const button = document.querySelector("#theme-toggle");
    const savedTheme = localStorage.getItem("road-trauma-theme");
    if (savedTheme === "dark") document.documentElement.dataset.theme = "dark";
    button?.addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme !== "dark";
      if (dark) document.documentElement.dataset.theme = "dark";
      else delete document.documentElement.dataset.theme;
      localStorage.setItem("road-trauma-theme", dark ? "dark" : "light");
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
      const label = button.querySelector(".theme-label");
      if (label) label.textContent = `${dark ? "Light" : "Dark"} mode`;
      renderAll();
    });
    if (button && savedTheme === "dark") {
      button.setAttribute("aria-pressed", "true");
      button.setAttribute("aria-label", "Switch to light mode");
      const label = button.querySelector(".theme-label");
      if (label) label.textContent = "Light mode";
    }
  }

  async function loadData() {
    try {
      const [age, national, state, firstNations] = await Promise.all([
        d3.csv(dataFiles.age),
        d3.csv(dataFiles.national),
        d3.csv(dataFiles.state),
        d3.csv(dataFiles.firstNations)
      ]);
      datasets = {
        age: aggregateAge(age),
        national: aggregateNational(national),
        state: aggregateState(state),
        firstNations: aggregateFirstNations(firstNations)
      };
      if (!datasets.age.length || !datasets.national.length || !datasets.state.length || !datasets.firstNations.length) {
        throw new Error("One or more CSV files did not contain usable records.");
      }
      yearSelect.innerHTML = "";
      YEARS.forEach(year => yearSelect.add(new Option(String(year), String(year))));
      yearSelect.value = String(selectedYear);
      yearSelect.addEventListener("change", () => {
        selectedYear = Number(yearSelect.value);
        renderAll();
      });
      status.textContent = "All four datasets loaded. Suppressed records are kept separate from known counts.";
      renderAll();
    } catch (error) {
      console.error("Unable to load road trauma datasets:", error);
      status.textContent = "The visualisations could not load. Check that the four CSV files are available in the data folder.";
      document.querySelectorAll(".chart").forEach(chart => {
        chart.innerHTML = "";
        const message = document.createElement("p");
        message.className = "chart-empty";
        message.textContent = "Dataset unavailable. Check the browser console for details.";
        chart.append(message);
      });
    }
  }

  setupTheme();
  loadData();
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(renderAll, 150);
  });
})();
