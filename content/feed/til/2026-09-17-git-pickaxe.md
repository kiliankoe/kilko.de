+++
title = "git pickaxe"
[taxonomies]
tags = ["git"]
+++

Sometimes you want to find out when a specific term was added or removed that might not be directly mentioned in a commit message. This is where `git log -S <pattern>`, apparently also referred to as "git pickaxe" comes in useful.

```sh
$ git log -S ZLIB_BUF_MAX --oneline
e01503b zlib: allow feeding more than 4GB in one go
ef49a7a zlib: zlib can only process 4GB at a time
```

via [Git - Searching](https://git-scm.com/book/en/v2/Git-Tools-Searching#_git_log_searching), example also stolen directly from there
