# Ships in European seas

How long ships of 13 types spend in each cell, for each year from 2017 to 2024. It is used by the demo [`examples/demos/ships.html`](https://github.com/eurostat/gridviz/blob/master/examples/demos/ships.html) of gridviz. It comes from:

> This data was downloaded from the EMODnet Portal (https://emodnet.ec.europa.eu/en/). The data originator is Cogea Srl.
>
> This data product was created by EMODnet (https://emodnet.ec.europa.eu/en/), and is owned by the EU and licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) license.

Dataset: [EMODnet Human Activities, Vessel Density](https://emodnet.ec.europa.eu/en/human-activities), annual averages, metadata record `0f2f3ff1-30ef-49e1-96e7-8ca78d58a07c`.

**Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).**

## The folders

The grid is on ETRS89-LAEA (EPSG:3035). The tiling starts at x = -1,000,000 m (the source goes west of x = 0) with 128 cells a tile: some tiles of the frame do not exist, as they would be empty.

-   `<year>/<resolution>m/`, for the years 2017 to 2024 and the resolutions 1000, 2000, 5000, 10000, 20000, 50000 and 100000: a column per ship type.
-   `change/<resolution>m/`, from 2000: for comparing the years, a column per year for all types and for the 4 main ones, such as `a23` (all types), `c23`, `t23`, `f23` and `p23`.

A year is in its own folder so that a map loads only the year it shows: a table of all the types and years would have 104 columns.

| Column | Ship type                                    | Number of the type in the source |
| ------ | -------------------------------------------- | -------------------------------- |
| `o`    | Other                                        | 00                               |
| `f`    | Fishing                                      | 01                               |
| `s`    | Service                                      | 02                               |
| `d`    | Dredging or underwater operations            | 03                               |
| `a`    | Sailing                                      | 04                               |
| `l`    | Pleasure craft                               | 05                               |
| `h`    | High speed craft                             | 06                               |
| `u`    | Tug and towing                               | 07                               |
| `p`    | Passenger                                    | 08                               |
| `c`    | Cargo                                        | 09                               |
| `t`    | Tanker                                       | 10                               |
| `m`    | Military and law enforcement                 | 11                               |
| `n`    | Unknown                                      | 12                               |

The values are in hours per km² per month, as a yearly average. An empty value is a value under 0.05.

The source is based on AIS: ships which do not broadcast their position are not counted, and the reception varies over the years, so that a change between years is not always a change in traffic. The total of all types grows by 45% from 2017 to 2023. For 2024, the metadata of the source says: "the AIS data provider experienced a loss of satellite data starting from the month of June".

## What was changed from the source

-   The values are rounded: to 1 decimal under 10, and to 3 digits above.
-   A cell is left out of a year if the sum of the 13 types is under 0.1 that year, and out of `change/` if it is under 0.1 every year. At 1 km, this kept between 91% and 99% of the total, for the 5 types and 3 years that were checked.
-   A cell of a coarser resolution is the sum of its cells of 1 km over its area, land included, computed before the cells are left out. Thus, it is a density like the others, lower along coasts.
-   In `change/`, `a` is computed before rounding, so it can differ slightly from the sum of the types in a year's folder.

## To build it again

`build.mjs` has no dependency. It reads the GeoTIFF files named `vesseldensity_09_2019.tif` and so on, from the ZIP files of the source, one for each type number:

```
https://ows.emodnet-humanactivities.eu/geonetwork/srv/api/records/0f2f3ff1-30ef-49e1-96e7-8ca78d58a07c/attachments/EMODnet_HA_Vessel_Density_09Avg.zip
```

Then:

```
node --max-old-space-size=8192 build.mjs <folder of the .tif> .
```

It gives about 14,800 files and 1.2 GB: about 130 MB a year, and 144 MB for `change/`.
