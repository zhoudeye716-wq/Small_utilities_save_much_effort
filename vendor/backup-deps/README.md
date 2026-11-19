# Backup dependency bundle

`utils/backup/vendor.js` bundles fflate 0.8.2, @noble/ciphers 1.3.0 and
@noble/hashes 1.8.0, using esbuild 0.25.12. The upstream licenses are included
in this directory. Build with an isolated npm install of those exact versions,
then bundle the following entry using `--bundle --platform=browser --format=cjs
--target=es2020`:

```js
exports.fflate = require('fflate');
exports.xchacha20poly1305 = require('@noble/ciphers/chacha').xchacha20poly1305;
exports.scryptAsync = require('@noble/hashes/scrypt').scryptAsync;
exports.sha256 = require('@noble/hashes/sha256').sha256;
```

Random bytes are supplied by the platform adapter; no insecure random fallback
is used.
