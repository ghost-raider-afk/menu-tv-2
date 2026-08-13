#!/usr/bin/env bash
set -Eeuo pipefail

PROGRAM_NAME="menu-tv-2.0"
INSTALL_DIR="${MENU_TV_2_INSTALL_DIR:-/opt/menu-tv-2.0}"
REPO_URL="${MENU_TV_2_REPO_URL:-}"
BRANCH="${MENU_TV_2_BRANCH:-main}"
DEPLOY_KEY="${MENU_TV_2_DEPLOY_KEY:-}"
COMPOSE_PROJECT="menu-tv-2"
APP_SERVICE="app"
DB_SERVICE="db"
APP_CONTAINER="menu-tv-2.0"
DB_CONTAINER="menu-tv-2-db"
DB_VOLUME="menu-tv-2-db-data"
PROXY_NETWORK="${MENU_TV_2_PROXY_NETWORK:-proxy}"
DEFAULT_DOMAIN="menutv.bf27.ru"
TEMP_BACKUP_DIR=""
KEEP_TEMP_BACKUP=false

log() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

cleanup_temporary_backup() {
  if [[ -n "$TEMP_BACKUP_DIR" && -d "$TEMP_BACKUP_DIR" && "$KEEP_TEMP_BACKUP" != true ]]; then
    rm -rf -- "$TEMP_BACKUP_DIR"
  fi
}
trap cleanup_temporary_backup EXIT

usage() {
  cat <<USAGE
Menu TV 2.0 — installer and lifecycle manager

Usage:
  sudo $PROGRAM_NAME install
  sudo $PROGRAM_NAME update
  sudo $PROGRAM_NAME status
  sudo $PROGRAM_NAME doctor

First installation requires:
  MENU_TV_2_REPO_URL=git@github.com:OWNER/menu-tv-2.git

Optional settings:
  MENU_TV_2_INSTALL_DIR=/opt/menu-tv-2.0
  MENU_TV_2_BRANCH=main
  MENU_TV_2_DEPLOY_KEY=/root/.ssh/menu-tv-2_deploy
  MENU_TV_2_PROXY_NETWORK=proxy

The installer asks for the public domain first, then generates a dedicated
PostgreSQL account and an administrator password. Update backups exist only in
a private temporary directory and are removed after success or auto-rollback.
USAGE
}

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Запустите через sudo."
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

compose() {
  docker compose --project-name "$COMPOSE_PROJECT" --project-directory "$INSTALL_DIR" --env-file "$INSTALL_DIR/.env" "$@"
}

git_command() {
  if [[ -n "$DEPLOY_KEY" ]]; then
    [[ -r "$DEPLOY_KEY" ]] || die "Нет доступа к ключу Git: $DEPLOY_KEY"
    GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" git "$@"
  else
    git "$@"
  fi
}

check_dependencies() {
  local tool
  for tool in docker git tar openssl awk sed find install mktemp; do
    command_exists "$tool" || die "Не найдена команда: $tool"
  done
  docker info >/dev/null 2>&1 || die "Docker daemon недоступен."
  docker compose version >/dev/null 2>&1 || die "Нужен Docker Compose v2."
}

assert_proxy_network() {
  docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1 || die "Не найдена внешняя Docker-сеть '$PROXY_NETWORK'."
}

env_value() {
  local key="$1" file="${2:-$INSTALL_DIR/.env}"
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$file"
}

set_env_value() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*$|${key}=${value}|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

validate_domain() {
  local domain="${1,,}"
  [[ "$domain" =~ ^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] || return 1
  [[ "$domain" != *..* ]] || return 1
  printf '%s\n' "$domain"
}

ask_for_domain() {
  local input domain
  [[ -t 0 ]] || die "Для первой установки нужен интерактивный терминал, чтобы ввести домен."
  while true; do
    read -r -p "Введите домен Menu TV 2.0 [$DEFAULT_DOMAIN]: " input
    input="${input:-$DEFAULT_DOMAIN}"
    domain="$(validate_domain "$input" || true)"
    [[ -n "$domain" ]] && { printf '%s\n' "$domain"; return; }
    warn "Введите домен без https://, например menutv.bf27.ru."
  done
}

random_secret() { openssl rand -hex "$1"; }

write_new_env() {
  local domain="$1" env_file="$INSTALL_DIR/.env"
  [[ -f "$INSTALL_DIR/.env.example" ]] || die "В репозитории отсутствует .env.example"
  [[ ! -e "$env_file" ]] || die "Уже существует $env_file — создание остановлено для защиты настроек."
  cp "$INSTALL_DIR/.env.example" "$env_file"
  set_env_value "$env_file" MENU_TV_2_DOMAIN "$domain"
  set_env_value "$env_file" POSTGRES_DB "menu_tv_2"
  set_env_value "$env_file" POSTGRES_USER "menu_tv_2"
  set_env_value "$env_file" POSTGRES_PASSWORD "$(random_secret 24)"
  set_env_value "$env_file" ADMIN_USERNAME "admin"
  set_env_value "$env_file" ADMIN_PASSWORD "$(random_secret 24)"
  set_env_value "$env_file" SESSION_SECRET "$(random_secret 48)"
  chmod 600 "$env_file"
}

validate_env() {
  local key value
  [[ -f "$INSTALL_DIR/.env" ]] || die "Отсутствует $INSTALL_DIR/.env"
  for key in MENU_TV_2_DOMAIN POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD ADMIN_USERNAME ADMIN_PASSWORD SESSION_SECRET; do
    value="$(env_value "$key")"
    [[ -n "$value" && "$value" != replace-with-* ]] || die "$key в .env не настроен."
  done
  [[ $(env_value POSTGRES_PASSWORD | wc -c) -ge 17 ]] || die "POSTGRES_PASSWORD должен содержать не менее 16 символов."
  [[ $(env_value ADMIN_PASSWORD | wc -c) -ge 17 ]] || die "ADMIN_PASSWORD должен содержать не менее 16 символов."
  [[ $(env_value SESSION_SECRET | wc -c) -ge 33 ]] || die "SESSION_SECRET должен содержать не менее 32 символов."
}

install_launcher() {
  install -m 0755 "$INSTALL_DIR/menu-tv-2.sh" "/usr/local/bin/$PROGRAM_NAME"
}

wait_for_database() {
  local attempt
  for attempt in $(seq 1 30); do
    if compose exec -T "$DB_SERVICE" sh -ec 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  die "PostgreSQL не стал доступен за 60 секунд."
}

verify_application() {
  compose exec -T "$APP_SERVICE" node -e "fetch('http://127.0.0.1:8080/healthz').then((r) => { if (!r.ok) process.exit(1); return r.json(); }).then((body) => process.exit(body.service === 'menu-tv-2.0' ? 0 : 1)).catch(() => process.exit(1))"
}

build_and_start() {
  validate_env
  assert_proxy_network
  log "Проверка конфигурации Docker Compose"
  compose config -q
  log "Сборка и запуск независимых контейнеров"
  compose up -d --build --wait
  log "Проверка готовности приложения"
  verify_application
}

create_temporary_backup() {
  [[ -d "$INSTALL_DIR/.git" ]] || die "Каталог исходников не является Git-репозиторием: $INSTALL_DIR"
  TEMP_BACKUP_DIR="$(mktemp -d -t "${PROGRAM_NAME}.update.XXXXXX")"
  chmod 700 "$TEMP_BACKUP_DIR"
  log "Создание временной резервной копии"
  tar --exclude='./.git' --exclude='./.env' --exclude='./node_modules' -C "$INSTALL_DIR" -czf "$TEMP_BACKUP_DIR/source.tar.gz" .
  cp "$INSTALL_DIR/.env" "$TEMP_BACKUP_DIR/.env"
  chmod 600 "$TEMP_BACKUP_DIR/.env"
  git -C "$INSTALL_DIR" rev-parse HEAD > "$TEMP_BACKUP_DIR/git-revision"
  compose exec -T "$DB_SERVICE" sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "$TEMP_BACKUP_DIR/database.dump"
  info "Временный бэкап создан и будет удалён после завершения операции."
}

restore_temporary_backup() {
  [[ -n "$TEMP_BACKUP_DIR" && -f "$TEMP_BACKUP_DIR/source.tar.gz" && -f "$TEMP_BACKUP_DIR/database.dump" ]] || return 1
  warn "Обновление не прошло проверку. Выполняется автоматическое восстановление."
  compose down --remove-orphans || true
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name '.git' ! -name '.env' -exec rm -rf -- {} +
  tar -C "$INSTALL_DIR" -xzf "$TEMP_BACKUP_DIR/source.tar.gz"
  cp "$TEMP_BACKUP_DIR/.env" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
  git -C "$INSTALL_DIR" reset --hard "$(<"$TEMP_BACKUP_DIR/git-revision")"
  install_launcher
  compose up -d "$DB_SERVICE"
  wait_for_database
  compose exec -T "$DB_SERVICE" sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' < "$TEMP_BACKUP_DIR/database.dump"
  compose up -d --build --wait
  verify_application
}

sync_existing_source() {
  git_command -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
  git -C "$INSTALL_DIR" clean -fd -e .env
  install_launcher
}

show_credentials() {
  local env_file="$INSTALL_DIR/.env" domain
  domain="$(env_value MENU_TV_2_DOMAIN "$env_file")"
  printf '\n'
  printf '╔════════════════════════ MENU TV 2.0: СОХРАНИТЕ ПАРАМЕТРЫ ════════════════════════╗\n'
  printf '║ Адрес:        https://%-58s ║\n' "$domain"
  printf '║ Администратор: %-68s ║\n' "$(env_value ADMIN_USERNAME "$env_file")"
  printf '║ Пароль:       %-68s ║\n' "$(env_value ADMIN_PASSWORD "$env_file")"
  printf '║ БД хост:      %-68s ║\n' "db (доступен только внутри сети menu-tv-2-internal)"
  printf '║ БД имя:       %-68s ║\n' "$(env_value POSTGRES_DB "$env_file")"
  printf '║ БД пользователь: %-65s ║\n' "$(env_value POSTGRES_USER "$env_file")"
  printf '║ БД пароль:    %-68s ║\n' "$(env_value POSTGRES_PASSWORD "$env_file")"
  printf '║ Env-файл:     %-68s ║\n' "$env_file"
  printf '╚══════════════════════════════════════════════════════════════════════════════════╝\n'
  printf 'Пароли больше не выводятся командами status/doctor. Сохраните их в менеджер паролей.\n'
}

install_app() {
  require_root
  check_dependencies
  local domain
  domain="$(ask_for_domain)"
  [[ -n "$REPO_URL" ]] || die "Для установки задайте MENU_TV_2_REPO_URL — URL отдельного репозитория Menu TV 2.0."
  [[ ! -e "$INSTALL_DIR" ]] || die "Каталог $INSTALL_DIR уже существует. Для установленного приложения используйте update."
  log "Загрузка отдельного репозитория"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git_command clone --branch "$BRANCH" --single-branch "$REPO_URL" "$INSTALL_DIR"
  write_new_env "$domain"
  install_launcher
  build_and_start
  show_credentials
}

update_app() {
  require_root
  check_dependencies
  [[ -d "$INSTALL_DIR/.git" ]] || die "Menu TV 2.0 не установлен: $INSTALL_DIR"
  validate_env
  create_temporary_backup
  if ! sync_existing_source || ! build_and_start; then
    if restore_temporary_backup; then
      die "Обновление отменено: предыдущая версия и данные автоматически восстановлены."
    fi
    KEEP_TEMP_BACKUP=true
    die "Автоматическое восстановление не завершилось. Временная копия сохранена: $TEMP_BACKUP_DIR"
  fi
  info "Обновление прошло проверку. Временная копия удалена."
}

status_app() {
  require_root
  [[ -d "$INSTALL_DIR" ]] || die "Menu TV 2.0 не установлен."
  printf 'Installation: %s\n' "$INSTALL_DIR"
  printf 'Revision: '
  git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown'
  printf '\nContainers:\n'
  docker ps --filter "name=^/${APP_CONTAINER}$" --filter "name=^/${DB_CONTAINER}$" --format '  {{.Names}}  {{.Status}}  {{.Image}}'
  printf 'Health: '
  verify_application >/dev/null 2>&1 && printf 'OK\n' || printf 'FAILED\n'
}

doctor_app() {
  require_root
  check_dependencies
  printf 'Docker: OK\n'
  docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1 && printf 'Proxy network: OK\n' || printf 'Proxy network: MISSING\n'
  if [[ -d "$INSTALL_DIR" ]]; then
    [[ -f "$INSTALL_DIR/.env" ]] && printf 'Independent env: OK\n' || printf 'Independent env: MISSING\n'
    docker volume inspect "$DB_VOLUME" >/dev/null 2>&1 && printf 'Independent PostgreSQL volume: OK\n' || printf 'Independent PostgreSQL volume: MISSING\n'
  fi
}

main() {
  case "${1:-help}" in
    install) install_app ;;
    update) update_app ;;
    status) status_app ;;
    doctor) doctor_app ;;
    help|-h|--help) usage ;;
    *) die "Неизвестная команда: ${1:-}" ;;
  esac
}

main "$@"
