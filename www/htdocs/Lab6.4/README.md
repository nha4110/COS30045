# Exercise 6.4: TV Scatterplot Tooltips

This folder contains an interactive histogram and a scatterplot of TV energy
consumption by star rating. Scatterplot points are color-coded by screen
technology and show a screen-size tooltip on hover or keyboard focus. Use the
screen technology and screen size buttons to filter both charts; selections can
be combined.

## Structure

- `css/` contains the page and visualization styles, including filter buttons.
- `data/Ex6_TVdata_withStar.csv` contains the TV dataset.
- `js/` contains the data loader, shared chart configuration, filter interactions,
  histogram, and scatterplot.
- `index.html` loads the styles and scripts in dependency order.

Open `index.html` through a local web server so D3 can load the CSV file.
