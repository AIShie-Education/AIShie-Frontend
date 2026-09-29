#!/bin/sh
# Packs a build into the tarball deploy/aishie-web-deploy takes, and a
# release carries:
#
#   scripts/pack-dist.sh dist aishie-web.tar.gz
#
# Files and directories only, the build's own and nothing a machine adds. With
# GNU tar (CI), the same build packs to the same bytes: sorted, owned by
# nobody in particular, and dated by SOURCE_DATE_EPOCH, or the commit.
set -eu

src=${1:-}
out=${2:-}
if [ -z "$src" ] || [ -z "$out" ]; then
  echo "usage: scripts/pack-dist.sh DIST OUT.tar.gz" >&2
  exit 2
fi
[ -f "$src/index.html" ] || { echo "pack-dist: $src/index.html is missing: build first (npm run build)" >&2; exit 1; }
# The server takes nothing else, so this is said here, where it can be fixed.
odd=$(find "$src" ! -type f ! -type d | head -n 3)
[ -z "$odd" ] || { echo "pack-dist: $src holds something other than files and directories: $odd" >&2; exit 1; }

# macOS's tar would add ._ files for extended attributes.
COPYFILE_DISABLE=1
export COPYFILE_DISABLE
if tar --version 2>/dev/null | grep -q 'GNU tar'; then
  when=${SOURCE_DATE_EPOCH:-$(git log -1 --format=%ct 2>/dev/null || date +%s)}
  tar --sort=name --owner=0 --group=0 --numeric-owner --mode='u+rwX,go=rX' --mtime="@$when" \
    -C "$src" -cf - . | gzip -9n > "$out"
else
  tar --uid 0 --gid 0 --uname root --gname root --no-xattrs -C "$src" -cf - . | gzip -9n > "$out"
fi
echo "packed $src into $out ($(wc -c < "$out" | tr -d ' ') bytes)"
