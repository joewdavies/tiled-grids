# Ships in European seas

How long cargo, tanker, fishing and passenger ships spend in each cell, in 2019 and 2023. It is used by the demo [`examples/demos/ships.html`](https://github.com/eurostat/gridviz/blob/master/examples/demos/ships.html) of gridviz. It comes from:

> This data was downloaded from the EMODnet Portal (https://emodnet.ec.europa.eu/en/). The data originator is Cogea Srl.
>
> This data product was created by EMODnet (https://emodnet.ec.europa.eu/en/), and is owned by the EU and licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) license.

Dataset: [EMODnet Human Activities, Vessel Density](https://emodnet.ec.europa.eu/en/human-activities), annual averages, metadata record `0f2f3ff1-30ef-49e1-96e7-8ca78d58a07c`.

**Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).**

## The columns

The grid is on ETRS89-LAEA (EPSG:3035), with resolutions of 1, 2, 5, 10, 20, 50 and 100 km. The tiling starts at x = -1,000,000 m (the source goes west of x = 0) with 128 cells a tile: some tiles of the frame do not exist, as they would be empty.

| Column         | Ship type | Number of the type in the source |
| -------------- | --------- | -------------------------------- |
| `c19`, `c23`   | Cargo     | 09                               |
| `t19`, `t23`   | Tanker    | 10                               |
| `f19`, `f23`   | Fishing   | 01                               |
| `p19`, `p23`   | Passenger | 08                               |

The values are in hours per km² per month, as a yearly average, for 2019 and 2023. An empty value is a value under 0.005.

The source is based on AIS: ships which do not broadcast their position are not counted, and the reception varies over the years, so that a change between years is not always a change in traffic. 2023 is used and not 2024, the last year of the source, because of what its metadata says: "the AIS data provider experienced a loss of satellite data starting from the month of June" 2024.

## What was changed from the source

-   Only 4 of the 13 ship types of the source, and 2 of its 8 years (2017-2024).
-   The values are rounded to 2 decimals.
-   A cell is left out if the sum of the 4 types is under 0.1 in both years. At 1 km, this keeps between 96% and 99.6% of the total of each column.
-   A cell of a coarser resolution is the sum of its cells of 1 km over its area, land included, computed before the cells are left out. Thus, it is a density like the others, lower along coasts.

## To build it again

`build.mjs` has no dependency. It reads the GeoTIFF files named `vesseldensity_09_2019.tif` and so on, from the ZIP files of the source:

```
https://ows.emodnet-humanactivities.eu/geonetwork/srv/api/records/0f2f3ff1-30ef-49e1-96e7-8ca78d58a07c/attachments/EMODnet_HA_Vessel_Density_09Avg.zip
```

(and `10Avg`, `01Avg`, `08Avg`). Then:

```
node --max-old-space-size=8192 build.mjs <folder of the .tif> . 0.1
```

Without the last argument, it reports the number of cells and the size in bytes that several thresholds would give. For 0.1: 5.6 million cells, and about 170 MB.
