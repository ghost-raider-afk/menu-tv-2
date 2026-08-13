# Menu TV 2.0

Independent application for managing locations, televisions and menu templates.

It does not share source code, configuration, database, Docker volume, network,
container or routes with the existing TV Menu deployment.

## Local start

```bash
cp .env.example .env
# Set unique POSTGRES_PASSWORD, ADMIN_PASSWORD and SESSION_SECRET values.
# For plain http://localhost only, set SECURE_COOKIES=false.
npm ci
npm run check
npm start
```

Open `http://localhost:8080` and sign in with `ADMIN_USERNAME` and
`ADMIN_PASSWORD` from `.env`.

## Deployment isolation

- Container: `menu-tv-2.0`
- Database container: `menu-tv-2-db`
- Image: `menu-tv-2.0:local`
- PostgreSQL data volume: `menu-tv-2-db-data`
- Internal network: `menu-tv-2-internal`
- Domain: `menutv.bf27.ru`
- Public proxy network: external `proxy`

The `compose.yaml` expects the VPS-wide Traefik `proxy` network to exist. Its
environment is intentionally separate: create `/opt/menu-tv-2.0/.env` from the
example, never copy the old TV Menu `.env`.

## Installer

`menu-tv-2.sh` manages only this application. It has no paths, volumes or
configuration names in common with the older TV Menu.

```bash
export MENU_TV_2_REPO_URL=git@github.com:OWNER/menu-tv-2.git
export MENU_TV_2_DEPLOY_KEY=/root/.ssh/menu-tv-2_deploy  # only for a private repo
sudo ./menu-tv-2.sh install

sudo menu-tv-2.0 doctor
sudo menu-tv-2.0 status
sudo menu-tv-2.0 update
```

The very first question is the public domain (for example `menutv.bf27.ru`).
Then the installer creates a private `.env` (mode `0600`), an independent
PostgreSQL user/password and an administrator password. At the end it shows one
terminal card with the URL and all credentials; save it in a password manager.

Before an update it makes a permission-restricted temporary copy of its source,
`.env`, and PostgreSQL dump under the system temporary directory. The copy is
removed after a successful update or a successful automatic rollback. There is
no permanent backup folder and no manual rollback command. If automatic
recovery itself fails, the script prints the temporary path instead of deleting
the only recoverable copy.

## License

The interface is built as a new application using the TailAdmin HTML dashboard
approach (Tailwind CSS and Alpine-style progressive interaction). TailAdmin is
available under the MIT License: https://github.com/TailAdmin/tailadmin-free-tailwind-dashboard-template
