d3.select(".hero h1")
    .style("color", "#cbe7a4");

d3.select("#energy-note")
    .append("p")
    .text("Purchasing a low energy consumption TV will help with your energy bills!");

d3.select("#energy-visual")
    .append("rect")
    .attr("x", 50)
    .attr("y", 50)
    .attr("width", 100)
    .attr("height", 30)
    .style("fill", "#2e7d32");
