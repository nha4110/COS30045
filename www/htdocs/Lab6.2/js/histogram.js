(() => {
    const { svgWidth, svgHeight, margin, binGenerator, xScale, yScale } = window.histogramConfig;
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;
    const svg = d3.select("#histogram")
        .append("svg")
        .attr("class", "histogram-svg")
        .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`)
        .attr("role", "img")
        .attr("aria-label", "Histogram of TV energy consumption, with 200 kilowatt-hour bins");
    const innerChart = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    innerChart.append("g")
        .attr("class", "axis axis-x")
        .attr("transform", `translate(0, ${height})`)
        .call(d3.axisBottom(xScale).ticks(14).tickFormat(d3.format(",d")));
    innerChart.append("g")
        .attr("class", "axis axis-y")
        .call(d3.axisLeft(yScale).ticks(14).tickFormat(d3.format(",")));

    innerChart.append("text")
        .attr("class", "axis-label")
        .attr("x", -margin.left + 5)
        .attr("y", -12)
        .text("Frequency");

    innerChart.append("text")
        .attr("class", "axis-label")
        .attr("x", width)
        .attr("y", height + margin.bottom - 8)
        .attr("text-anchor", "end")
        .text("Labeled Energy Consumption (kWh/year)");

    window.drawHistogram = data => {
        const bins = binGenerator(data);
        window.histogramConfig.xScale
            .domain([bins[0].x0, bins[bins.length - 1].x1])
            .range([0, width]);
        window.histogramConfig.yScale
            .domain([0, d3.max(binGenerator(window.allTvData), bin => bin.length)])
            .nice()
            .range([height, 0]);

        innerChart.select(".axis-x")
            .call(d3.axisBottom(xScale).ticks(14).tickFormat(d3.format(",d")));
        innerChart.select(".axis-y")
            .call(d3.axisLeft(yScale).ticks(14).tickFormat(d3.format(",")));

        console.log("TV energy consumption histogram bins:", bins);
        window.updateHistogram(data);
    };

    window.updateHistogram = data => {
        const bins = binGenerator(data);
        const bars = innerChart.selectAll(".histogram-bar")
            .data(bins, bin => bin.x0)
            .join(
                enter => enter.append("rect")
                    .attr("class", "histogram-bar")
                    .attr("x", bin => xScale(bin.x0))
                    .attr("y", height)
                    .attr("width", bin => Math.max(0, xScale(bin.x1) - xScale(bin.x0) - 1))
                    .attr("height", 0),
                update => update,
                exit => exit.remove()
            )
            .attr("stroke", window.histogramConfig.bodyBackgroundColor)
            .attr("tabindex", 0)
            .attr("aria-label", bin => `${bin.x0} to ${bin.x1} kWh per year: ${bin.length} TVs`);

        bars.selectAll("title")
            .data(bin => [bin])
            .join("title")
            .text(bin => `${bin.x0}–${bin.x1} kWh/year: ${bin.length} TVs`);

        bars.interrupt()
            .transition()
            .duration(450)
            .ease(d3.easeCubicOut)
            .attr("x", bin => xScale(bin.x0))
            .attr("y", bin => yScale(bin.length))
            .attr("width", bin => Math.max(0, xScale(bin.x1) - xScale(bin.x0) - 1))
            .attr("height", bin => height - yScale(bin.length))
            .attr("fill", window.histogramConfig.barColor);

        window.attachHistogramInteractions(bars);
    };
})();
