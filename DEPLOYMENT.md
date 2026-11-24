# Nabua Internship System deployment

This project uses Node.js, Express, MySQL, and MySQL-backed sessions. The app can
run on a Node web host; the database must be a managed MySQL service that allows
TLS connections from the host.

## 1. Choose a host and database

The app is an Express server and requires **MySQL**, not PostgreSQL. When
comparing hosts, confirm that they:

- run a persistent Node.js web service from a Git repository;
- let you set environment variables/secrets and read the host-provided `PORT`;
- support a custom domain and automatic HTTPS;
- allow outbound TLS connections to your chosen managed MySQL provider; and
- fit your budget. Check current prices, free-plan limits, and whether free
  services sleep or have storage/usage limits before signing up.

**Suggested setup:** Render Web Service for the Node app, plus a separate
managed MySQL service (for example Aiven for MySQL) that allows TLS connections.
Render documents Node/Express web services and custom-domain HTTPS; Aiven
documents its managed MySQL service. You can use another provider if it meets
the requirements above. Put the app and database in nearby regions when
possible.

- [Render Web Services](https://render.com/docs/web-services)
- [Render Custom Domains](https://render.com/docs/custom-domains)
- [Aiven for MySQL](https://aiven.io/docs/products/mysql)

Create the managed MySQL database and a dedicated, non-root application user
restricted to that database. The user needs permission to create the app and
session tables. Keep the host, port, database name, username, and password for
the service configuration; never put them in Git.

## 2. Create and push a GitHub repository

1. Sign in to GitHub with an account the group can retain access to. Select
   **+ > New repository**; use a clear name such as `nabua-internship`.
2. Choose **Private** unless the instructor requires public access. Add the
   instructor as a collaborator if needed. Leave README, `.gitignore`, and
   license initialization unchecked because the project already has files.
3. In PowerShell, run these commands from the project directory (replace the
   repository URL with the one GitHub displays):

   ```powershell
   Set-Location 'C:\Users\BMB MARKETING\OneDrive\Documents\nabua_internship'
   git init -b main
   git status --short
   git add .
   git status --short
   git check-ignore db.json .env node_modules
   ```

   Review the staged files. `db.json`, `.env`, and `node_modules` must not be
   staged. The JSON file contains applicant personal data and password hashes.
   If either `db.json` or `.env` appears in the staged list, stop and remove it
   from the staging area before continuing.

4. Commit and push:

   ```powershell
   git commit -m "Prepare Nabua internship system for deployment"
   git remote add origin https://github.com/GROUP/nabua-internship.git
   git push -u origin main
   ```

   Replace `GROUP` with the GitHub account or organization that owns the
   repository. GitHub may ask you to sign in or authorize Git Credential
   Manager; do not put a personal access token in a command or source file.
5. Confirm the files appear in the GitHub repository and that `.env` and
   `db.json` do not.

See GitHub's [create a repository instructions](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository).

## 3. Register a domain

1. Choose a registrar that accepts the group's payment method and provides DNS
   management. Search for the desired name and compare both the **first-year
   price and renewal price**; a low introductory price may renew at a higher
   rate. A `.xyz`, `.site`, or `.online` domain is acceptable for this activity.
2. Register the domain in an account controlled by the group, not a member who
   may lose access after the course. Use a group-managed email, enable
   multi-factor authentication, turn on renewal reminders/auto-renew if
   appropriate, and keep the receipt.
3. Do not add DNS records yet. First deploy to the host-provided URL, then add
   the custom domain in the host dashboard. Copy the exact DNS records it shows
   into the registrar's DNS page; don't guess the A/CNAME targets.

## 4. Create and populate MySQL

Select the application database in the MySQL provider's SQL console and run
[`schema.sql`](./schema.sql). It creates the `users` and `applications` tables.
The session-store package creates its own session table when the app connects.

To retain the existing local accounts and applications, run the migration once
from a trusted computer with access to the managed database:

1. Copy `.env.example` to `.env` and fill in the database variables. Set
   `DB_SSL=true`; do not commit `.env`.
2. Run `npm ci`, then `npm run import-json`.
3. The import is safe to repeat: existing user and application rows are not
   overwritten. It fails on invalid JSON or a broken user/application
   relationship instead of silently skipping the data. The local `db.json`
   contains password hashes, so transfer it only to the managed database you
   control and do not upload it to a public location.
4. Remove the local database credentials from `.env` after the import if they
   are no longer needed.

If you are starting with an empty database, skip the import. If the imported
data has no administrator account, create one from a trusted terminal. Set
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `ADMIN_USERNAME`,
`ADMIN_NAME`, and `ADMIN_PASSWORD` in the terminal environment, then run
`npm run create-admin`. The admin password must be at least 12 characters.
Do not use a default or shared password.

## 5. Deploy the app

Configure the web service:

- Runtime: Node.js
- Build command: `npm ci`
- Start command: `npm start`
- Do not use `nodemon` in production.

Add these environment variables in the host dashboard:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | A new, randomly generated secret; do not reuse a development value |
| `DB_HOST` | Managed MySQL host |
| `DB_PORT` | Managed MySQL port, usually `3306` |
| `DB_NAME` | Application database |
| `DB_USER` | Dedicated non-root application database user |
| `DB_PASSWORD` | Database password |
| `DB_SSL` | `true` |

Generate a session secret locally with
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
Enter it directly into the hosting dashboard and never commit it. The app
requires MySQL configuration in production, uses TLS with certificate
validation, trusts one reverse proxy, uses secure production cookies, and
reads the listening port from `PORT`.

Deploy and test the platform-provided URL before changing DNS. Confirm the page
loads, an account can sign in, and application list/slot requests work. Check
the host logs and database connectivity if startup fails.

## 6. Connect the custom domain and HTTPS

1. Add both the apex domain (for example `example.com`) and `www` subdomain in
   the hosting dashboard first.
2. Copy the exact DNS records and targets shown by the host into the domain
   registrar's DNS settings. Do not guess the A/AAAA/CNAME values; hosts differ.
3. Wait for DNS propagation and for the host to issue certificates.
4. Enable the host's HTTP-to-HTTPS redirect. Test both domain names using
   `https://` and confirm `http://` redirects without certificate warnings.
5. Re-test sign-in and an authenticated request over HTTPS.

The domain and hosting dashboards must be accessible to the group to complete
the account setup, billing, DNS, and deployment actions. Never share passwords
or API tokens in source control or chat.
