# Exercise 7.1 — Incarceration, on the map

Open `index.html` through a local web server so the page can load `data/countries-110m.json`.

The page is an original teaching redraw based on the Pew Research Center article and map shared for this exercise. It includes:

- A world choropleth with a map/country-table/Table 1 view switch, region zoom controls, and a country list for the selected region.
- Pew's nine explicit country rates and clearly marked illustrative mock values for other countries. Mock values approximate the reference map's broad color pattern; they are not official statistics and must not be used as evidence. Antarctica has no national rate in the redraw.
- The supplied 2009–2019 U.S. adult correctional-population table.
- Concise answers to the six visualisation-design questions.

The map uses country boundaries from the `world-atlas` TopoJSON project, based on Natural Earth map data, rendered with a Natural Earth projection that wraps the dateline and clips paths to the world frame. Clicking a country zooms to its region; clicking map water resets the world view. The Pew graphic itself is not copied. The nine source values in the international map are from figures quoted by Pew in 2021; source years vary. Other map values are mock data and visibly labelled as such. The U.S. international rate (639) uses all ages, while the U.S. historical rate (810) uses adults ages 18 and older.

## Source

- [Pew Research Center: America’s incarceration rate falls to lowest level since 1995](https://www.pewresearch.org/short-reads/2021/08/16/americas-incarceration-rate-lowest-since-1995/)
