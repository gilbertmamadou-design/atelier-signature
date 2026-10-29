#!/usr/bin/env bash
# Copie les pièces communes des applis bureautiques (pc/shared/office/, bibliothèques de pc/shared/vendor/)
# dans le dossier web d'une appli, d'après son fichier office-deps.txt. Rien à faire si ce fichier n'existe pas.
#   bash scripts/office-deps.sh www-presentation            (depuis applis/, comme le workflow)
#   bash scripts/office-deps.sh www-presentation /tmp/web   (copie de test : dossier web complet ailleurs)
set -e
WEB="$1"; DEST="${2:-$1}"
LIST="$WEB/office-deps.txt"
[ -f "$LIST" ] || exit 0
if [ "$DEST" != "$WEB" ]; then mkdir -p "$DEST"; cp -r "$WEB"/. "$DEST"/; fi
while read -r SRC DST; do
  case "$SRC" in ''|\#*) continue;; esac
  if [ -d "$SRC" ]; then mkdir -p "$DEST/$DST"; cp -r "$SRC"/. "$DEST/$DST"; rm -rf "$DEST/$DST/tools"
  else mkdir -p "$(dirname "$DEST/$DST")"; cp "$SRC" "$DEST/$DST"; fi
done < "$LIST"
rm -f "$DEST/office-deps.txt"
echo "Pièces communes copiées dans $DEST"
