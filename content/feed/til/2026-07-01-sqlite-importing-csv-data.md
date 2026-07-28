+++
title = "Importing CSV data into SQLite"
[taxonomies]
tags = ["sqlite", "csv"]
+++

Creating a table from CSV data is very straightforward.
```sh
sqlite3 file.sqlite
sqlite> .mode csv
sqlite> .import data.csv tablename
sqlite> .exit
```
That's it.
