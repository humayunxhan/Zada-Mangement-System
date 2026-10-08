# SPMS automatic deployment

GitHub Actions builds only `supplier-desktop/dist-php` and publishes it to
`/home/u728298835/domains/zadapharmacy.com/public_html/spms`.
It runs the web/PWA checks before creating the PHP-only release.

The MySQL credentials remain in `/home/u728298835/domains/zadapharmacy.com/spms-private/config.php`.
They are never stored in GitHub or copied into the public release. Every deployment
backs up the public files and dedicated SPMS database before publishing.

Repository settings required:

1. Add the deploy private key as the Actions secret `HOSTINGER_DEPLOY_KEY`.
2. Add the Actions variable `HOSTINGER_DEPLOY_ENABLED` with value `true` only after
   the matching restricted public key is installed on the hosting account.
3. Keep the workflow environment named `production`.

Do not connect the full repository directly to the SPMS public directory. Hostinger
does not build the Vite application there, and the repository contains source files
that must stay outside the web root.
