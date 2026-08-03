+++
title = "Replacing my blog with a general activity feed"
path = "blog/replacing-my-blog-with-a-general-activity-feed"
[taxonomies]
tags = ["meta"]
[extra]
# social = ["https://chaos.social/@kilian/…", "https://bsky.app/profile/kilian.io/post/…"]
+++

I'm well aware of the common trope of only blogging about migrating the existing blog to a new framework or setup and I know I've done so way more times than having written actual posts in the post, but hey, I guess it's time for another one of those posts.

!['here we go again' screenshot from GTA San Andreas](/img/here_we_go_again.jpg)

I'm not an active blogger, I'm not very active on social media either, but I do like sharing some stuff publicly and being able to point at it or having other people interact. The new idea is to just combine all the things into one more or less full canonical feed of my online activity. That now exists as [kilko.de/feed](https://kilko.de/feed).

This site runs on GitHub pages with an action that periodically checks for new content to import and commits it directly back to the repo. My feed consists of [blog posts](https://kilko.de/blog) like this one, posts on [Mastodon](https://kilko.de/feed/mastodon) and [Bluesky](https://kilko.de/feed/bluesky) — potentially even deduplicating posts I've sent on both networks —, [short form TIL posts](https://kilko.de/feed/til), [talks or presentations I give](https://kilko.de/feed/talks/), [books I read](https://kilko.de/feed/books) and track on [bookwyrm.social](https://bookwyrm.social), [movies I watched](https://kilko.de/feed/movies) and track on [Letterboxd](https://letterboxd.com), and [repos I create or open-source](https://kilko.de/feed/github) on GitHub.

The list is bound to grow or change a bit, but I think this is super cool already. It's a way more accurate representation of my public online activity than any of the sources by themselves and also somewhat of a backup of this kind of data with stable URLs that I can point to. I like that a lot. Each type has its own RSS feed, but the general feed also has one that contains everything.

Also, the page is now built with zola, the old blog used hugo. Zola is cool.
