(() => {
    d3.csv("data/Ex6_TVdata_withStar.csv", row => ({
        brand: row.brand,
        model: row.model,
        screenSize: +row.screenSize,
        screenTech: row.screenTech,
        star: +row.star,
        energyConsumption: +row.energyConsumption
    })).then(data => {
        if (data.length === 0 || data.some(d => !Number.isFinite(d.energyConsumption))) {
            throw new Error("TV data must contain numeric energyConsumption values.");
        }

        console.log("TV energy consumption data:", data);
        window.drawHistogram(data);
    }).catch(error => {
        console.error("Failed to load TV energy consumption data:", error);
    });
})();
