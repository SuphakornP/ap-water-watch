# Thailand administrative boundaries

This layer contains generalized province boundaries only. It does not show flood extent, catchments, project land boundaries, or hydrological connectivity. Administrative features in the selected source have `validOn` 22 January 2022; their currency has not been independently re-surveyed.

Source: Royal Thai Survey Department, distributed by OCHA through the [Humanitarian Data Exchange](https://data.humdata.org/dataset/cod-ab-tha). Upstream conversion: [prasertcbs/thailand_gis](https://github.com/prasertcbs/thailand_gis), commit `1926690c14851700ad517522a279b0248e3bbbc6`, file `tha_adm1/tha_adm1_province.json`.

The underlying HDX dataset is licensed under [Creative Commons Attribution for Intergovernmental Organisations 3.0 (CC BY-IGO 3.0)](https://creativecommons.org/licenses/by/3.0/igo/legalcode), verified from the [HDX package metadata](https://data.humdata.org/api/3/action/package_show?id=cod-ab-tha) on 4 October 2026. The GitHub repository has no separate license file; this attribution follows its explicitly identified underlying geographic dataset.

AP Water Watch adaptation: decode the existing generalized TopoJSON to GeoJSON, retain province identifiers and Thai/English names, round coordinates to six decimal places, normalize polygon winding, and derive bounding boxes. No additional boundary simplification, flood modelling, or coordinate reprojection was applied. See `public/gis/thailand-provinces.provenance.json` for the pinned input, transformations, checksums and validation.

Attribution for the map: **Royal Thai Survey Department / OCHA / HDX · prasertcbs · CC BY-IGO 3.0 · adapted**. Link the source and license from the map attribution or data-source panel. No endorsement by the source organizations is implied.
