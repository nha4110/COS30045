# Exercise 3: Communicating Data Insights - Television Energy Consumption Story

## Project Overview
This project presents an empirical data story on household television energy consumption in the Australian market. Built for **Exercise 3** (COS30045 Data Visualisation), this web application combines clean front-end architecture (HTML5, CSS, vanilla JavaScript) with data wrangling and charts processed in **KNIME Analytics Platform**.

---

## File and Folder Structure

```text
/
├── index.html                       # Home page featuring executive summary and interactive FAQ accordion
├── televisions.html                 # Main Data Story page displaying 6 visualisations and calculator
├── about.html                       # Project methodology, data governance, and ethics page
├── assets/
│   ├── css/
│   │   └── styles.css               # External stylesheet styled around PowerIcon.png green palette
│   ├── js/
│   │   └── main.js                  # Vanilla JS file handling accordions and calculator logic
│   └── img/
│       ├── PowerIcon.png            # Persistent header brand logo
│       ├── chart_brand_bar.png      # Bar chart: Available models per brand
│       ├── chart_brand_pie.png      # Pie chart: Brand market share proportion
│       ├── chart_size_histogram.png # Histogram: Screen size frequency distribution
│       ├── chart_size_scatter.png   # Scatter plot: Screen size vs. annual energy consumption
│       ├── chart_size_category_bar.png # Bar chart: Mean energy by size tier (Small/Medium/Large)
│       └── chart_tech_pivot_bar.png # Grouped bar chart: Screen technology vs. size tier energy draw
└── README.md                        # Documentation, Data Story guidelines, and AI declaration