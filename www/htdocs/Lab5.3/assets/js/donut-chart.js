(() => {
    const width = 600;
    const height = 400;
    const radius = Math.min(width, height) / 2 - 24;
    const svg = d3.select("#donut-chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`);
    const chart = svg.append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    d3.csv("data/tvScreenSizeCounts.csv", d => ({
        screenSize: d.Screensize_Category,
        count: +d["Count*(Submit_ID)"]
    })).then(data => {
        if (data.length === 0 || data.some(d => !d.screenSize || !Number.isFinite(d.count) || d.count <= 0)) {
            throw new Error("TV screen size data must contain categories with positive numeric counts.");
        }

        console.log("TV screen size counts:", data);
        drawDonutChart(data);
    }).catch(error => {
        console.error("Failed to load TV screen size counts:", error);
    });

    const drawDonutChart = data => {
        const total = d3.sum(data, d => d.count);
        const colorScale = d3.scaleOrdinal()
            .domain(data.map(d => d.screenSize))
            .range(d3.schemeTableau10);
        const pie = d3.pie()
            .sort(null)
            .value(d => d.count);
        const arcGenerator = d3.arc()
            .innerRadius(radius * 0.6)
            .outerRadius(radius)
            .padAngle(0.015)
            .cornerRadius(3);
        const labelArc = d3.arc()
            .innerRadius(radius * 0.79)
            .outerRadius(radius * 0.79);

        chart.selectAll(".donut-slice")
            .data(pie(data))
            .join("path")
            .attr("class", "donut-slice")
            .attr("d", arcGenerator)
            .attr("fill", d => colorScale(d.data.screenSize))
            .attr("stroke", "#fff")
            .attr("stroke-width", 2);

        chart.selectAll(".donut-label")
            .data(pie(data))
            .join("text")
            .attr("class", "donut-label")
            .attr("transform", d => `translate(${labelArc.centroid(d)})`)
            .attr("text-anchor", "middle")
            .attr("fill", "#fff")
            .style("font-size", "13px")
            .style("font-weight", "600")
            .text(d => `${d.data.screenSize} ${d3.format(".0%")(d.data.count / total)}`);

        chart.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "-0.2em")
            .style("font-size", "16px")
            .style("font-weight", "600")
            .text("TV models");

        chart.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "1.3em")
            .style("font-size", "14px")
            .text(d3.format(",")(total));
    };
})();
