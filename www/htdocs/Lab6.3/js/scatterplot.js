window.drawScatterplot = data => {
    const { svgWidth, svgHeight, margin, xScaleS, yScaleS, colorScale } = window.scatterplotConfig;
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;
    const svg = d3.select("#scatterplot")
        .append("svg")
        .attr("class", "scatterplot-svg")
        .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`)
        .attr("role", "img")
        .attr("aria-label", "Scatterplot of TV energy consumption by star rating, colored by screen technology");
    const innerChartS = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);
    window.scatterplotConfig.innerChartS = innerChartS;

    xScaleS
        .domain([0, d3.max(data, d => d.star)])
        .nice()
        .range([0, width]);
    yScaleS
        .domain([0, d3.max(data, d => d.energyConsumption)])
        .nice()
        .range([height, 0]);

    innerChartS.append("g")
        .attr("class", "axis scatterplot-axis-x")
        .attr("transform", `translate(0, ${height})`)
        .call(d3.axisBottom(xScaleS).ticks(8));
    innerChartS.append("g")
        .attr("class", "axis scatterplot-axis-y")
        .call(d3.axisLeft(yScaleS).ticks(10).tickFormat(d3.format(",")));

    innerChartS.append("text")
        .attr("class", "axis-label")
        .attr("x", width / 2)
        .attr("y", height + margin.bottom - 15)
        .attr("text-anchor", "middle")
        .text("Star Rating");
    innerChartS.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -50)
        .attr("text-anchor", "middle")
        .text("Energy Consumption (kWh/year)");

    const legend = innerChartS.append("g")
        .attr("class", "scatterplot-legend")
        .attr("transform", `translate(${width + 22}, 0)`);
    const technologies = colorScale.domain();
    const legendItems = legend.selectAll(".legend-item")
        .data(technologies)
        .join("g")
        .attr("class", "legend-item")
        .attr("transform", (technology, index) => `translate(0, ${index * 24})`);

    legendItems.append("circle")
        .attr("r", 6)
        .attr("cx", 6)
        .attr("cy", 6)
        .attr("fill", technology => colorScale(technology));
    legendItems.append("text")
        .attr("x", 18)
        .attr("y", 10)
        .text(technology => technology);

    window.updateScatterplot(data);
};

window.updateScatterplot = data => {
    const { innerChartS, xScaleS, yScaleS, colorScale } = window.scatterplotConfig;

    innerChartS.selectAll(".scatterplot-point")
        .data(data, d => d.id)
        .join("circle")
        .attr("class", "scatterplot-point")
        .attr("cx", d => xScaleS(d.star))
        .attr("cy", d => yScaleS(d.energyConsumption))
        .attr("r", 3)
        .attr("fill", d => colorScale(d.screenTech))
        .attr("opacity", 0.5);
};
