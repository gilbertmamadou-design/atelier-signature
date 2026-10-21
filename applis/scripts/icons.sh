#!/usr/bin/env bash
# Icône MAG Formation 13 dans toutes les tailles Android (images déjà prêtes dans android-icons/)
set -e
RES=android/app/src/main/res
rm -rf "$RES/mipmap-anydpi-v26"
for n in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  mkdir -p "$RES/mipmap-$n"
  rm -f "$RES/mipmap-$n/ic_launcher_foreground.png"
  cp "${ICONS:-android-icons}/mipmap-$n/ic_launcher.png" "${ICONS:-android-icons}/mipmap-$n/ic_launcher_round.png" "$RES/mipmap-$n/"
done
