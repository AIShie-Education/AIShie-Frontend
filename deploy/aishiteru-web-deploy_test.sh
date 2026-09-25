#!/usr/bin/env bash
# aishiteru-web-deploy against a root of its own in a temporary directory:
# builds packed as CI packs them, the same ID twice, going back, the releases
# it keeps, and archives made to get out of the root or to fill the disk.
#
#   deploy/aishiteru-web-deploy_test.sh
#
# Needs python3, to make the archives tar itself will not.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/.." && pwd)
work=$(mktemp -d)
trap 'unlock "$work"; rm -rf "$work"' EXIT

failed=0
fail() { echo "FAIL $case: $*" >&2; failed=1; }

# setup CASE: a fresh root as deploy/setup-web.sh leaves it, serving the
# placeholder, the default limits, and a temporary directory of its own.
setup() {
  case=$1
  export AISHITERU_WEB_ROOT=$work/$case/root TMPDIR=$work/$case/tmp
  ROOT=$AISHITERU_WEB_ROOT
  unlock "$work/$case"
  rm -rf "${work:?}/$case"
  mkdir -p "$ROOT/releases/placeholder" "$TMPDIR"
  echo placeholder > "$ROOT/releases/placeholder/index.html"
  ln -s releases/placeholder "$ROOT/current"
  unset AISHITERU_WEB_MAX_BYTES AISHITERU_WEB_MAX_UNPACKED AISHITERU_WEB_MAX_ENTRIES AISHITERU_WEB_LOCK_WAIT \
    AISHITERU_WEB_READ_WAIT AISHITERU_WEB_FLOCK SSH_CONNECTION
}
# unlock DIR: whatever modes a test left in it, removable again.
unlock() { if [ -d "$1" ]; then chmod -R u+rwX "$1" 2>/dev/null || true; fi; }
# run ARGS < INPUT: the script, its output in $out.
out=
run() {
  local rc=0
  "$here/aishiteru-web-deploy" "$@" > "$work/out" 2>&1 || rc=$?
  out=$(cat "$work/out")
  return "$rc"
}
served() { local l; l=$(readlink "$ROOT/current"); echo "${l##*/}"; }
kept() { find "$ROOT/releases" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -exec basename {} \; | sort | paste -sd ' ' -; }
# Nothing half done left behind: not in the root, and not in the temporary
# directory the upload went to.
clean() {
  local left
  left=$(find "$ROOT" -maxdepth 2 \( -name '.*.tmp' -o -name '.incoming.*' -o -name '.current.new' -o -name '.lock.d' \))
  [ -z "$left" ] || fail "left behind: $left"
  left=$(find "$TMPDIR" -mindepth 1 -maxdepth 1)
  [ -z "$left" ] || fail "left in TMPDIR: $left"
}

# build NAME TEXT: a build in $work/builds/NAME, packed as CI packs it.
build() {
  local d=$work/builds/$1
  mkdir -p "$d/assets"
  printf '<!doctype html><script type="module" src="/assets/index-%s.js"></script>%s\n' "$1" "$2" > "$d/index.html"
  echo "console.log('$2')" > "$d/assets/index-$1.js"
  echo '<svg/>' > "$d/favicon.svg"
  "$repo/scripts/pack-dist.sh" "$d" "$work/builds/$1.tar.gz" > /dev/null
}

# evil OUT ENTRY...: an archive tar would not make, one entry per argument:
# TYPE:NAME[:TARGET[:MODE]] with TYPE f (a file), d, l (symlink), h (hard
# link), c (a device), p (a fifo); z:NAME:BYTES is a file of that many zeros,
# and u:NAME a file whose owner has names that would pass for the columns of
# a listing.
evil() {
  python3 - "$@" << 'EOF'
import io, sys, tarfile
out, specs = sys.argv[1], sys.argv[2:]
with tarfile.open(out, 'w:gz', format=tarfile.GNU_FORMAT) as t:
    for spec in specs:
        kind, name, *rest = spec.split(':')
        name = name.replace('\\n', '\n')
        ti = tarfile.TarInfo(name)
        ti.mode = int(rest[1], 8) if len(rest) > 1 else 0o644
        data = None
        if kind == 'f':
            data = (rest[0] if rest and rest[0] else 'x').encode()
        elif kind == 'z':
            data = bytes(int(rest[0]))
        elif kind == 'u':
            data = b'x'
            ti.uname, ti.gname = 'x 5 2026-01-01', '9 99999999999'
        elif kind == 'd':
            ti.type = tarfile.DIRTYPE
            ti.mode = int(rest[1], 8) if len(rest) > 1 else 0o755
        elif kind == 'l':
            ti.type, ti.linkname = tarfile.SYMTYPE, rest[0]
        elif kind == 'h':
            ti.type, ti.linkname = tarfile.LNKTYPE, rest[0]
        elif kind == 'c':
            ti.type, ti.devmajor, ti.devminor = tarfile.CHRTYPE, 1, 3
        elif kind == 'p':
            ti.type = tarfile.FIFOTYPE
        if data is not None:
            ti.size = len(data)
            t.addfile(ti, io.BytesIO(data))
        else:
            t.addfile(ti)
EOF
}

build a "Build A"
build b "Build B"
build a2 "Build A, rebuilt differently"

# Anything that is not a command and a release ID is refused before anything
# runs, whether it comes as arguments or as SSH's one argument.
setup refused
long=$(printf 'a%.0s' $(seq 65))
for bad in "" "activate" "list x" "activate a b" "a b" ".hidden" "-rf" "a/b" "../x" "x;id" "x\$(id)" "x\`id\`" "x|id" "x&id" "x'y" "a*" "$long" "activate .x" "activate -x" $'a\nb'; do
  if run "$bad" < "$work/builds/a.tar.gz"; then fail "accepted «${bad}»"; fi
  [ "$(served)" = placeholder ] || fail "«${bad}» changed what is served"
  [ "$(kept)" = placeholder ] || fail "«${bad}» made a release: $(kept)"
done
if run activate "a b" < /dev/null; then fail "took two IDs"; fi

# A first deploy: unpacked, readable by anyone, served, and logged.
setup first
touch "$work/before"
run abc1234 < "$work/builds/a.tar.gz" || fail "exit $?: $out"
[ "$(served)" = abc1234 ] || fail "serving $(served)"
[[ $(readlink "$ROOT/current") == releases/abc1234 ]] || fail "current is $(readlink "$ROOT/current"), not a relative link"
grep -q 'Build A' "$ROOT/current/index.html" || fail "index.html is not build A's"
[ -f "$ROOT/current/assets/index-a.js" ] || fail "no assets"
[ -z "$(find "$ROOT/releases/abc1234" -type f ! -perm 644)" ] || fail "files not 644: $(find "$ROOT/releases/abc1234" -type f ! -perm 644)"
[ -z "$(find "$ROOT/releases/abc1234" -type d ! -perm 755)" ] || fail "directories not 755"
# The files' times are the deploy's, not the archive's: browsers compare them.
[ "$ROOT/current/index.html" -nt "$work/before" ] || fail "index.html kept the archive's time"
grep -q "deployed release abc1234" <<< "$out" || fail "said: $out"
grep -q "deployed abc1234 (before: placeholder)" "$ROOT/deploy.log" || fail "log: $(cat "$ROOT/deploy.log")"
clean

# The same ID and the same build again: nothing to do.
run abc1234 < "$work/builds/a.tar.gz" || fail "the same build again failed: $out"
grep -q "nothing to do" <<< "$out" || fail "said: $out"
[ "$(served)" = abc1234 ] || fail "serving $(served)"
clean

# The same ID with another build: refused, and the one kept is left alone.
if run abc1234 < "$work/builds/a2.tar.gz"; then fail "replaced abc1234 with another build"; fi
grep -q "with other files: not replaced" <<< "$out" || fail "said: $out"
grep -q 'Build A$' "$ROOT/releases/abc1234/index.html" || fail "abc1234 was changed"
clean

# A second build, then back to the first, three ways: activate, activate as
# SSH hands it over, and the first build deployed again under its ID.
run def5678 < "$work/builds/b.tar.gz" || fail "exit $?: $out"
[ "$(served)" = def5678 ] || fail "serving $(served)"
run activate abc1234 < /dev/null || fail "activate: $out"
[ "$(served)" = abc1234 ] || fail "activate left $(served)"
grep -q "serving release abc1234 (before: def5678)" <<< "$out" || fail "said: $out"
run "activate def5678" < /dev/null || fail "activate as one argument: $out"
[ "$(served)" = def5678 ] || fail "serving $(served)"
run activate def5678 < /dev/null || fail "activating what is served failed: $out"
grep -q "served already" <<< "$out" || fail "said: $out"
run abc1234 < "$work/builds/a.tar.gz" || fail "the kept build again failed: $out"
grep -q "serving it again (before: def5678)" <<< "$out" || fail "said: $out"
[ "$(served)" = abc1234 ] || fail "serving $(served)"
if run activate nosuch < /dev/null; then fail "activated a release that is not there"; fi
# A release's tag is an ID too, the way the workflow names a release's build.
run v1.2.3-rc.1 < "$work/builds/b.tar.gz" || fail "a version tag as the ID: $out"
[ "$(served)" = v1.2.3-rc.1 ] || fail "serving $(served)"
run activate abc1234 < /dev/null || fail "activate: $out"
run "activate v1.2.3-rc.1" < /dev/null || fail "activate a version tag: $out"
[ "$(served)" = v1.2.3-rc.1 ] || fail "serving $(served)"
run activate abc1234 < /dev/null || fail "activate: $out"
[ "$(served)" = abc1234 ] || fail "serving $(served)"

# list: newest first, the one served marked, the same as one argument.
run list < /dev/null || fail "list: $out"
[ "$(sed -n 1p <<< "$out" | cut -d' ' -f1)" = v1.2.3-rc.1 ] || fail "list is not newest first: $out"
[ "$(sed -n 2p <<< "$out" | cut -d' ' -f1)" = def5678 ] || fail "list is not newest first: $out"
grep -q '^abc1234  20[0-9-]*T[0-9:]*Z  (served)$' <<< "$out" || fail "list: $out"
grep -q '^placeholder  -$' <<< "$out" || fail "list: $out"
run "list" < /dev/null || fail "list as one argument: $out"
clean

# Archives that are refused, whole, before anything is unpacked, and leave
# nothing anywhere: not in the root, not beside it.
i=0
refuse() {
  local why=$1
  shift
  i=$((i + 1))
  setup "bad-$i"
  evil "$work/bad-$i.tar.gz" "$@"
  if run "e$i" < "$work/bad-$i.tar.gz"; then fail "accepted $why: $out"; fi
  [ "$(served)" = placeholder ] || fail "$why: serving $(served)"
  [ "$(kept)" = placeholder ] || fail "$why: made a release: $(kept)"
  [ -z "$(find "$work/bad-$i" -name 'evil*' 2>/dev/null)" ] || fail "$why: wrote $(find "$work/bad-$i" -name 'evil*')"
  [ ! -e /tmp/aishiteru-web-deploy-evil ] || fail "$why: wrote /tmp/aishiteru-web-deploy-evil"
  clean
}
refuse "a ../ path" f:index.html f:../evil f:../../evil
refuse "a ../ inside a path" f:index.html d:assets f:assets/../../evil
refuse "an absolute path" f:index.html f:/tmp/aishiteru-web-deploy-evil
refuse "a symlink" f:index.html l:evil:/etc/passwd
refuse "a symlink to a directory, then a file through it" f:index.html l:out:.. f:out/evil
refuse "the top as a symlink" l:.:.. f:index.html f:evil
refuse "the top as a file" f:. f:index.html
refuse "a hard link" f:index.html h:evil:index.html
refuse "a hard link out" f:index.html h:evil:../../../../etc/passwd
refuse "a device" f:index.html c:evil
refuse "a fifo" f:index.html p:evil
refuse "no index.html" f:app.html d:assets f:assets/a.js
refuse "index.html only below the top" d:sub f:sub/index.html
refuse "index.html as a directory" d:index.html f:index.html/x
refuse "a name with a line break" f:index.html 'f:evil\nx'
refuse "a name with a space" f:index.html 'f:evil x'
refuse "a name with a backslash" f:index.html 'f:evil\x'
refuse "an empty archive"

setup not-an-archive
head -c 4096 /dev/urandom > "$work/random"
if run notar < "$work/random"; then fail "accepted random bytes"; fi
grep -q "not a gzipped tar archive" <<< "$out" || fail "said: $out"
[ "$(kept)" = placeholder ] || fail "made a release: $(kept)"
clean

setup nothing
if run nothing < /dev/null; then fail "accepted nothing"; fi
grep -q "nothing came on standard input" <<< "$out" || fail "said: $out"

# Over the limit as sent: refused without reading the rest.
setup oversize
export AISHITERU_WEB_MAX_BYTES=65536
head -c 200000 /dev/urandom | gzip -1 > "$work/big.tar.gz"
if run big < "$work/big.tar.gz"; then fail "accepted $(wc -c < "$work/big.tar.gz") bytes over a limit of 65536"; fi
grep -q "more than 65536 bytes" <<< "$out" || fail "said: $out"
[ "$(kept)" = placeholder ] || fail "made a release: $(kept)"
clean
# ...and an endless stream is cut off at the limit, not read to the end.
out=
if run endless < <(yes); then fail "accepted an endless stream"; fi
grep -q "more than 65536 bytes" <<< "$out" || fail "said: $out"
clean

# Small as sent, large unpacked: refused before it is unpacked.
setup bomb
export AISHITERU_WEB_MAX_UNPACKED=1048576
evil "$work/bomb.tar.gz" f:index.html z:zeros:8388608
[ "$(wc -c < "$work/bomb.tar.gz")" -lt 65536 ] || fail "the bomb is not small: $(wc -c < "$work/bomb.tar.gz")"
if run bomb < "$work/bomb.tar.gz"; then fail "unpacked 8 MiB with a limit of 1 MiB"; fi
grep -q "more than 1048576 bytes unpacked" <<< "$out" || fail "said: $out"
[ "$(kept)" = placeholder ] || fail "made a release: $(kept)"
clean

setup entries
export AISHITERU_WEB_MAX_ENTRIES=10
args=(f:index.html)
for n in $(seq 1 12); do args+=("f:f$n"); done
evil "$work/many.tar.gz" "${args[@]}"
if run many < "$work/many.tar.gz"; then fail "took 13 entries with a limit of 10"; fi
grep -q "more than 10 entries" <<< "$out" || fail "said: $out"
clean

# Modes from the archive are not kept: everything readable, nothing more.
setup modes
evil "$work/modes.tar.gz" d:.::700 f:index.html:x:600 d:assets::700 f:assets/a.js:x:4777 f:run.sh:x:755
run modes < "$work/modes.tar.gz" || fail "exit $?: $out"
[ -z "$(find "$ROOT/releases/modes" -type f ! -perm 644)" ] || fail "files: $(ls -lR "$ROOT/releases/modes")"
[ -z "$(find "$ROOT/releases/modes" -type d ! -perm 755)" ] || fail "directories: $(ls -lR "$ROOT/releases/modes")"

# Directories nobody may read, the top one too: tar gives them the archive's
# modes once it is done. They are made readable and served like any other,
# and leave nothing in the way of going back or of the next deploy.
for spec in "d:.::000 f:index.html" "d:.::000 d:a::000 d:a/b::000 f:a/b/f f:index.html" \
  "d:a::000 f:a/f f:index.html" "d:.::300 d:a::100 f:a/f f:index.html"; do
  setup unreadable
  read -ra entries <<< "$spec"
  evil "$work/unreadable.tar.gz" "${entries[@]}"
  run u1 < "$work/unreadable.tar.gz" || fail "«${spec}»: exit $?: $out"
  [ "$(served)" = u1 ] || fail "«${spec}»: serving $(served)"
  [ -z "$(find "$ROOT/releases/u1" -type d ! -perm 755)" ] || fail "«${spec}»: directories: $(ls -lR "$ROOT/releases/u1")"
  [ -z "$(find "$ROOT/releases/u1" -type f ! -perm 644)" ] || fail "«${spec}»: files: $(ls -lR "$ROOT/releases/u1")"
  run activate placeholder < /dev/null || fail "«${spec}»: going back: $out"
  run abc1234 < "$work/builds/a.tar.gz" || fail "«${spec}»: the next deploy: $out"
  [ "$(served)" = abc1234 ] || fail "«${spec}»: serving $(served)"
  clean
done
# ...and a build refused once it is unpacked goes, unreadable or not.
setup unreadable-refused
run abc1234 < "$work/builds/a.tar.gz" || fail "exit $?: $out"
evil "$work/unreadable-other.tar.gz" d:.::000 d:a::000 f:a/f f:index.html:other
if run abc1234 < "$work/unreadable-other.tar.gz"; then fail "replaced abc1234 with another build"; fi
grep -q "with other files: not replaced" <<< "$out" || fail "said: $out"
run activate placeholder < /dev/null || fail "going back: $out"
clean

# Owners' names are not read: names that look like a listing's columns
# change nothing.
setup owner-names
evil "$work/owners.tar.gz" f:index.html u:owned.txt
run owners < "$work/owners.tar.gz" || fail "exit $?: $out"
[ -f "$ROOT/releases/owners/owned.txt" ] || fail "no owned.txt: $(ls -R "$ROOT/releases/owners")"
clean

# A sparse file is listed at its full size, and takes next to nothing in the
# archive and in its stream: the listing's size is what is counted. GNU tar
# makes them, in its own old format and in pax.
gtar=
if tar --version 2> /dev/null | grep -q 'GNU tar'; then gtar=tar; elif command -v gtar > /dev/null; then gtar=gtar; fi
if [ -n "$gtar" ]; then
  mkdir -p "$work/sparse"
  echo '<!doctype html>' > "$work/sparse/index.html"
  python3 -c 'import sys; open(sys.argv[1], "wb").truncate(64 << 20)' "$work/sparse/big.bin"
  for format in gnu pax; do
    setup "sparse-$format"
    export AISHITERU_WEB_MAX_UNPACKED=1048576
    "$gtar" --sparse --format="$format" -czf "$work/sparse-$format.tar.gz" -C "$work/sparse" index.html big.bin
    stream=$(gzip -dc < "$work/sparse-$format.tar.gz" | wc -c | tr -d ' ')
    [ "$stream" -lt 1048576 ] || fail "not sparse: its stream is $stream bytes"
    if run sparse < "$work/sparse-$format.tar.gz"; then fail "unpacked 64 MiB with a limit of 1 MiB"; fi
    grep -q "big.bin: more than 1048576 bytes unpacked" <<< "$out" || fail "said: $out"
    [ "$(kept)" = placeholder ] || fail "made a release: $(kept)"
    clean
  done
else
  echo "GNU tar is not installed: sparse archives not tested"
fi

# Over SSH, the variables that move the root and the limits are not read:
# what a client may set is sshd's to say.
setup over-ssh
if [ ! -e /srv/aishiteru-web ]; then
  export SSH_CONNECTION="192.0.2.1 50000 192.0.2.2 22"
  if run list < /dev/null; then fail "took AISHITERU_WEB_ROOT over SSH"; fi
  grep -q "/srv/aishiteru-web/releases is missing" <<< "$out" || fail "said: $out"
  unset SSH_CONNECTION
fi

# The newest five are kept, and whatever is served and was served before.
setup prune
for n in 1 2 3 4 5 6 7; do
  build "p$n" "Build $n"
  run "p$n" < "$work/builds/p$n.tar.gz" || fail "p$n: $out"
done
[ "$(kept)" = "p3 p4 p5 p6 p7" ] || fail "kept $(kept)"
run activate p3 < /dev/null || fail "activate p3: $out"
build p8 "Build 8"
run p8 < "$work/builds/p8.tar.gz" || fail "p8: $out"
# p3 was served until p8: kept, for going back.
[ "$(kept)" = "p3 p4 p5 p6 p7 p8" ] || fail "kept $(kept) after going back to p3 and deploying p8"
build p9 "Build 9"
run p9 < "$work/builds/p9.tar.gz" || fail "p9: $out"
[ "$(kept)" = "p5 p6 p7 p8 p9" ] || fail "kept $(kept)"
clean

# Leftovers of a deploy that was killed are cleared by the next one, and by
# an activate, even where nobody may read them.
setup leftovers
mkdir "$ROOT/releases/.zzz.tmp"
ln -s releases/nowhere "$ROOT/.current.new"
run abc1234 < "$work/builds/a.tar.gz" || fail "exit $?: $out"
clean
mkdir -p "$ROOT/releases/.abc1234.tmp/a/b"
touch "$ROOT/releases/.abc1234.tmp/a/b/f"
chmod 000 "$ROOT/releases/.abc1234.tmp/a/b" "$ROOT/releases/.abc1234.tmp/a" "$ROOT/releases/.abc1234.tmp"
run activate placeholder < /dev/null || fail "activate over an unreadable leftover: $out"
[ "$(served)" = placeholder ] || fail "serving $(served)"
clean
mkdir -p "$ROOT/releases/.zzz.tmp/x"
chmod 000 "$ROOT/releases/.zzz.tmp/x" "$ROOT/releases/.zzz.tmp"
run def5678 < "$work/builds/b.tar.gz" || fail "a deploy over an unreadable leftover: $out"
[ "$(served)" = def5678 ] || fail "serving $(served)"
clean

# An upload that stops coming is given up on, and holds nothing up while it
# comes: an activate goes ahead of it.
setup stalled
run abc1234 < "$work/builds/a.tar.gz" || fail "exit $?: $out"
run def5678 < "$work/builds/b.tar.gz" || fail "exit $?: $out"
export AISHITERU_WEB_LOCK_WAIT=2
{ sleep 5 | "$here/aishiteru-web-deploy" slow > "$work/slow.out" 2>&1; } &
sleep 1
run activate abc1234 < /dev/null || fail "activate waited for an upload: $out"
[ "$(served)" = abc1234 ] || fail "serving $(served)"
wait || true
grep -q "nothing came on standard input" "$work/slow.out" || fail "the slow upload: $(cat "$work/slow.out")"
if command -v timeout > /dev/null; then
  export AISHITERU_WEB_READ_WAIT=1
  if run stalled < <(sleep 3); then fail "waited for a build that did not come"; fi
  grep -q "did not come whole within 1 seconds" <<< "$out" || fail "said: $out"
  [ "$(served)" = abc1234 ] || fail "serving $(served)"
else
  echo "timeout is not installed: a stalled upload not tested"
fi
clean

# One at a time: a deploy waits for the lock, and says so when it gives up.
setup lock-dir
export AISHITERU_WEB_FLOCK=no-such-flock AISHITERU_WEB_LOCK_WAIT=2
mkdir "$ROOT/.lock.d"
if run abc1234 < "$work/builds/a.tar.gz"; then fail "deployed while the lock was held"; fi
grep -q "remove it" <<< "$out" || fail "said: $out"
[ "$(served)" = placeholder ] || fail "serving $(served)"
rmdir "$ROOT/.lock.d"
run abc1234 < "$work/builds/a.tar.gz" || fail "exit $?: $out"
[ ! -e "$ROOT/.lock.d" ] || fail "left its lock behind"
if command -v flock > /dev/null; then
  setup lock-flock
  export AISHITERU_WEB_LOCK_WAIT=1
  flock "$ROOT/.lock" sleep 4 &
  sleep 1
  if run abc1234 < "$work/builds/a.tar.gz"; then fail "deployed while the lock was held"; fi
  grep -q "held the lock" <<< "$out" || fail "said: $out"
  wait
  run abc1234 < "$work/builds/a.tar.gz" || fail "exit $?: $out"
else
  echo "flock is not installed: its lock not tested"
fi

# A root that is not what setup-web.sh made.
setup no-releases
rm -rf "$ROOT/releases"
if run abc1234 < "$work/builds/a.tar.gz"; then fail "ran without releases/"; fi
setup current-not-a-link
rm "$ROOT/current"
mkdir "$ROOT/current"
if run abc1234 < "$work/builds/a.tar.gz"; then fail "ran with current a directory"; fi
if [ -L "$ROOT/current" ] || [ ! -d "$ROOT/current" ]; then fail "current was changed"; fi

[ "$failed" = 0 ] && echo "aishiteru-web-deploy: ok ($(tar --version | head -n 1))"
exit "$failed"
