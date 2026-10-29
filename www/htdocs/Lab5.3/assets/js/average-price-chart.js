(() => {
    const margin = { top: 45, right: 160, bottom: 55, left: 70 };
    const width = 800 - margin.left - margin.right;
    const height = 450 - margin.top - margin.bottom;
    const svg = d3.select("#average-price-chart")
        .append("svg")
        .attr("viewBox", "0 0 800 450");
    const innerChart = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    d3.csv("data/ARE_Spot_Prices.csv", d => ({
        year: +d.Year,
        averagePrice: +d["Average Price (notTas-Snowy)"]
    })).then(data => {
        data.sort((a, b) => a.year - b.year);
        drawAveragePriceChart(data);
    }).catch(error => {
        console.error("Failed to load annual average electricity prices:", error);
    });

    const drawAveragePriceChart = data => {
        const xScale = d3.scaleLinear()
            .domain(d3.extent(data, d => d.year))
            .range([0, width]);
        const yScale = d3.scaleLinear()
            .domain([0, 150])
            .range([height, 0]);

        innerChart.append("g")
            .attr("transform", `translate(0, ${height})`)
            .call(d3.axisBottom(xScale)
                .tickValues(d3.range(1998, 2025, 2))
                .tickFormat(d3.format("d")));
        innerChart.append("g")
            .call(d3.axisLeft(yScale).tickValues(d3.range(0, 141, 20)));

        innerChart.append("text")
            .attr("x", -25)
            .attr("y", -12)
            .style("font-size", "11px")
            .text("Average Price ($ per MWh)");

        const areaGenerator = d3.area()
            .x(d => xScale(d.year))
            .y0(height)
            .y1(d => yScale(d.averagePrice))
            .curve(d3.curveStepAfter);
        const lineGenerator = d3.line()
            .x(d => xScale(d.year))
            .y(d => yScale(d.averagePrice))
            .curve(d3.curveStepAfter);

        innerChart.append("path")
            .datum(data)
            .attr("fill", "#d8eee6")
            .attr("d", areaGenerator);

        innerChart.append("path")
            .datum(data)
            .attr("fill", "none")
            .attr("stroke", "#147d70")
            .attr("stroke-width", 1)
            .attr("d", lineGenerator);

        innerChart.selectAll(".average-price-point")
            .data(data)
            .join("circle")
            .attr("class", "average-price-point")
            .attr("r", 2.8)
            .attr("cx", d => xScale(d.year))
            .attr("cy", d => yScale(d.averagePrice))
            .attr("fill", "#147d70");

        innerChart.append("circle")
            .attr("cx", width + 10)
            .attr("cy", 20)
            .attr("r", 2.8)
            .attr("fill", "#147d70");

        innerChart.append("text")
            .attr("x", width + 18)
            .attr("y", 23)
            .attr("fill", "#147d70")
            .style("font-size", "11px")
            .text("Average Price ($ per MWh)");
    };
})();
