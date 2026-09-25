# Prairie Sky FC AI Manager

Internal club-management dashboard for Prairie Sky FC.

## MVP
- Dashboard
- Players / groups structure
- Trials and lead pipeline
- Payments overview
- Gmail intelligence integration placeholder

## Run
npm install
npm start

The service listens on `PORT` (Render compatible).

## Persistent records on Render

Create a Render Postgres database in the **same workspace and region** as the existing web service. In the web service's Environment settings, add:

- `DATABASE_URL`: the database's **internal** connection URL.
- `ADMIN_PASSWORD`: a long, unique password for the manager. The browser login user is `admin`.

Set both values before deploying this version. The manager refuses to serve the dashboard when `ADMIN_PASSWORD` is absent; it refuses to read or write records when `DATABASE_URL` is absent. Do not put either value in Git. The Apps Script sync endpoint continues to use its existing `APPS_SCRIPT_SYNC_SECRET`.

On the first database connection the app creates its table and seeds the initial 28-player roster once. Players, payments, and expenses are then saved together with a revision check to catch simultaneous edits from different tabs. The Players page supports one-at-a-time entry and bulk entry (one name per line).

Existing browser records are **not removed automatically**. After deployment, visit the manager in the browser where you previously entered them and click **Import saved browser records**. The import merges by player name and payment ID/message ID. Verify the resulting records before clearing browser storage manually. The import button clears the three old localStorage keys only after the server confirms a successful save.
