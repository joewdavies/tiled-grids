# tiled-grids
A collection of tiled gridded datasets in CSV format, generated using [GridTiler](https://github.com/eurostat/gridtiler/), to be used with [gridviz](https://github.com/eurostat/gridviz/).

## Datasets

-   [`vessels`](vessels/readme.md): hours of 13 ship types in European seas, 2017 to 2024, at 1 to 100 km, from EMODnet (CC BY 4.0). Tiled with its own script, not GridTiler. Used by the demo [Ships of Europe](https://eurostat.github.io/gridviz/examples/demos/ships.html).

## Tiling a grid

Install [GridTiler](https://www.npmjs.com/package/gridtiler):

```
npm install -g gridtiler@1.3.0
```

For example, these commands produce tiled grid at various resolutions from 1km to 100km from a single input 1km resolution dataset `myGrid`:

```
gridtiler -i myGrid.csv -r 1000 -a 1 -o 1000m/
gridtiler -i myGrid.csv -r 1000 -a 2 -o 2000m/
gridtiler -i myGrid.csv -r 1000 -a 5 -o 5000m/
gridtiler -i myGrid.csv -r 1000 -a 10 -o 10000m/
gridtiler -i myGrid.csv -r 1000 -a 20 -o 20000m/
gridtiler -i myGrid.csv -r 1000 -a 50 -o 50000m/
gridtiler -i myGrid.csv -r 1000 -a 100 -o 100000m/
```
