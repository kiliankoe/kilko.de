+++
title = "Simulating a scan"
[taxonomies]
tags = ["imagemagick"]
+++

Fake a printed, hand-signed and scanned document using imagemagick. Beat the bureucracy.
```Bash
$ convert input.pdf -colorspace gray \( +clone -blur 0x0.1 \) +swap -compose divide -composite -linear-stretch 5%x0% -rotate 0.5 scan.pdf
```
Documentation on using `-blur` can be found [here](https://www.imagemagick.org/Usage/blur/).

Credits go to [tex.stackexchange.com/a/94541](https://tex.stackexchange.com/a/94541)
