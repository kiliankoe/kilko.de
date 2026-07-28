+++
title = "Youtube RSS Feeds"
[taxonomies]
tags = ["rss", "youtube"]
+++

Any channel can be subscribed to via RSS by using the following URL format:

```
https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
```

The easiest way to get this is to just let your RSS Reader subscribe to the channel's main URL, it will usually figure out the feed location.

The default feed includes _all_ videos however, this includes live videos and shorts, there's a few different playlist feeds that can be used to filter these out, instead of using the `channel_id` parameter, use the `playlist_id` parameter like so:

```
https://www.youtube.com/feeds/videos.xml?playlist_id=PLAYLIST_ID
```

The playlist ID is the same as the channel ID (which includes the `UC` prefix), but with a different prefix:

- All videos: `UU` + rest of channel ID
- Standard videos: `UULF` + rest of channel ID
- Shorts: `UUSH` + rest of channel ID
- Livestreams: `UULV` + rest of channel ID

For example, the feed URL for stuffmadehere's channel would be transformed like this to get only standard videos:

```
https://www.youtube.com/feeds/videos.xml?channel_id=UCj1VqrHhDte54oLgPG4xpuQ
->
https://www.youtube.com/feeds/videos.xml?playlist_id=UULFj1VqrHhDte54oLgPG4xpuQ
```

Kudos to [github.com/FreshRSS/Extensions/issues/234#issuecomment-2738509387](https://github.com/FreshRSS/Extensions/issues/234#issuecomment-2738509387)
