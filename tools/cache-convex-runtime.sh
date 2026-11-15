set -euo pipefail

version=${1:?Pass the Convex backend version}
cache_dir=${2:-"$HOME/.cache/convex"}
if [[ ! "$version" =~ ^precompiled-[a-zA-Z0-9-]+$ ]]; then
  echo "Invalid Convex backend version: $version" >&2
  exit 1
fi

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) platform=aarch64-apple-darwin ;;
  Darwin-x86_64) platform=x86_64-apple-darwin ;;
  Linux-aarch64) platform=aarch64-unknown-linux-gnu ;;
  Linux-x86_64) platform=x86_64-unknown-linux-gnu ;;
  *) echo "Unsupported Convex backend platform" >&2; exit 1 ;;
esac

download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT

download() {
  local name=$1
  local attempt
  for attempt in 1 2 3; do
    if gh release download "$version" --repo convex/convex-backend \
      --pattern "$name" --output "$download_dir/$name" --clobber &&
      unzip -tq "$download_dir/$name"; then
      return 0
    fi
    if [ "$attempt" -lt 3 ]; then sleep "$((attempt * 2))"; fi
  done
  echo "Could not download a valid $name after 3 attempts" >&2
  return 1
}

backend_zip="convex-local-backend-$platform.zip"
download "$backend_zip"
download dashboard.zip
unzip -q "$download_dir/$backend_zip" -d "$download_dir/backend"
unzip -q "$download_dir/dashboard.zip" -d "$download_dir/dashboard"
test -f "$download_dir/backend/convex-local-backend"
test -f "$download_dir/dashboard/index.html"
chmod +x "$download_dir/backend/convex-local-backend"
mkdir -p "$cache_dir/binaries/$version" "$cache_dir/dashboard"
mv "$download_dir/backend/convex-local-backend" "$cache_dir/binaries/$version/"
rm -rf "$cache_dir/dashboard/out"
mv "$download_dir/dashboard" "$cache_dir/dashboard/out"
printf '{"version":"%s"}\n' "$version" > "$cache_dir/dashboard/config.json"
