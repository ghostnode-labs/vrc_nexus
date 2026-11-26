#!/bin/sh
# Builds com.ghostnode.vrcnexus.tar for installation in the WoltLab ACP (Packages → Upload package).
set -e
cd "$(dirname "$0")/com.ghostnode.vrcnexus"
tmp=$(mktemp -d)
tar -cf "$tmp/files.tar" -C files .
tar -cf "$tmp/templates.tar" -C templates .
cp package.xml bbcode.xml option.xml "$tmp/"
mkdir -p "$tmp/language" && cp language/*.xml "$tmp/language/"
tar -cf ../com.ghostnode.vrcnexus.tar -C "$tmp" .
rm -rf "$tmp"
echo "built: $(cd .. && pwd)/com.ghostnode.vrcnexus.tar"
