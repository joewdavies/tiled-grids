# tiled-grids
A collection of tiled gridded datasets in CSV format, generated using [GridTiler](https://github.com/eurostat/gridtiler/), to be used with [gridviz](https://github.com/eurostat/gridviz/).

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
