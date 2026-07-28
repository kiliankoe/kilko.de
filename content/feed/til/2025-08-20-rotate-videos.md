+++
title = "Rotate videos"
[taxonomies]
tags = ["ffmpeg"]
+++

Rotate videos using ffmpeg by transposing them. The command to do so is:

```sh
$ ffmpeg -i input.mp4 -vf "transpose=1" output.mp4
```

The possible rotations are the following.

```
0 = 90CounterCLockwise and Vertical Flip (default)
1 = 90Clockwise
2 = 90CounterClockwise
3 = 90Clockwise and Vertical Flip
```

Use `-vf "transpose=2,transpose=2"` for 180 degrees.

Credits go to [stackoverflow.com/a/9570992/1843020](https://stackoverflow.com/a/9570992/1843020)
