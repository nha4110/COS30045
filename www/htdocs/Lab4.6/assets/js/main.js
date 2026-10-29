const svg = d3.select('.responsive-svg-container')
    .append('svg')
    .attr('viewBox', '0 0 500 800')
    .style('border', '1px solid black');

d3.csv('data/tvBrandCount.csv', row => ({
    brand: row.brand,
    count: +row.count
})).then(data => {
    console.log('Data Array:', data);
    console.log('Data Length:', data.length);
    console.log('Max Count:', d3.max(data, row => row.count));
    console.log('Min Count:', d3.min(data, row => row.count));
    console.log('Extent (Min/Max):', d3.extent(data, row => row.count));

    data.sort((first, second) => second.count - first.count);
    drawBarChart(data);
}).catch(error => {
    console.error('Failed to load TV brand data:', error);
});

const drawBarChart = data => {
    const xScale = d3.scaleLinear()
        .domain([0, 1200])
        .range([0, 400]);

    const yScale = d3.scaleBand()
        .domain(data.map(row => row.brand))
        .range([0, 800])
        .paddingInner(0.2);

    svg.selectAll('rect')
        .data(data)
        .join('rect')
        .attr('class', row => `bar-${row.count}`)
        .attr('x', 0)
        .attr('y', row => yScale(row.brand))
        .attr('width', row => xScale(row.count))
        .attr('height', yScale.bandwidth())
        .attr('fill', 'steelblue');
};
