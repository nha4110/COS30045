const margin = { top: 40, right: 30, bottom: 60, left: 70 };
const width = 600 - margin.left - margin.right;
const height = 400 - margin.top - margin.bottom;

const svg = d3.select("#bar-chart")
    .append("svg")
    .attr("viewBox", "0 0 600 400");

const innerChart = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

d3.csv("data/tv55EnergyConsumption.csv", d => ({
    screenType: d["Screen_Tech"],
    energy: +d["Mean(Labelled energy consumption (kWh/year))"]
})).then(data => {
    data.sort((a, b) => b.energy - a.energy);
    drawBarChart(data);
}).catch(error => {
    console.error("Failed to load TV energy consumption data:", error);
});

const drawBarChart = data => {
    const xScale = d3.scaleBand()
        .domain(data.map(d => d.screenType))
        .range([0, width])
        .paddingInner(0.1)
        .paddingOuter(0.1);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.energy) * 1.15])
        .range([height, 0]);

    const xAxis = d3.axisBottom(xScale);
    innerChart.append("g")
        .attr("transform", `translate(0, ${height})`)
        .call(xAxis);

    const yAxis = d3.axisLeft(yScale);
    innerChart.append("g")
        .call(yAxis);

    innerChart.append("text")
        .attr("class", "chart-title")
        .attr("x", -36)
        .attr("y", -14)
        .style("font-size", "12px")
        .text("Energy Consumption (kWh)");

    innerChart.selectAll(".bar")
        .data(data)
        .join("rect")
        .attr("class", "bar")
        .attr("x", d => xScale(d.screenType))
        .attr("y", d => yScale(d.energy))
        .attr("width", xScale.bandwidth())
        .attr("height", d => height - yScale(d.energy))
        .attr("fill", "#147d70");

    innerChart.selectAll(".value-label")
        .data(data)
        .join("text")
        .attr("class", "value-label")
        .attr("x", d => xScale(d.screenType) + xScale.bandwidth() / 2)
        .attr("y", d => yScale(d.energy) - 6)
        .attr("text-anchor", "middle")
        .style("font-size", "11px")
        .text(d => `${Math.round(d.energy)} kWh`);
};
