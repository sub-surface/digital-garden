---
title: "CCMC ISWA System"
source: "https://ccmc.gsfc.nasa.gov/tools/ISWA/#iswa-web-services"
author:
published:
created: 2026-02-10
description: "Integrated Space Weather Analysis system"
tags:
  - "clippings"
---
Last Updated: 06/03/2025

https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/
Go to ISWA Data Tree
https://iswa.ccmc.gsfc.nasa.gov/iswa_data_tree/

### About

The CCMC Integrated Space Weather Analysis (ISWA) system is a ready-to-use, adaptable, and user-configurable web-based platform that distributes real-time space weather information. It integrates predictions from cutting-edge models and concurrent space environment information, including low-latency data. ISWA offers continuous access to **advanced simulation products generated at the CCMC** and other public sources. This robust software tool serves as an unparalleled decision-making resource, enabling the assessment of current and anticipated space weather impacts on NASA's human and robotic missions.

[

List of Real-time models with results on ISWA

➞

](https://ccmc.gsfc.nasa.gov/models/?services=Continuous%2FRT+Run+%28ISWA+data+tree%29&services=Continuous%2FRT+Run+%28ISWA+layout%29)

The near real-time simulation outputs and derived real-time data products displayed on ISWA should be **considered only as prototyping quality and in research context**.

### Latest News

- See Latest ' [change-log](https://ccmc.gsfc.nasa.gov/tools/ISWA/change-log/) ' for list of updates and changes made to the ISWA webapp, API, etc.
- **June 2024**: Deployed a new version of the [ISWA web app](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/) at the CCMC. The new version includes the following features:
	- Global time sync of all cygnets
	- Save layouts (in JSON files)
	- Snap-2-Grid
	- Search capability

### Publication Policy

For tracking purposes for our government sponsors, we ask that you notify the CCMC whenever you use any CCMC tools/software systems in any scientific publications and/or presentations. Follow the steps on the [**publication submission page**](https://ccmc.gsfc.nasa.gov/publication-submissions/)

See our full [publication policy](https://ccmc.gsfc.nasa.gov/publication-policy/) for a sample 'acknowledgement statement' to be included in your publication.

### ISWA Cygnets

The [ISWA cygnet catalog](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/) includes a wide array of space weather analysis products. Simply select the cygnets of interest to create your own custom layout. Click the 'Save Layout' option to save your layout in a JSON file. To get back to the same layout, click the 'Load Layout' option and select the previously saved JSON file to reload it. You can share your layouts with others by sending them the corresponding JSON files.

![](https://ccmc.gsfc.nasa.gov/static/images/ISWA_Cygnets.png)

### ISWA Data Tree

All files ingested into ISWA are also publicly accessible via the [iswa-data-tree](https://iswa.ccmc.gsfc.nasa.gov/iswa_data_tree/) URL.

### ISWA Web Services

#### Numerical Time Series (HAPI)

All 1-D numerical time-series data ingested into ISWA are accessible via [ISWA HAPI](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/hapi/). Visit [https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/hapi/](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/hapi/) for full details. DataStreamServlet has been replaced by ISWA HAPI.

*Examples:*

[https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/hapi/catalog](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/hapi/catalog)

[https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/hapi/info?id=goesp\_mag\_p1m](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/hapi/info?id=goesp_mag_p1m)

[https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/hapi/data?id=goesp\_mag\_p1m&time.min=2018-04-25T00:00:00.0Z&time.max=2018-04-26T00:00:00.0Z&format=json](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/hapi/data?id=goesp_mag_p1m&time.min=2018-04-25T00:00:00.0Z&time.max=2018-04-26T00:00:00.0Z&format=json)

#### Datafeed Information

Provides description and date range for specific data feed.

```
https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/
DataInfoServlet?id=DATAID
```

**dataID**  =  [unique data identifier](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/health/datafeed.jsp) used to select a specific ISWA data feed.

*Example:*

[https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/DataInfoServlet?id=309](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/DataInfoServlet?id=309)

#### Files between Dates

```
https://iswa.gsfc.nasa.gov/IswaSystemWebApp/FilesInRangeServlet?
dataID=DATAID&
time.min=YYYY-MM-DDTHH:mm:SS&
time.max=YYYY-MM-DDTHH:mm:SS
```

**dataID**  =  [unique data identifier](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/health/datafeed.jsp) used to select a specific ISWA data feed.

**time.min** = UTC timestamp format: YYYY-MM-DDTHH:mm:SS

**time.max** = UTC timestamp format: YYYY-MM-DDTHH:mm:SS

*Example:*

[https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/FilesInRangeServlet?dataID=309&time.min=2022-10-15T00:00:00.0&time.max=2022-10-16T00:00:00.0](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/FilesInRangeServlet?dataID=309&time.min=2022-10-15T00:00:00.0&time.max=2022-10-16T00:00:00.0)

```
https://iswa.gsfc.nasa.gov/IswaSystemWebApp/RecentFilesServlet?
dataID=DATAID&
n=FILECOUNT
```

**dataID**  =  [unique data identifier](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/health/datafeed.jsp) used to select a specific ISWA data feed.

**n** = number of files

*Example:*

[https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/RecentFilesServlet?dataID=309&n=5](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/RecentFilesServlet?dataID=309&n=5)

#### Nearest File

```
https://iswa.gsfc.nasa.gov/IswaSystemWebApp/NearestFilesServlet?
dataID=DATAID&
timestamp=YYYY-MM-DD HH:mm:ss
```

**dataID**  =  [unique data identifier](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/health/datafeed.jsp) used to select a specific ISWA data feed.

**timestamp** = UTC timestamp in YYYY-MM-DD HH:mm:ss format

*Example:*

[https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/NearestFilesServlet?dataID=309&timestamp=2022-10-01 2012:30:00](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/NearestFilesServlet?dataID=309&timestamp=2022-10-05%2012:30:00)

#### File Redirect

```
https://iswa.gsfc.nasa.gov/IswaSystemWebApp/FileRedirect?
dataID=DATAID&timestamp=YYYY-MM-DDTHH:mm:ss&search=nearest
```

**dataID**  =  [unique data identifier](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/health/datafeed.jsp) used to select a specific ISWA data feed.

**timestamp** = UTC timestamp in YYYY-MM-DDTHH:mm:ss format

- if timestamp is not specified, return the latest available file.

**search** = \[nearest, lessThanOrEqualTo, lessThan, greaterThanOrEqualTo, greaterThan, equalTo\]

- nearest (default): find nearest file to the requested timestamp
- lessThanOrEqualTo: find the nearest file less than or equal to the requested timestamp
- lessThan: find the nearest file less than timestamp
- greaterThanOrEqualTo: find the nearest file greater than or equal to the requested timestamp
- greaterThan: find the nearest file greater than requested timestamp
- equalTo: find the file equal to the requested timestamp

**note**: Curl requires -L option to work FileRedirect service.

*Examples:*

[https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/FileRedirect?dataID=309](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/FileRedirect?dataID=309)

[https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/FileRedirect?dataID=309&timestamp=2025-03-03T12:20:00](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/FileRedirect?dataID=309&timestamp=2025-03-03T12:20:00)

[https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/FileRedirect?dataID=309&timestamp=2025-03-03T12:20:00&search=lessThanOrEqualTo](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/FileRedirect?dataID=309&timestamp=2025-03-03T12:20:00&search=lessThanOrEqualTo)

[https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/FileRedirect?dataID=309&timestamp=2025-03-03T12:20:00&search=greaterThanOrEqualTo](https://iswa.ccmc.gsfc.nasa.gov/IswaSystemWebApp/FileRedirect?dataID=309&timestamp=2025-03-03T12:20:00&search=greaterThanOrEqualTo)