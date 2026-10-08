# SPMS automatic deployment

GitHub Actions builds only `supplier-desktop/dist-php` and publishes it to
`/home/u728298835/domains/zadapharmacy.com/public_html/spms`.
It runs the web/PWA checks before creating the PHP-only release.

The MySQL credentials remain in `/home/u728298835/domains/zadapharmacy.com/spms-private/config.php`.
They are never stored in GitHub or copied into the public release. Every deployment
backs up the public files and dedicated SPMS database before publishing.

Repository settings required:

1. Add the SPMS deploy private key as the Actions secret `ZADA_SPMS_HOSTINGER_SSH_KEY`.
2. Add the Actions variable `HOSTINGER_DEPLOY_ENABLED` with value `true` only after
   the matching restricted public key is installed on the hosting account.
3. Keep the workflow environment named `production`.

The matching server public key is restricted to `deploy/gateway.sh`: it cannot
open a shell, run a remote command, copy arbitrary files, allocate a terminal or
use SSH forwarding. The gateway accepts only the expected SPMS bundle files,
validates the commit/run identifiers and limits the upload size before deployment.

Do not connect the full repository directly to the SPMS public directory. Hostinger
does not build the Vite application there, and the repository contains source files
that must stay outside the web root.
