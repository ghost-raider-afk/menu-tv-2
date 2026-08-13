#!/usr/bin/env bash
set -Eeuo pipefail

# Menu TV 2.0 is intentionally independent from the legacy TV Menu project.
PROGRAM_NAME="menu-tv-2.0"
INSTALL_DIR="/opt/menu-tv-2.0"
REPO_URL="git@github.com-menu-tv-2:ghost-raider-afk/menu-tv-2.git"
BRANCH="main"
COMPOSE_PROJECT="menu-tv-2"
APP_SERVICE="app"
DB_SERVICE="db"
SFTP_SERVICE="sftp"
APP_CONTAINER="menu-tv-2.0"
DB_CONTAINER="menu-tv-2-db"
SFTP_CONTAINER="menu-tv-2-sftp"
DB_VOLUME="menu-tv-2-db-data"
SFTP_VOLUME="menu-tv-2-sftp-data"
PROXY_NETWORK="menu-tv-2-proxy"
PROXY_DIR="/opt/menu-tv-2-proxy"
PROXY_COMPOSE_FILE="$PROXY_DIR/compose.yaml"
PROXY_ENV_FILE="$PROXY_DIR/.env"
PROXY_CONTAINER="menu-tv-2-proxy"
LAUNCHER_PATH="/usr/local/bin/menu-tv-2.0"
PROJECT_OWNER_FILE="$INSTALL_DIR/.installer-owner"
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
Menu TV 2.0 — управление независимым приложением

Запуск меню после установки:
  sudo $PROGRAM_NAME

Команды:
  sudo $PROGRAM_NAME install
  sudo $PROGRAM_NAME update
  sudo $PROGRAM_NAME remove
  sudo $PROGRAM_NAME purge
  sudo $PROGRAM_NAME status

Проект устанавливается только в: $INSTALL_DIR
Контейнеры: $APP_CONTAINER, $DB_CONTAINER, $SFTP_CONTAINER
USAGE
}

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Запустите через sudo."
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

require_ubuntu() {
  [[ -r /etc/os-release ]] || die "Не удалось определить операционную систему."
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ "${ID:-}" == ubuntu ]] || die "Установщик поддерживает Ubuntu. Обнаружена: ${PRETTY_NAME:-неизвестно}."
}

install_base_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl git openssl
}

install_docker() {
  command_exists docker && docker compose version >/dev/null 2>&1 && return 0
  log "Установка Docker Engine и Docker Compose"
  install_base_packages
  local docker_installer
  docker_installer="$(mktemp -t menu-tv-2-docker.XXXXXX)"
  curl -fsSL https://get.docker.com -o "$docker_installer"
  sh "$docker_installer"
  rm -f -- "$docker_installer"
  systemctl enable --now docker
}

prepare_host() {
  require_root
  require_ubuntu
  if ! command_exists git || ! command_exists curl || ! command_exists openssl; then
    install_base_packages
  fi
  install_docker
}

project_owner() {
  if [[ -f "$PROJECT_OWNER_FILE" ]]; then
    head -n 1 "$PROJECT_OWNER_FILE"
  else
    printf '%s\n' "${SUDO_USER:-root}"
  fi
}

git_as_project_owner() {
  local owner
  owner="$(project_owner)"
  id "$owner" >/dev/null 2>&1 || die "Не найден пользователь владельца проекта: $owner"
  if [[ "$owner" == root ]]; then
    git "$@"
  else
    runuser -u "$owner" -- git "$@"
  fi
}

compose() {
  docker compose --project-name "$COMPOSE_PROJECT" --project-directory "$INSTALL_DIR" --env-file "$INSTALL_DIR/.env" "$@"
}

check_dependencies() {
  local tool
  for tool in docker git tar openssl awk sed find install mktemp runuser od tr fold shuf; do
    command_exists "$tool" || die "Не найдена команда: $tool"
  done
  docker info >/dev/null 2>&1 || die "Docker daemon недоступен."
  docker compose version >/dev/null 2>&1 || die "Нужен Docker Compose v2."
}

ask_for_acme_email() {
  local input
  [[ -t 0 ]] || die "Для первой установки нужен интерактивный терминал."
  while true; do
    read -r -p "Введите e-mail для сертификатов Let's Encrypt: " input
    [[ "$input" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] && { printf '%s\n' "$input"; return; }
    warn "Введите корректный e-mail."
  done
}

assert_proxy_network() {
  docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1 || die "Не найдена внешняя Docker-сеть '$PROXY_NETWORK'."
}

setup_proxy() {
  local acme_email="$1"
  [[ -f "$INSTALL_DIR/infra/traefik-compose.yaml" ]] || die "В репозитории отсутствует конфигурация Traefik."
  install -d -o root -g root -m 0750 "$PROXY_DIR"
  install -o root -g root -m 0640 "$INSTALL_DIR/infra/traefik-compose.yaml" "$PROXY_COMPOSE_FILE"
  printf 'TRAEFIK_ACME_EMAIL=%s\n' "$acme_email" > "$PROXY_ENV_FILE"
  chown root:root "$PROXY_ENV_FILE"
  chmod 600 "$PROXY_ENV_FILE"
  install -o root -g root -m 0600 /dev/null "$PROXY_DIR/acme.json"
  log "Запуск собственного HTTPS-прокси Menu TV 2.0"
  docker compose --project-name menu-tv-2-proxy --project-directory "$PROXY_DIR" --env-file "$PROXY_ENV_FILE" up -d --wait
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
  [[ -t 0 ]] || die "Для первой установки нужен интерактивный терминал."
  while true; do
    read -r -p "Введите домен Menu TV 2.0: " input
    domain="$(validate_domain "$input" || true)"
    [[ -n "$domain" ]] && { printf '%s\n' "$domain"; return; }
    warn "Введите домен без https://, например menu.example.com."
  done
}

random_secret() { openssl rand -hex "$1"; }

random_character() {
  local character_set="$1" character_count="${#1}" limit byte
  limit=$((256 - (256 % character_count)))
  while true; do
    byte="$(od -An -N1 -tu1 /dev/urandom)"
    byte="${byte//[[:space:]]/}"
    [[ "$byte" -lt "$limit" ]] && break
  done
  printf '%s' "${character_set:byte % character_count:1}"
}

random_admin_password() {
  local upper="ABCDEFGHJKLMNPQRSTUVWXYZ" lower="abcdefghjkmnpqrstuvwxyz"
  local digits="23456789" special="!%+,.:@^_~-" alphabet password
  alphabet="${upper}${lower}${digits}${special}"
  password="$(random_character "$upper")"
  password+="$(random_character "$lower")"
  password+="$(random_character "$digits")"
  password+="$(random_character "$special")"
  for _ in $(seq 1 6); do
    password+="$(random_character "$alphabet")"
  done
  printf '%s' "$password" | fold -w1 | shuf | tr -d '\n'
}

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
  set_env_value "$env_file" ADMIN_PASSWORD "$(random_admin_password)"
  set_env_value "$env_file" SESSION_SECRET "$(random_secret 48)"
  set_env_value "$env_file" SFTP_PUBLIC_HOST "$domain"
  set_env_value "$env_file" SFTP_PORT "2022"
  set_env_value "$env_file" SFTP_API_URL "http://sftp:8080"
  set_env_value "$env_file" SFTP_STORAGE_ROOT "/srv/menu-tv-sftp"
  set_env_value "$env_file" SFTP_ADMIN_USERNAME "menu_tv_2_service"
  set_env_value "$env_file" SFTP_ADMIN_PASSWORD "$(random_secret 32)"
  chmod 600 "$env_file"
}

ensure_sftp_env() {
  local env_file="$INSTALL_DIR/.env" domain
  [[ -f "$env_file" ]] || die "Отсутствует $env_file"
  domain="$(env_value MENU_TV_2_DOMAIN "$env_file")"
  [[ -n "$domain" ]] || die "MENU_TV_2_DOMAIN в .env не настроен."
  [[ -n "$(env_value SFTP_PUBLIC_HOST "$env_file")" ]] || set_env_value "$env_file" SFTP_PUBLIC_HOST "$domain"
  [[ -n "$(env_value SFTP_PORT "$env_file")" ]] || set_env_value "$env_file" SFTP_PORT "2022"
  [[ -n "$(env_value SFTP_API_URL "$env_file")" ]] || set_env_value "$env_file" SFTP_API_URL "http://sftp:8080"
  [[ -n "$(env_value SFTP_STORAGE_ROOT "$env_file")" ]] || set_env_value "$env_file" SFTP_STORAGE_ROOT "/srv/menu-tv-sftp"
  [[ -n "$(env_value SFTP_ADMIN_USERNAME "$env_file")" ]] || set_env_value "$env_file" SFTP_ADMIN_USERNAME "menu_tv_2_service"
  if [[ -z "$(env_value SFTP_ADMIN_PASSWORD "$env_file")" || "$(env_value SFTP_ADMIN_PASSWORD "$env_file")" == replace-with-* ]]; then
    set_env_value "$env_file" SFTP_ADMIN_PASSWORD "$(random_secret 32)"
    info "Для нового внутреннего SFTP-сервиса создан отдельный служебный секрет."
  fi
  chown root:root "$env_file"
  chmod 600 "$env_file"
}

validate_env() {
  local key value
  [[ -f "$INSTALL_DIR/.env" ]] || die "Отсутствует $INSTALL_DIR/.env"
  for key in MENU_TV_2_DOMAIN POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD ADMIN_USERNAME ADMIN_PASSWORD SESSION_SECRET SFTP_PUBLIC_HOST SFTP_PORT SFTP_ADMIN_USERNAME SFTP_ADMIN_PASSWORD; do
    value="$(env_value "$key")"
    [[ -n "$value" && "$value" != replace-with-* ]] || die "$key в .env не настроен."
  done
  [[ $(env_value POSTGRES_PASSWORD | wc -c) -ge 17 ]] || die "POSTGRES_PASSWORD должен содержать не менее 16 символов."
  [[ $(env_value ADMIN_PASSWORD | wc -c) -ge 11 ]] || die "ADMIN_PASSWORD должен содержать не менее 10 символов."
  [[ $(env_value SESSION_SECRET | wc -c) -ge 33 ]] || die "SESSION_SECRET должен содержать не менее 32 символов."
  [[ $(env_value SFTP_ADMIN_PASSWORD | wc -c) -ge 33 ]] || die "SFTP_ADMIN_PASSWORD должен содержать не менее 32 символов."
}

repair_permissions() {
  local owner
  [[ -d "$INSTALL_DIR" ]] || return 0
  owner="$(project_owner)"
  id "$owner" >/dev/null 2>&1 || die "Не найден пользователь владельца проекта: $owner"
  chown -R "$owner:$owner" "$INSTALL_DIR"
  find "$INSTALL_DIR" -type d -exec chmod 750 {} +
  find "$INSTALL_DIR" -type f -exec chmod 640 {} +
  chmod 750 "$INSTALL_DIR/menu-tv-2.sh"
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    chown root:root "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/.env"
  fi
  if [[ -f "$PROJECT_OWNER_FILE" ]]; then
    chown root:root "$PROJECT_OWNER_FILE"
    chmod 640 "$PROJECT_OWNER_FILE"
  fi
}

install_launcher() {
  install -o root -g root -m 0755 "$INSTALL_DIR/menu-tv-2.sh" "$LAUNCHER_PATH"
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

verify_sftp() {
  compose exec -T "$SFTP_SERVICE" sftpgo ping
}

build_and_start() {
  validate_env
  assert_proxy_network
  repair_permissions
  log "Проверка конфигурации Docker Compose"
  compose config -q
  log "Сборка и запуск независимых контейнеров"
  compose up -d --build --wait
  log "Проверка готовности приложения"
  verify_application
  log "Проверка SFTP-сервера"
  verify_sftp
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
  repair_permissions
  install_launcher
  compose up -d "$DB_SERVICE"
  wait_for_database
  compose exec -T "$DB_SERVICE" sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' < "$TEMP_BACKUP_DIR/database.dump"
  compose up -d --build --wait
  verify_application
}

sync_existing_source() {
  git_as_project_owner -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git_as_project_owner -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
  git_as_project_owner -C "$INSTALL_DIR" clean -fd -e .env -e .installer-owner
  repair_permissions
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
  printf 'Пароли больше не выводятся командами status. Сохраните их в менеджер паролей.\n'
}

install_app() {
  require_root
  local domain acme_email owner stage_dir
  [[ ! -e "$INSTALL_DIR" ]] || die "Каталог $INSTALL_DIR уже существует. Для установленного приложения используйте обновление."
  domain="$(ask_for_domain)"
  acme_email="$(ask_for_acme_email)"
  prepare_host
  check_dependencies
  owner="$(project_owner)"
  id "$owner" >/dev/null 2>&1 || die "Не найден пользователь, запустивший sudo: $owner"
  log "Загрузка независимого репозитория"
  stage_dir="$(mktemp -d -t "${PROGRAM_NAME}.install.XXXXXX")"
  chown "$owner:$owner" "$stage_dir"
  git_as_project_owner clone --depth 1 --branch "$BRANCH" --single-branch "$REPO_URL" "$stage_dir/source"
  printf '%s\n' "$owner" > "$stage_dir/source/.installer-owner"
  mv "$stage_dir/source" "$INSTALL_DIR"
  rmdir "$stage_dir"
  write_new_env "$domain"
  repair_permissions
  install_launcher
  setup_proxy "$acme_email"
  build_and_start
  show_credentials
}

update_app() {
  require_root
  prepare_host
  check_dependencies
  [[ -d "$INSTALL_DIR/.git" ]] || die "Menu TV 2.0 не установлен: $INSTALL_DIR"
  ensure_sftp_env
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

confirm_removal() {
  local phrase="$1" input
  printf '\nБудут затронуты только Menu TV 2.0: %s, %s, %s, %s и %s.\n' "$INSTALL_DIR" "$APP_CONTAINER" "$DB_CONTAINER" "$SFTP_CONTAINER" "$DB_VOLUME"
  printf 'Также будет удален SFTP-том: %s.\n' "$SFTP_VOLUME"
  read -r -p "Для подтверждения введите ${phrase}: " input
  [[ "$input" == "$phrase" ]]
}

remove_project() {
  require_root
  [[ -d "$INSTALL_DIR" ]] || die "Menu TV 2.0 не установлен."
  confirm_removal "УДАЛИТЬ" || { info "Удаление отменено."; return; }
  log "Остановка и удаление контейнеров Menu TV 2.0"
  compose down --volumes --rmi local --remove-orphans || true
  docker volume rm "$DB_VOLUME" >/dev/null 2>&1 || true
  docker volume rm "$SFTP_VOLUME" >/dev/null 2>&1 || true
  rm -rf -- "$INSTALL_DIR"
  info "Проект удалён. Скрипт оставлен: sudo $PROGRAM_NAME"
}

purge_project() {
  require_root
  [[ -d "$INSTALL_DIR" || -e "$LAUNCHER_PATH" ]] || die "Menu TV 2.0 не установлен."
  confirm_removal "УДАЛИТЬ_ВСЁ" || { info "Удаление отменено."; return; }
  if [[ -d "$INSTALL_DIR" ]]; then
    log "Полное удаление Menu TV 2.0"
    compose down --volumes --rmi local --remove-orphans || true
    docker volume rm "$DB_VOLUME" >/dev/null 2>&1 || true
    docker volume rm "$SFTP_VOLUME" >/dev/null 2>&1 || true
    rm -rf -- "$INSTALL_DIR"
  fi
  rm -f -- "$LAUNCHER_PATH"
  if [[ -d "$PROXY_DIR" ]]; then
    docker compose --project-name menu-tv-2-proxy --project-directory "$PROXY_DIR" --env-file "$PROXY_ENV_FILE" down --volumes --remove-orphans || true
    docker network rm "$PROXY_NETWORK" >/dev/null 2>&1 || true
    rm -rf -- "$PROXY_DIR"
  fi
  info "Проект, данные и системный скрипт удалены. Старый TV Menu не затронут."
}

status_app() {
  require_root
  [[ -d "$INSTALL_DIR" ]] || die "Menu TV 2.0 не установлен."
  printf 'Installation: %s\n' "$INSTALL_DIR"
  printf 'Revision: '
  git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown'
  printf '\nContainers:\n'
  docker ps --filter "name=^/${APP_CONTAINER}$" --filter "name=^/${DB_CONTAINER}$" --filter "name=^/${SFTP_CONTAINER}$" --format '  {{.Names}}  {{.Status}}  {{.Image}}'
  printf 'Health: '
  verify_application >/dev/null 2>&1 && printf 'OK\n' || printf 'FAILED\n'
  printf 'SFTP: '
  verify_sftp >/dev/null 2>&1 && printf 'OK\n' || printf 'FAILED\n'
}

menu() {
  while true; do
    printf '\n╔══════════════════ Menu TV 2.0 ══════════════════╗\n'
    printf '║  1. Установить                                   ║\n'
    printf '║  2. Обновить                                     ║\n'
    printf '║  3. Удалить проект                               ║\n'
    printf '║  4. Удалить проект и скрипт                      ║\n'
    printf '║  0. Выход                                        ║\n'
    printf '╚══════════════════════════════════════════════════╝\n'
    read -r -p 'Выберите действие: ' action
    case "$action" in
      1) install_app ;;
      2) update_app ;;
      3) remove_project ;;
      4) purge_project; return ;;
      0) return ;;
      *) warn "Выберите пункт от 0 до 4." ;;
    esac
  done
}

main() {
  case "${1:-menu}" in
    menu) menu ;;
    install) install_app ;;
    update) update_app ;;
    remove) remove_project ;;
    purge) purge_project ;;
    status) status_app ;;
    help|-h|--help) usage ;;
    *) die "Неизвестная команда: ${1:-}" ;;
  esac
}

main "$@"
