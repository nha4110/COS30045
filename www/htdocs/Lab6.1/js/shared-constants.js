window.histogramConfig = {
    svgWidth: 900,
    svgHeight: 450,
    margin: { top: 35, right: 30, bottom: 65, left: 60 },
    bodyBackgroundColor: "#fffaf0",
    barColor: "#626767",
    highlightColor: "#1d5b83",
    binGenerator: d3.bin()
        .value(d => d.energyConsumption)
        .domain([0, 2800])
        .thresholds(d3.range(0, 2801, 200)),
    xScale: d3.scaleLinear(),
    yScale: d3.scaleLinear()
};
