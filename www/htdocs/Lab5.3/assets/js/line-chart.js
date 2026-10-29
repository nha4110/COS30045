(() => {
    const margin = { top: 40, right: 30, bottom: 60, left: 70 };
    const width = 600 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    const svg = d3.select("#line-chart")
        .append("svg")
        .attr("viewBox", "0 0 600 400");
    const innerChart = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    d3.csv("data/ARE_Spot_Prices.csv", d => ({
        year: +d.Year,
        averagePrice: +d["Average Price (notTas-Snowy)"]
    })).then(data => {
        data.sort((a, b) => a.year - b.year);
        console.log("Australian electricity spot price data:", data);
        drawLineChart(data);
    }).catch(error => {
        console.error("Failed to load Australian electricity spot price data:", error);
    });

    const drawLineChart = data => {
        const xScale = d3.scaleLinear()
            .domain(d3.extent(data, d => d.year))
            .range([0, width]);
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.averagePrice)])
            .nice()
            .range([height, 0]);

        innerChart.append("g")
            .attr("transform", `translate(0, ${height})`)
            .call(d3.axisBottom(xScale).tickFormat(d3.format("d")));
        innerChart.append("g")
            .call(d3.axisLeft(yScale));

        innerChart.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2)
            .attr("y", -52)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .text("Average price ($ per MWh)");

        innerChart.append("text")
            .attr("x", width / 2)
            .attr("y", height + 45)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .text("Year");

        innerChart.selectAll(".data-point")
            .data(data)
            .join("circle")
            .attr("class", "data-point")
            .attr("r", 3)
            .attr("cx", d => xScale(d.year))
            .attr("cy", d => yScale(d.averagePrice))
            .attr("fill", "#147d70");

        const lineGenerator = d3.line()
            .x(d => xScale(d.year))
            .y(d => yScale(d.averagePrice));

        innerChart.append("path")
            .datum(data)
            .attr("fill", "none")
            .attr("stroke", "#147d70")
            .attr("stroke-width", 2)
            .attr("d", lineGenerator);
    };
})();
