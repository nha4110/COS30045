window.histogramConfig = {
    svgWidth: 900,
    svgHeight: 450,
    margin: { top: 35, right: 30, bottom: 65, left: 60 },
    bodyBackgroundColor: "#fffaf0",
    barColor: "#626767",
    highlightColor: "#1d5b83",
    filters: [
        { id: "all", label: "All", isActive: true },
        { id: "LCD", label: "LCD", isActive: false },
        { id: "LED", label: "LED", isActive: false },
        { id: "OLED", label: "OLED", isActive: false }
    ],
    sizeFilters: [
        { id: "all", label: "All Sizes", isActive: true },
        { id: 24, label: '24"', isActive: false },
        { id: 32, label: '32"', isActive: false },
        { id: 55, label: '55"', isActive: false },
        { id: 65, label: '65"', isActive: false },
        { id: 98, label: '98"', isActive: false }
    ],
    binGenerator: d3.bin()
        .value(d => d.energyConsumption)
        .domain([0, 2800])
        .thresholds(d3.range(0, 2801, 200)),
    xScale: d3.scaleLinear(),
    yScale: d3.scaleLinear()
};

window.scatterplotConfig = {
    svgWidth: 900,
    svgHeight: 480,
    margin: { top: 40, right: 165, bottom: 70, left: 70 },
    innerChartS: null,
    tooltipWidth: 130,
    tooltipHeight: 34,
    xScaleS: d3.scaleLinear(),
    yScaleS: d3.scaleLinear(),
    colorScale: d3.scaleOrdinal()
        .domain(["LED", "LCD", "OLED"])
        .range(d3.schemeTableau10)
};
