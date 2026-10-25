# Exercise 6.2: Histogram Filters

This folder contains an interactive D3 histogram of TV energy consumption. Use
the screen technology buttons to compare LCD, LED, and OLED televisions. You
can select multiple technologies, or choose **All** to reset the chart.

## Structure

- `css/` contains the page and visualization styles, including filter buttons.
- `data/Ex6_TVdata_withStar.csv` contains the TV dataset.
- `js/` contains the data loader, shared chart configuration, filter interactions,
  and histogram.
- `index.html` loads the styles and scripts in dependency order.

Open `index.html` through a local web server so D3 can load the CSV file.
