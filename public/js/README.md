# Plausible Analytics

Locally-hosted copy of Plausible Analytics script for improved CSP compliance and supply chain security.

## Why Local Hosting?

- Reduces external script sources in CSP
- Enables SRI (Subresource Integrity) verification
- Scripts execute from trusted origin

## Updating

Run the update script:

```bash
./public/js/update.sh
```

After updating, copy the generated SRI hash to [src/app/layout.tsx](../../src/app/layout.tsx).

## Manual Update

```bash
curl -o public/js/plausible.js https://plausible.io/js/script.js
openssl dgst -sha384 -binary public/js/plausible.js | openssl base64 -A
```
