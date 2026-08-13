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
- Domain: set during the first installation
- Public proxy network: dedicated `menu-tv-2-proxy`

The installer creates a dedicated Traefik container and the
`menu-tv-2-proxy` network. Its environment is intentionally separate: create
`/opt/menu-tv-2.0/.env` from the example, never copy the old TV Menu `.env`.

## Installer

`menu-tv-2.sh` manages only this application. It has no paths, volumes or
configuration names in common with the older TV Menu. It installs the project
only into `/opt/menu-tv-2.0` and creates the launcher
`/usr/local/bin/menu-tv-2.0`.

```bash
git clone --depth 1 git@github.com-menu-tv-2:ghost-raider-afk/menu-tv-2.git /tmp/menu-tv-2-bootstrap
sudo bash /tmp/menu-tv-2-bootstrap/menu-tv-2.sh
rm -rf /tmp/menu-tv-2-bootstrap
```

The repository remains private. Before the first launch, configure the separate
`github.com-menu-tv-2` SSH host with a read-only deploy key for
`ghost-raider-afk/menu-tv-2`. The installer uses that key only for Git
operations; it does not copy the key into `/opt` or `.env`.

On a clean Ubuntu VPS the installer automatically installs Docker Engine and
Docker Compose, then creates the dedicated HTTPS proxy in
`/opt/menu-tv-2-proxy`. Ports 80 and 443 must be free, and the domain must
already point to the VPS IP address before installation.

The interactive menu contains four actions: install, update, remove the
project, and remove the project together with the system launcher. Both remove
actions require an explicit confirmation. Removal affects only Menu TV 2.0:
its `/opt/menu-tv-2.0` directory, two named containers, local image and the
`menu-tv-2-db-data` PostgreSQL volume.

The very first question is the public domain (for example `menu.example.com`).
Then the installer creates a private `.env` (mode `0600`), an independent
PostgreSQL user/password and an administrator password. At the end it shows one
terminal card with the URL and all credentials; save it in a password manager.
The administrator password has exactly 10 characters and contains uppercase and
lowercase Latin letters, a digit and a safe special character. Ambiguous
characters (`0`, `O`, `1`, `l`, `I`) are excluded.

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
