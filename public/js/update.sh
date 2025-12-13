#!/bin/bash

# Update script for Plausible Analytics
# Downloads the latest version and shows what changed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔄 Updating Plausible Analytics..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

name="Plausible Analytics"
url="https://plausible.io/js/script.js"
file="plausible.js"

# Backup current version
if [ -f "$file" ]; then
    cp "$file" "${file}.backup"
    old_size=$(wc -c < "$file")
else
    old_size=0
fi

# Download new version
if curl -f -L --silent --show-error -o "$file" "$url"; then
    new_size=$(wc -c < "$file")
    sri_hash=$(openssl dgst -sha384 -binary "$file" | openssl base64 -A)

    # Compare sizes
    if [ $old_size -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $name downloaded (${new_size} bytes)"
    elif [ $old_size -eq $new_size ]; then
        echo -e "${GREEN}✓${NC} $name unchanged (${new_size} bytes)"
        rm "${file}.backup"
    else
        diff=$((new_size - old_size))
        if [ $diff -gt 0 ]; then
            echo -e "${YELLOW}⚠${NC} $name updated: ${old_size} → ${new_size} bytes (+${diff})"
        else
            echo -e "${YELLOW}⚠${NC} $name updated: ${old_size} → ${new_size} bytes (${diff})"
        fi
        echo "   Backup saved as ${file}.backup"
    fi

    echo "   SRI: integrity=\"sha384-${sri_hash}\""
else
    echo "❌ Failed to download $name"
    if [ -f "${file}.backup" ]; then
        mv "${file}.backup" "$file"
        echo "   Restored from backup"
    fi
    exit 1
fi

echo ""
echo "✅ Update complete!"
echo ""
echo "Next steps:"
echo "1. Copy the SRI hash above to src/app/layout.tsx"
echo "2. Test the app: npm run dev"
echo "3. Check browser console for errors"
echo "4. Verify analytics are working in Network tab"
