# Appwrite lists sync update

The Appwrite backend is already configured for this build:

- Function domain: `https://ordnance-lists-sync.sgp.appwrite.run`
- Database: `map_guide`
- Table: `Ordnance Lists` (`6ab271e400262b493b76`)
- Function: `Ordnance Lists Sync` (`6ab27667002fee0ad273`)
- Function scopes: `rows.read`, `rows.write`

Copy this patch over the repository root, then run `npm test` and `npm run build`.
The list passphrase is stored as a secret Appwrite Function variable and must be
entered once on each device from the Lists page.
