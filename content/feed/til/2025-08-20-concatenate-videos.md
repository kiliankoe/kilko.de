+++
title = "Concatenate videos"
[taxonomies]
tags = ["ffmpeg"]
+++

Concating several video files with ffmpeg is very straightforward if they all share the same container and codec.
Add all input files to a text file listing their relative or absolute paths.
```sh
file 'file1.mp4'
file 'file2.mp4'
...
```
Run the following.
```sh
$ ffmpeg -f concat -safe 0 -i input.txt -c copy output.mp4
```
`-safe 0` can be omitted if the filepaths are relative.
