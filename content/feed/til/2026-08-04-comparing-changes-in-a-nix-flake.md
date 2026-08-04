+++
title = "Comparing changes in a nix flake"
[taxonomies]
tags = ["nix", "flake.nix"]
+++

Running `nix flake update` in a project updates you to the latest checkouts of your pins without telling you what actually changed. [dix](https://github.com/manic-systems/dix) is super helpful for that.

```sh
nix develop --profile /tmp/old "git+file://$PWD?ref=HEAD" -c true
nix develop --profile /tmp/new . -c true
dix /tmp/old /tmp/new
```
