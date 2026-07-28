+++
title = "Create video from image and audio"
[taxonomies]
tags = ["ffmpeg"]
+++

Technically something simple along the following lines would work.

```sh
ffmpeg -i image.png -i audio.mp3 video.mp4
```

This does however create a file with just a single frame, which doesn't really work on YouTube for example. The following creates a video with repeating frames.

```js
ffmpeg -r 1 -loop 1 -i image.png -i audio.mp3 -acodec copy -shortest -vf scale=1280:720 video.mp4
```

Credits go to [superuser.com/a/1041820/236423](https://superuser.com/a/1041820/236423)
