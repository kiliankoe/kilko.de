+++
title = "assert versionOlder"
[taxonomies]
tags = ["nix", "nixpkgs"]
+++

Sometimes you have to override a specific package with something that's newer than what's available in nixpkgs. Often times – if you're me at least – you'll forget having done that later and will keep the override on a then older version than what's available in nixpkgs. In that case, it can make sense to do the following so nix will fail your build once the package advances enough.

```nix
package =
  assert lib.assertMsg (lib.versionOlder pkgs.fosrl-newt.version "1.16.0")
    "nixpkgs now ships fosrl-newt >= 1.16.0 - remove this override";
  pkgs.fosrl-newt.overrideAttrs (old: rec {
    # ...
  });
```
