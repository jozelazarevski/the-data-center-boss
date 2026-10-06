#!/usr/bin/env sh
# Wraps src/game.html (the Claude artifact source, which has no <html>/<head>/<body>)
# into a standalone index.html for GitHub Pages. Run after editing src/game.html.
set -e
cd "$(dirname "$0")"
{
  cat <<'HEAD'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="A data center tycoon that teaches you to build one: pick a site, buy a hangar, then grow a server closet into an AI campus.">
<meta name="color-scheme" content="light">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M16 2 29 9.5v13L16 30 3 22.5v-13z' fill='%232f5bea'/%3E%3Cpath d='M16 2 29 9.5 16 17 3 9.5z' fill='%236f8cff'/%3E%3Cpath d='M16 17v13L3 22.5v-13z' fill='%231f45c7'/%3E%3C/svg%3E">
<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
HEAD
  # title, fonts and styles go in <head>; the markup and scripts go in <body>
  sed '/^<div class="app">/,$d' src/game.html
  printf '</head>\n<body>\n'
  sed -n '/^<div class="app">/,$p' src/game.html
  printf '\n</body>\n</html>\n'
} > index.html
echo "Built index.html"
