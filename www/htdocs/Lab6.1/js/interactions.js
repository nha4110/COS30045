window.attachHistogramInteractions = selection => {
    selection
        .on("pointerenter focus", function () {
            d3.select(this).attr("fill", window.histogramConfig.highlightColor);
        })
        .on("pointerleave blur", function () {
            d3.select(this).attr("fill", window.histogramConfig.barColor);
        });
};
