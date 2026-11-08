# Road Injury Explorer

Responsive D3.js dashboard for team-prepared BITRE data on hospitalised road-crash injuries in Australia (2011–2021). The visualisation code reads the supplied CSV records; it does not generate or impute observations.

## Run locally

The three team-prepared files are expected in `data/`:

- `national_road_user_by_year.csv`
- `state_road_user_by_year.csv`
- `first_nations_road_user_by_year.csv`

Serve this folder over HTTP, such as through the team's local web server. Browsers commonly block CSV loading when the page is opened with `file://`. D3.js v7 is loaded from jsDelivr, so browser access to that CDN is also required.

## CSV fields

The supplied files use long-form records:

```csv
year,road_user,injuries
2011,Bus occupant,214
```

The state file also has a `state` and `suppressed` field; the First Nations file has `first_nations_status` and `suppressed`. A suppression flag of `1` means the associated count is unknown. Suppressed, blank, non-numeric and explicit missing markers are excluded, never converted to zero. The parser also accepts common alternate names for year, count, user and jurisdiction fields, as well as wide tables with one count column per road-user group.

The three trend and comparison views are:

1. A national annual total line for all available years. Choosing a road user filters that line; the 2012 Victoria Emergency Department and 2017 NSW reporting-criteria changes are annotated.
2. A descending road-user comparison for the selected year. Choosing a jurisdiction switches this view to the state file.
3. A state comparison and First Nations trend. State and First Nations subtotals can exclude suppressed categories; partial values are identified by color and explained in chart tooltips.

“Car occupant” combines national and First Nations car driver/passenger categories to match the combined state category. Heavy-transport driver/passenger categories are harmonised similarly.

## Interpretation and attribution

Source observations are from the team-prepared BITRE CSV files. Confirm the original BITRE definitions, coverage, suppression rules and data-governance guidance before drawing conclusions or republishing results.

- Counts are not population-adjusted rates. State bars show raw hospitalisation counts and must not be interpreted as per-capita comparisons.
- The First Nations view should be interpreted with respect for Indigenous data sovereignty and the context in which the source data was collected. Missing data is not estimated.
- Where some values are suppressed, bars and trend points show known subtotals, not complete totals. Tooltips identify the number of omitted records.
- Reporting-criteria changes are administrative structural breaks; comparisons across them may not be directly equivalent.
