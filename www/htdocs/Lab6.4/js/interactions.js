window.attachHistogramInteractions = selection => {
    selection
        .on("pointerenter focus", function () {
            d3.select(this).attr("fill", window.histogramConfig.highlightColor);
        })
        .on("pointerleave blur", function () {
            d3.select(this).attr("fill", window.histogramConfig.barColor);
        });
};

window.createTooltip = () => {
    const { innerChartS, tooltipWidth, tooltipHeight } = window.scatterplotConfig;
    const tooltip = innerChartS.append("g")
        .attr("class", "scatterplot-tooltip")
        .style("opacity", 0)
        .style("pointer-events", "none");

    tooltip.append("rect")
        .attr("width", tooltipWidth)
        .attr("height", tooltipHeight)
        .attr("rx", 5)
        .attr("fill", window.histogramConfig.barColor)
        .attr("fill-opacity", 0.9);

    tooltip.append("text")
        .attr("x", 10)
        .attr("y", 22)
        .attr("fill", "#fff");

    window.scatterplotConfig.tooltip = tooltip;
};

window.handleMouseEvents = () => {
    const { tooltip, tooltipWidth, tooltipHeight, svgWidth, margin } = window.scatterplotConfig;
    const plotWidth = svgWidth - margin.left - margin.right;
    const plotHeight = window.scatterplotConfig.svgHeight - margin.top - margin.bottom;

    window.scatterplotConfig.innerChartS.selectAll(".scatterplot-point")
        .on("mouseenter.tooltip focus.tooltip", function (event, datum) {
            const pointX = Number(this.getAttribute("cx"));
            const pointY = Number(this.getAttribute("cy"));
            const x = Math.max(0, Math.min(pointX + 10, plotWidth - tooltipWidth));
            const y = Math.max(0, Math.min(pointY - tooltipHeight - 10, plotHeight - tooltipHeight));

            tooltip.select("text")
                .text(`Screen size: ${datum.screenSize}"`);
            tooltip
                .attr("transform", `translate(${x}, ${y})`)
                .interrupt()
                .transition()
                .duration(120)
                .style("opacity", 1);
        })
        .on("mouseleave.tooltip blur.tooltip", () => {
            tooltip.interrupt()
                .transition()
                .duration(120)
                .style("opacity", 0);
        });
};

window.populateFilters = data => {
    const filters = window.histogramConfig.filters;
    const sizeFilters = window.histogramConfig.sizeFilters;
    const technologyButtons = renderFilterButtons("#filters_screen", filters, "filter-button");
    const sizeButtons = renderFilterButtons("#filters_size", sizeFilters, "filter-button size-filter-button");

    function renderFilterButtons(container, filterOptions, className) {
        return d3.select(container)
            .selectAll("button")
            .data(filterOptions, filter => filter.id)
            .join("button")
            .attr("type", "button")
            .attr("class", className)
            .attr("aria-pressed", filter => String(filter.isActive))
            .classed("is-active", filter => filter.isActive)
            .text(filter => filter.label)
            .on("click", (event, selectedFilter) => {
                if (selectedFilter.id === "all") {
                    filterOptions.forEach(filter => {
                        filter.isActive = filter.id === "all";
                    });
                } else {
                    selectedFilter.isActive = !selectedFilter.isActive;
                    const hasActiveFilter = filterOptions.some(filter =>
                        filter.id !== "all" && filter.isActive
                    );
                    filterOptions.find(filter => filter.id === "all").isActive = !hasActiveFilter;
                }

                updateFilteredData();
            });
    }

    function updateFilteredData() {
        technologyButtons
            .attr("aria-pressed", filter => String(filter.isActive))
            .classed("is-active", filter => filter.isActive);
        sizeButtons
            .attr("aria-pressed", filter => String(filter.isActive))
            .classed("is-active", filter => filter.isActive);

        const selectedTechnologies = filters
            .filter(filter => filter.id !== "all" && filter.isActive)
            .map(filter => filter.id);
        const selectedSizes = sizeFilters
            .filter(filter => filter.id !== "all" && filter.isActive)
            .map(filter => filter.id);
        const filteredData = data.filter(d =>
            (selectedTechnologies.length === 0 || selectedTechnologies.includes(d.screenTech)) &&
            (selectedSizes.length === 0 || selectedSizes.includes(d.screenSize))
        );
        const filterDescription = [
            selectedTechnologies.length > 0 ? selectedTechnologies.join(", ") : null,
            selectedSizes.length > 0 ? selectedSizes.map(size => `${size}"`).join(", ") : null
        ].filter(Boolean).join("; ");

        d3.select("#filter-status")
            .text(filterDescription
                ? `Showing ${filteredData.length.toLocaleString()} TVs (${filterDescription}).`
                : `Showing all ${data.length.toLocaleString()} TVs.`);
        window.updateHistogram(filteredData);
        window.updateScatterplot(filteredData);
    }

    d3.select("#filter-status")
        .text(`Showing all ${data.length.toLocaleString()} TVs.`);
};
