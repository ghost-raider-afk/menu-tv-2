#!/usr/bin/env bash
set -Eeuo pipefail

# Menu TV 2.0 is intentionally independent from the legacy TV Menu project.
PROGRAM_NAME="menu-tv-2.0"
SCRIPT_VERSION="1.3.4"
INSTALL_DIR="/opt/menu-tv-2.0"
REPO_URL="https://github.com/ghost-raider-afk/menu-tv-2.git"
PROJECT_REF_FILE="$INSTALL_DIR/.installer-ref"
BRANCH="${MENU_TV_REF:-}"
if [[ -z "$BRANCH" && -r "$PROJECT_REF_FILE" ]]; then
  BRANCH="$(head -n 1 "$PROJECT_REF_FILE")"
fi
BRANCH="${BRANCH:-main}"
SCRIPT_RAW_URL="https://raw.githubusercontent.com/ghost-raider-afk/menu-tv-2/$BRANCH/menu-tv-2.sh"
COMPOSE_PROJECT="menu-tv-2"
APP_SERVICE="app"
DB_SERVICE="db"
SFTP_SERVICE="sftp"
APP_CONTAINER="menu-tv-2.0"
DB_CONTAINER="menu-tv-2-db"
SFTP_CONTAINER="menu-tv-2-sftp"
DB_VOLUME="menu-tv-2-db-data"
SFTP_VOLUME="menu-tv-2-sftp-data"
SITE_ASSETS_VOLUME="menu-tv-2-site-assets"
PROXY_NETWORK="menu-tv-2-proxy"
PROXY_DIR="/opt/menu-tv-2-proxy"
PROXY_COMPOSE_FILE="$PROXY_DIR/compose.yaml"
PROXY_ENV_FILE="$PROXY_DIR/.env"
PROXY_CONTAINER="menu-tv-2-proxy"
LAUNCHER_PATH="/usr/local/bin/menu-tv-2.0"
PROJECT_OWNER_FILE="$INSTALL_DIR/.installer-owner"
TEMP_BACKUP_DIR=""
KEEP_TEMP_BACKUP=false
INITIAL_ADMIN_USERNAME=""
INITIAL_ADMIN_PASSWORD=""
UPDATE_PROGRESS_ACTIVE=false
UPDATE_LOG_FILE=""

log() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() {
  local message="$*"
  printf 'ERROR: %s\n' "$message" >&2
  if [[ "$UPDATE_PROGRESS_ACTIVE" == true ]]; then
    printf '\nОшибка обновления: %s\n' "$message" >&3
    if [[ -n "$UPDATE_LOG_FILE" && -s "$UPDATE_LOG_FILE" ]]; then
      printf 'Последние сообщения журнала:\n' >&3
      tail -n 40 "$UPDATE_LOG_FILE" | sed 's/^/  /' >&3 || true
      printf 'Полный журнал: %s\n' "$UPDATE_LOG_FILE" >&3
    fi
  fi
  exit 1
}

update_progress() {
  local percent="$1" label="${2:-}" width=32 filled index bar=""
  (( percent < 0 )) && percent=0
  (( percent > 100 )) && percent=100
  filled=$((percent * width / 100))
  for ((index = 0; index < width; index += 1)); do
    if (( index < filled )); then bar+="#"; else bar+="-"; fi
  done
  printf '\rОбновление [%s] %3d%%  %-34s' "$bar" "$percent" "$label" >&3
  if (( percent == 100 )); then
    printf '\n' >&3
  fi
  return 0
}

cleanup_temporary_backup() {
  if [[ -n "$TEMP_BACKUP_DIR" && -d "$TEMP_BACKUP_DIR" && "$KEEP_TEMP_BACKUP" != true ]]; then
    rm -rf -- "$TEMP_BACKUP_DIR"
  fi
}
trap cleanup_temporary_backup EXIT

project_version_from_file() {
  local file="$1" version
  [[ -r "$file" ]] || return 1
  version="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*$/\1/p' "$file" | head -n 1)"
  [[ -n "$version" ]] || return 1
  printf '%s\n' "$version"
}

project_version() {
  project_version_from_file "$INSTALL_DIR/package.json" 2>/dev/null || printf '%s\n' 'не установлена'
}

usage() {
  cat <<USAGE
Menu TV 2.0 — управление независимым приложением

Запуск меню после установки:
  sudo $PROGRAM_NAME

Команды:
  sudo $PROGRAM_NAME install
  sudo $PROGRAM_NAME update
  sudo $PROGRAM_NAME reset-admin-password [логин]
  sudo $PROGRAM_NAME check-script-update
  sudo $PROGRAM_NAME update-script
  sudo $PROGRAM_NAME remove
  sudo $PROGRAM_NAME remove-script
  sudo $PROGRAM_NAME purge
  sudo $PROGRAM_NAME status

Версия проекта: $(project_version)
Версия скрипта: $SCRIPT_VERSION
Ветка/реф: $BRANCH
Проект устанавливается только в: $INSTALL_DIR
Контейнеры: $APP_CONTAINER, $DB_CONTAINER, $SFTP_CONTAINER
USAGE
}

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Запустите через sudo."
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

script_version_from_file() {
  local file="$1" version
  version="$(sed -nE 's/^SCRIPT_VERSION="([0-9]+(\.[0-9]+){2})"$/\1/p' "$file" | head -n 1)"
  [[ -n "$version" ]] || return 1
  printf '%s\n' "$version"
}

fetch_latest_script() {
  local destination="$1"
  command_exists curl || { warn "Для проверки обновлений нужен curl."; return 1; }
  curl -fsSL --connect-timeout 10 --max-time 60 "$SCRIPT_RAW_URL" -o "$destination" || return 1
  bash -n "$destination" && script_version_from_file "$destination" >/dev/null
}

script_version_is_newer() {
  local current="$1" latest="$2"
  [[ "$current" != "$latest" ]] || return 1
  [[ "$(printf '%s\n%s\n' "$current" "$latest" | sort -V | tail -n 1)" == "$latest" ]]
}

check_script_update() {
  local latest_file latest_version
  latest_file="$(mktemp -t "${PROGRAM_NAME}.script.XXXXXX")"
  if ! fetch_latest_script "$latest_file"; then
    rm -f -- "$latest_file"
    die "Не удалось загрузить или проверить основной скрипт из GitHub."
  fi
  latest_version="$(script_version_from_file "$latest_file")"
  rm -f -- "$latest_file"

  printf 'Текущая версия скрипта: %s\n' "$SCRIPT_VERSION"
  printf 'Версия в GitHub:        %s\n' "$latest_version"
  if script_version_is_newer "$SCRIPT_VERSION" "$latest_version"; then
    info "Доступно обновление скрипта."
  elif [[ "$SCRIPT_VERSION" == "$latest_version" ]]; then
    info "Установлена актуальная версия скрипта."
  else
    info "Локальная версия скрипта новее версии в GitHub."
  fi
}

update_script() {
  local latest_file latest_version input owner
  require_root
  latest_file="$(mktemp -t "${PROGRAM_NAME}.script.XXXXXX")"
  if ! fetch_latest_script "$latest_file"; then
    rm -f -- "$latest_file"
    die "Не удалось загрузить или проверить основной скрипт из GitHub."
  fi
  latest_version="$(script_version_from_file "$latest_file")"

  printf 'Текущая версия скрипта: %s\n' "$SCRIPT_VERSION"
  printf 'Версия в GitHub:        %s\n' "$latest_version"
  if ! script_version_is_newer "$SCRIPT_VERSION" "$latest_version"; then
    rm -f -- "$latest_file"
    if [[ "$SCRIPT_VERSION" == "$latest_version" ]]; then
      info "Установлена актуальная версия скрипта."
    else
      info "Локальная версия скрипта новее версии в GitHub."
    fi
    return
  fi

  read -r -p 'Установить обновление скрипта? [y/N]: ' input
  if [[ "${input,,}" != y ]]; then
    rm -f -- "$latest_file"
    info "Обновление скрипта отменено."
    return
  fi

  install -o root -g root -m 0755 "$latest_file" "$LAUNCHER_PATH"
  if [[ -d "$INSTALL_DIR" ]]; then
    owner="$(project_owner)"
    id "$owner" >/dev/null 2>&1 || die "Не найден пользователь владельца проекта: $owner"
    install -o "$owner" -g "$owner" -m 0750 "$latest_file" "$INSTALL_DIR/menu-tv-2.sh"
  fi
  rm -f -- "$latest_file"
  info "Скрипт обновлён до версии $latest_version. Запускается новая версия."
  exec "$LAUNCHER_PATH"
}

handoff_update_to_latest_script() {
  local latest_file latest_version owner
  latest_file="$(mktemp -t "${PROGRAM_NAME}.script.XXXXXX")"
  if ! fetch_latest_script "$latest_file"; then
    rm -f -- "$latest_file"
    die "Не удалось проверить актуальность системного скрипта перед обновлением приложения."
  fi
  latest_version="$(script_version_from_file "$latest_file")"

  if ! script_version_is_newer "$SCRIPT_VERSION" "$latest_version"; then
    rm -f -- "$latest_file"
    return
  fi

  log "Обновление системного скрипта перед обновлением приложения"
  install -o root -g root -m 0755 "$latest_file" "$LAUNCHER_PATH"
  if [[ -d "$INSTALL_DIR" ]]; then
    owner="$(project_owner)"
    id "$owner" >/dev/null 2>&1 || die "Не найден пользователь владельца проекта: $owner"
    install -o "$owner" -g "$owner" -m 0750 "$latest_file" "$INSTALL_DIR/menu-tv-2.sh"
  fi
  rm -f -- "$latest_file"
  info "Системный скрипт обновлён с $SCRIPT_VERSION до $latest_version."
  info "Обновление приложения продолжается уже новой версией установщика."
  if [[ "$UPDATE_PROGRESS_ACTIVE" == true ]]; then
    printf '\n' >&3
    exec 1>&3 2>&3
    exec 3>&-
    UPDATE_PROGRESS_ACTIVE=false
    [[ -z "$UPDATE_LOG_FILE" ]] || rm -f -- "$UPDATE_LOG_FILE"
    UPDATE_LOG_FILE=""
  fi
  exec "$LAUNCHER_PATH" update
}

require_ubuntu() {
  [[ -r /etc/os-release ]] || die "Не удалось определить операционную систему."
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ "${ID:-}" == ubuntu ]] || die "Установщик поддерживает Ubuntu. Обнаружена: ${PRETTY_NAME:-неизвестно}."
}

install_base_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl dnsutils git openssl
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
  if ! command_exists git || ! command_exists curl || ! command_exists dig || ! command_exists openssl; then
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
  for tool in docker git tar openssl awk sed find install mktemp runuser od tr fold shuf dig cmp; do
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

delete_env_value() {
  local file="$1" key="$2"
  sed -i "/^${key}=/d" "$file"
}

validate_domain() {
  local domain="${1,,}"
  [[ "$domain" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] || return 1
  [[ "$domain" != *..* ]] || return 1
  printf '%s\n' "$domain"
}

public_ip() {
  local family="$1" endpoint ip
  for endpoint in https://api.ipify.org https://ifconfig.me/ip; do
    ip="$(curl "-$family" -fsS --connect-timeout 5 --max-time 10 "$endpoint" 2>/dev/null || true)"
    [[ -n "$ip" ]] && { printf '%s\n' "$ip"; return 0; }
  done
  return 1
}

domain_points_to_this_vps() {
  local domain="$1" ipv4 ipv6 records
  ipv4="$(public_ip 4 || true)"
  if [[ -n "$ipv4" ]]; then
    records="$(dig +short A "$domain" | sort -u)"
    grep -Fxq "$ipv4" <<< "$records" && return 0
  fi
  ipv6="$(public_ip 6 || true)"
  if [[ -n "$ipv6" ]]; then
    records="$(dig +short AAAA "$domain" | sort -u)"
    grep -Fxq "$ipv6" <<< "$records" && return 0
  fi
  return 1
}

ask_for_domain() {
  local input domain
  [[ -t 0 ]] || die "Для первой установки нужен интерактивный терминал."
  while true; do
    read -r -p "Введите домен Menu TV 2.0: " input
    domain="$(validate_domain "$input" || true)"
    if [[ -z "$domain" ]]; then
      warn "Введите домен без https://, например menu.example.com."
      continue
    fi
    if domain_points_to_this_vps "$domain"; then
      printf '%s\n' "$domain"
      return
    fi
    warn "DNS-запись $domain не указывает на публичный IP этого VPS. Проверьте A/AAAA-запись и повторите ввод."
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
  INITIAL_ADMIN_USERNAME="admin"
  INITIAL_ADMIN_PASSWORD="$(random_admin_password)"
  set_env_value "$env_file" BOOTSTRAP_ADMIN_USERNAME "$INITIAL_ADMIN_USERNAME"
  set_env_value "$env_file" BOOTSTRAP_ADMIN_PASSWORD "$INITIAL_ADMIN_PASSWORD"
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
  local env_file="$INSTALL_DIR/.env" domain app_name
  [[ -f "$env_file" ]] || die "Отсутствует $env_file"
  domain="$(env_value MENU_TV_2_DOMAIN "$env_file")"
  [[ -n "$domain" ]] || die "MENU_TV_2_DOMAIN в .env не настроен."
  app_name="$(env_value APP_NAME "$env_file")"
  if [[ -z "$app_name" || "$app_name" == "Menu TV 2.0" ]]; then
    set_env_value "$env_file" APP_NAME "ТВ МЕНЮ"
  fi
  [[ -n "$(env_value NODE_ENV "$env_file")" ]] || set_env_value "$env_file" NODE_ENV "production"
  [[ -n "$(env_value HOST "$env_file")" ]] || set_env_value "$env_file" HOST "0.0.0.0"
  [[ -n "$(env_value PORT "$env_file")" ]] || set_env_value "$env_file" PORT "8080"
  [[ -n "$(env_value POSTGRES_HOST "$env_file")" ]] || set_env_value "$env_file" POSTGRES_HOST "db"
  [[ -n "$(env_value POSTGRES_PORT "$env_file")" ]] || set_env_value "$env_file" POSTGRES_PORT "5432"
  [[ -n "$(env_value POSTGRES_POOL_MAX "$env_file")" ]] || set_env_value "$env_file" POSTGRES_POOL_MAX "5"
  [[ -n "$(env_value POSTGRES_CONNECTION_TIMEOUT_MS "$env_file")" ]] || set_env_value "$env_file" POSTGRES_CONNECTION_TIMEOUT_MS "5000"
  [[ -n "$(env_value POSTGRES_IDLE_TIMEOUT_MS "$env_file")" ]] || set_env_value "$env_file" POSTGRES_IDLE_TIMEOUT_MS "30000"
  [[ -n "$(env_value SESSION_TTL_HOURS "$env_file")" ]] || set_env_value "$env_file" SESSION_TTL_HOURS "12"
  [[ -n "$(env_value SECURE_COOKIES "$env_file")" ]] || set_env_value "$env_file" SECURE_COOKIES "true"
  [[ -n "$(env_value DEVICE_ACTIVATION_TTL_MINUTES "$env_file")" ]] || set_env_value "$env_file" DEVICE_ACTIVATION_TTL_MINUTES "10"
  [[ -n "$(env_value DEVICE_ACTIVATION_POLL_SECONDS "$env_file")" ]] || set_env_value "$env_file" DEVICE_ACTIVATION_POLL_SECONDS "2"
  [[ -n "$(env_value DEVICE_SESSION_TTL_DAYS "$env_file")" ]] || set_env_value "$env_file" DEVICE_SESSION_TTL_DAYS "365"
  [[ -n "$(env_value DEVICE_HEARTBEAT_WRITE_SECONDS "$env_file")" ]] || set_env_value "$env_file" DEVICE_HEARTBEAT_WRITE_SECONDS "30"
  [[ -n "$(env_value PLAYER_REFRESH_SECONDS "$env_file")" ]] || set_env_value "$env_file" PLAYER_REFRESH_SECONDS "5"
  [[ -n "$(env_value PASSWORD_MIN_LENGTH "$env_file")" ]] || set_env_value "$env_file" PASSWORD_MIN_LENGTH "10"
  [[ -n "$(env_value PASSWORD_MAX_LENGTH "$env_file")" ]] || set_env_value "$env_file" PASSWORD_MAX_LENGTH "32"
  [[ -n "$(env_value GENERATED_PASSWORD_LENGTH "$env_file")" ]] || set_env_value "$env_file" GENERATED_PASSWORD_LENGTH "10"
  [[ -n "$(env_value LOGIN_MAX_ATTEMPTS "$env_file")" ]] || set_env_value "$env_file" LOGIN_MAX_ATTEMPTS "8"
  [[ -n "$(env_value LOGIN_IP_MAX_ATTEMPTS "$env_file")" ]] || set_env_value "$env_file" LOGIN_IP_MAX_ATTEMPTS "32"
  [[ -n "$(env_value LOGIN_WINDOW_MINUTES "$env_file")" ]] || set_env_value "$env_file" LOGIN_WINDOW_MINUTES "15"
  [[ -n "$(env_value LOGIN_LIMITER_MAX_ENTRIES "$env_file")" ]] || set_env_value "$env_file" LOGIN_LIMITER_MAX_ENTRIES "500"
  [[ -n "$(env_value JSON_BODY_MAX_BYTES "$env_file")" ]] || set_env_value "$env_file" JSON_BODY_MAX_BYTES "65536"
  [[ -n "$(env_value CATALOG_CSV_MAX_BYTES "$env_file")" ]] || set_env_value "$env_file" CATALOG_CSV_MAX_BYTES "5242880"
  [[ -n "$(env_value MENU_DRAFT_MAX_BYTES "$env_file")" ]] || set_env_value "$env_file" MENU_DRAFT_MAX_BYTES "49152"
  [[ -n "$(env_value SCREEN_SOURCE_MAX_BYTES "$env_file")" ]] || set_env_value "$env_file" SCREEN_SOURCE_MAX_BYTES "12582912"
  [[ -n "$(env_value DASHBOARD_REFRESH_MIN_SECONDS "$env_file")" ]] || set_env_value "$env_file" DASHBOARD_REFRESH_MIN_SECONDS "15"
  [[ -n "$(env_value DASHBOARD_REFRESH_MAX_SECONDS "$env_file")" ]] || set_env_value "$env_file" DASHBOARD_REFRESH_MAX_SECONDS "300"
  [[ -n "$(env_value SCREEN_MAX_WIDTH "$env_file")" ]] || set_env_value "$env_file" SCREEN_MAX_WIDTH "1920"
  [[ -n "$(env_value SCREEN_MAX_HEIGHT "$env_file")" ]] || set_env_value "$env_file" SCREEN_MAX_HEIGHT "1080"
  [[ -n "$(env_value IMAGE_MAX_PIXELS "$env_file")" ]] || set_env_value "$env_file" IMAGE_MAX_PIXELS "40000000"
  [[ -n "$(env_value HEALTH_READINESS_CACHE_MS "$env_file")" ]] || set_env_value "$env_file" HEALTH_READINESS_CACHE_MS "2000"
  [[ -n "$(env_value SITE_ASSETS_ROOT "$env_file")" ]] || set_env_value "$env_file" SITE_ASSETS_ROOT "/srv/menu-tv-site-assets"
  [[ -n "$(env_value SITE_LOGO_MAX_BYTES "$env_file")" ]] || set_env_value "$env_file" SITE_LOGO_MAX_BYTES "2097152"
  [[ -n "$(env_value SITE_FAVICON_MAX_BYTES "$env_file")" ]] || set_env_value "$env_file" SITE_FAVICON_MAX_BYTES "524288"
  [[ -n "$(env_value SCREEN_BACKGROUND_MAX_BYTES "$env_file")" ]] || set_env_value "$env_file" SCREEN_BACKGROUND_MAX_BYTES "20971520"
  delete_env_value "$env_file" TEMPLATE_BACKGROUND_MAX_BYTES
  [[ -n "$(env_value SFTP_PUBLIC_HOST "$env_file")" ]] || set_env_value "$env_file" SFTP_PUBLIC_HOST "$domain"
  [[ -n "$(env_value SFTP_PORT "$env_file")" ]] || set_env_value "$env_file" SFTP_PORT "2022"
  [[ -n "$(env_value SFTP_API_URL "$env_file")" ]] || set_env_value "$env_file" SFTP_API_URL "http://sftp:8080"
  [[ -n "$(env_value SFTP_API_TIMEOUT_MS "$env_file")" ]] || set_env_value "$env_file" SFTP_API_TIMEOUT_MS "5000"
  [[ -n "$(env_value SFTP_STORAGE_ROOT "$env_file")" ]] || set_env_value "$env_file" SFTP_STORAGE_ROOT "/srv/menu-tv-sftp"
  [[ -n "$(env_value SFTP_STAGING_MAX_AGE_HOURS "$env_file")" ]] || set_env_value "$env_file" SFTP_STAGING_MAX_AGE_HOURS "24"
  [[ -n "$(env_value SFTP_ADMIN_USERNAME "$env_file")" ]] || set_env_value "$env_file" SFTP_ADMIN_USERNAME "menu_tv_2_service"
  [[ -n "$(env_value SEED_DEMO_DATA "$env_file")" ]] || set_env_value "$env_file" SEED_DEMO_DATA "false"
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
  for key in MENU_TV_2_DOMAIN POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD SESSION_SECRET SFTP_PUBLIC_HOST SFTP_PORT SFTP_ADMIN_USERNAME SFTP_ADMIN_PASSWORD SCREEN_BACKGROUND_MAX_BYTES DEVICE_ACTIVATION_TTL_MINUTES DEVICE_ACTIVATION_POLL_SECONDS DEVICE_SESSION_TTL_DAYS DEVICE_HEARTBEAT_WRITE_SECONDS PLAYER_REFRESH_SECONDS; do
    value="$(env_value "$key")"
    [[ -n "$value" && "$value" != replace-with-* ]] || die "$key в .env не настроен."
  done
  [[ $(env_value POSTGRES_PASSWORD | wc -c) -ge 17 ]] || die "POSTGRES_PASSWORD должен содержать не менее 16 символов."
  if [[ -n "$(env_value BOOTSTRAP_ADMIN_USERNAME)" || -n "$(env_value BOOTSTRAP_ADMIN_PASSWORD)" ]]; then
    [[ -n "$(env_value BOOTSTRAP_ADMIN_USERNAME)" && -n "$(env_value BOOTSTRAP_ADMIN_PASSWORD)" ]] || die "Для начального администратора нужны BOOTSTRAP_ADMIN_USERNAME и BOOTSTRAP_ADMIN_PASSWORD."
    [[ $(env_value BOOTSTRAP_ADMIN_PASSWORD | wc -c) -ge 11 ]] || die "BOOTSTRAP_ADMIN_PASSWORD должен содержать не менее 10 символов."
  fi
  if [[ -n "$(env_value ADMIN_USERNAME)" || -n "$(env_value ADMIN_PASSWORD)" ]]; then
    [[ -n "$(env_value ADMIN_USERNAME)" && -n "$(env_value ADMIN_PASSWORD)" ]] || die "Для переноса старого администратора нужны ADMIN_USERNAME и ADMIN_PASSWORD."
    [[ $(env_value ADMIN_PASSWORD | wc -c) -ge 11 ]] || die "ADMIN_PASSWORD должен содержать не менее 10 символов."
  fi
  [[ $(env_value SESSION_SECRET | wc -c) -ge 33 ]] || die "SESSION_SECRET должен содержать не менее 32 символов."
  [[ $(env_value SFTP_ADMIN_PASSWORD | wc -c) -ge 33 ]] || die "SFTP_ADMIN_PASSWORD должен содержать не менее 32 символов."
}

finalize_bootstrap_administrator() {
  local env_file="$INSTALL_DIR/.env" username password
  username="$(env_value BOOTSTRAP_ADMIN_USERNAME "$env_file")"
  password="$(env_value BOOTSTRAP_ADMIN_PASSWORD "$env_file")"
  if [[ -z "$username" && -z "$password" ]]; then
    username="$(env_value ADMIN_USERNAME "$env_file")"
    password="$(env_value ADMIN_PASSWORD "$env_file")"
  fi
  [[ -n "$username" && -n "$password" ]] || return 0
  administrator_is_persisted || die "Учётная запись администратора ещё не подтверждена в PostgreSQL; пароль оставлен в .env."
  [[ -n "$INITIAL_ADMIN_USERNAME" ]] || INITIAL_ADMIN_USERNAME="$username"
  [[ -n "$INITIAL_ADMIN_PASSWORD" ]] || INITIAL_ADMIN_PASSWORD="$password"
  delete_env_value "$env_file" BOOTSTRAP_ADMIN_USERNAME
  delete_env_value "$env_file" BOOTSTRAP_ADMIN_PASSWORD
  delete_env_value "$env_file" ADMIN_USERNAME
  delete_env_value "$env_file" ADMIN_PASSWORD
  chown root:root "$env_file"
  chmod 600 "$env_file"
  info "Учётная запись администратора перенесена в PostgreSQL; пароль удалён из .env."
}

administrator_is_persisted() {
  compose exec -T "$DB_SERVICE" sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" psql -qtAX -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1 FROM web_users LIMIT 1;"' 2>/dev/null | grep -qx '1'
}

bootstrap_administrator_is_configured() {
  [[ -n "$(env_value BOOTSTRAP_ADMIN_USERNAME)" || -n "$(env_value BOOTSTRAP_ADMIN_PASSWORD)" || -n "$(env_value ADMIN_USERNAME)" || -n "$(env_value ADMIN_PASSWORD)" ]]
}

repair_permissions() {
  local owner mode="${1:-minimal}"
  [[ -d "$INSTALL_DIR" ]] || return 0
  owner="$(project_owner)"
  id "$owner" >/dev/null 2>&1 || die "Не найден пользователь владельца проекта: $owner"
  if [[ "$mode" == full ]]; then
    chown -R "$owner:$owner" "$INSTALL_DIR"
    find "$INSTALL_DIR" -type d -exec chmod 750 {} +
    find "$INSTALL_DIR" -type f -exec chmod 640 {} +
  else
    chown "$owner:$owner" "$INSTALL_DIR"
  fi
  [[ ! -f "$INSTALL_DIR/menu-tv-2.sh" ]] || {
    chown "$owner:$owner" "$INSTALL_DIR/menu-tv-2.sh"
    chmod 750 "$INSTALL_DIR/menu-tv-2.sh"
  }
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
    if compose exec -T "$DB_SERVICE" sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  die "PostgreSQL не стал доступен за 60 секунд."
}

verify_application() {
  compose exec -T "$APP_SERVICE" node -e "fetch('http://127.0.0.1:8080/readyz').then((r) => { if (!r.ok) process.exit(1); return r.json(); }).then((body) => process.exit(body.service === 'menu-tv-2.0' && body.status === 'ready' ? 0 : 1)).catch(() => process.exit(1))"
}

verify_sftp() {
  compose exec -T "$SFTP_SERVICE" sftpgo ping
}

verify_https_certificate() {
  local domain="$1" attempt issuer
  for attempt in $(seq 1 24); do
    if curl --resolve "$domain:443:127.0.0.1" --fail --silent --show-error --max-time 10 "https://$domain/healthz" >/dev/null 2>&1; then
      issuer="$(openssl s_client -connect 127.0.0.1:443 -servername "$domain" </dev/null 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null || true)"
      info "HTTPS-сертификат для $domain успешно получен и проверен."
      [[ -z "$issuer" ]] || info "$issuer"
      return 0
    fi
    if (( attempt < 24 )); then
      info "Ожидание выпуска HTTPS-сертификата для $domain: попытка $attempt/24."
      sleep 5
    fi
  done

  warn "HTTPS-сертификат для $domain не получен за 2 минуты."
  warn "Последние сообщения Traefik:"
  docker logs --tail 20 "$PROXY_CONTAINER" 2>&1 | sed 's/^/    /' >&2 || true
  return 1
}

build_and_start() {
  local mode="${1:-build}" check_https="${2:-true}" domain
  validate_env
  domain="$(env_value MENU_TV_2_DOMAIN)"
  assert_proxy_network
  repair_permissions
  log "Проверка конфигурации Docker Compose"
  compose config -q || return 1
  if [[ "$mode" == build ]]; then
    log "Сборка и запуск изменённых контейнеров"
    compose up -d --build --wait || { show_app_failure; return 1; }
  else
    log "Применение изменённой конфигурации контейнеров"
    compose up -d --wait || { show_app_failure; return 1; }
  fi
  log "Проверка готовности приложения"
  verify_application || { show_app_failure; return 1; }
  log "Проверка SFTP-сервера"
  verify_sftp || return 1
  if [[ "$check_https" == true ]]; then
    log "Выпуск и проверка HTTPS-сертификата Let's Encrypt"
    verify_https_certificate "$domain" || return 1
  fi
  finalize_bootstrap_administrator
}

show_app_failure() {
  warn "Журнал контейнера Menu TV 2.0 (последние 120 строк):"
  compose logs --tail=120 "$APP_SERVICE" >&2 || true
}

source_requires_runtime_update() {
  local files="$1" file
  while IFS= read -r file; do
    case "$file" in
      Dockerfile|compose.yaml|package.json|package-lock.json|src/*) return 0 ;;
    esac
  done <<< "$files"
  return 1
}

source_requires_image_rebuild() {
  local files="$1" file
  while IFS= read -r file; do
    case "$file" in
      Dockerfile|package.json|package-lock.json|src/*) return 0 ;;
    esac
  done <<< "$files"
  return 1
}

source_requires_database_backup() {
  local files="$1" file
  while IFS= read -r file; do
    case "$file" in
      compose.yaml|src/db.js|src/db/*|migrations/*) return 0 ;;
    esac
  done <<< "$files"
  return 1
}

fetch_remote_revision() {
  git_as_project_owner -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git_as_project_owner -C "$INSTALL_DIR" rev-parse FETCH_HEAD
}

create_temporary_backup() {
  local with_database="${1:-false}"
  [[ -d "$INSTALL_DIR/.git" ]] || die "Каталог исходников не является Git-репозиторием: $INSTALL_DIR"
  TEMP_BACKUP_DIR="$(mktemp -d -t "${PROGRAM_NAME}.update.XXXXXX")"
  chmod 700 "$TEMP_BACKUP_DIR"
  log "Создание временной резервной копии исходников"
  tar --exclude='./.git' --exclude='./.env' --exclude='./node_modules' -C "$INSTALL_DIR" -czf "$TEMP_BACKUP_DIR/source.tar.gz" .
  cp "$INSTALL_DIR/.env" "$TEMP_BACKUP_DIR/.env"
  chmod 600 "$TEMP_BACKUP_DIR/.env"
  git -C "$INSTALL_DIR" rev-parse HEAD > "$TEMP_BACKUP_DIR/git-revision"
  if [[ "$with_database" == true ]]; then
    log "Создание резервной копии базы данных"
    compose exec -T "$DB_SERVICE" sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "$TEMP_BACKUP_DIR/database.dump"
  fi
  info "Временный бэкап создан и будет удалён после завершения операции."
}

restore_temporary_backup() {
  [[ -n "$TEMP_BACKUP_DIR" && -f "$TEMP_BACKUP_DIR/source.tar.gz" && -f "$TEMP_BACKUP_DIR/.env" && -f "$TEMP_BACKUP_DIR/git-revision" ]] || return 1
  warn "Обновление не прошло проверку. Выполняется автоматическое восстановление."
  compose down --remove-orphans || true
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name '.git' ! -name '.env' -exec rm -rf -- {} +
  tar -C "$INSTALL_DIR" -xzf "$TEMP_BACKUP_DIR/source.tar.gz"
  cp "$TEMP_BACKUP_DIR/.env" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
  git -C "$INSTALL_DIR" reset --hard "$(<"$TEMP_BACKUP_DIR/git-revision")"
  repair_permissions full
  install_launcher
  if [[ -f "$TEMP_BACKUP_DIR/database.dump" ]]; then
    compose up -d "$DB_SERVICE"
    wait_for_database
    compose exec -T "$DB_SERVICE" sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' < "$TEMP_BACKUP_DIR/database.dump"
  fi
  compose up -d --build --wait
  verify_application
}

recover_failed_update() {
  if [[ -z "$TEMP_BACKUP_DIR" ]]; then
    die "Обновление не прошло проверку. Контейнеры не удалялись; проверьте конфигурацию и повторите попытку."
  fi
  if restore_temporary_backup; then
    die "Обновление отменено: предыдущая версия и данные автоматически восстановлены."
  fi
  KEEP_TEMP_BACKUP=true
  die "Автоматическое восстановление не завершилось. Временная копия сохранена: $TEMP_BACKUP_DIR"
}

sync_existing_source() {
  local revision="$1"
  git_as_project_owner -C "$INSTALL_DIR" reset --hard "$revision"
  git_as_project_owner -C "$INSTALL_DIR" clean -fd -e .env -e .installer-owner -e .installer-ref
  repair_permissions
  install_launcher
}

credentials_box_text() {
  local LC_ALL=C.UTF-8 text="$1" padding
  padding=$((78 - ${#text}))
  (( padding >= 0 )) || padding=0
  printf '|%s%*s|\n' "$text" "$padding" ''
}

credentials_box_value() {
  local LC_ALL=C.UTF-8 label="$1" value="$2" color="$3" prefix chunk padding
  prefix="  ${label}: "
  if (( ${#prefix} + ${#value} <= 78 )); then
    padding=$((78 - ${#prefix} - ${#value}))
    printf '|%s' "$prefix"
    printf '%b%s%b' "$color" "$value" "$CREDENTIALS_COLOR_RESET"
    printf '%*s|\n' "$padding" ''
    return
  fi

  credentials_box_text "  ${label}:"
  while [[ -n "$value" ]]; do
    chunk="${value:0:74}"
    value="${value:${#chunk}}"
    padding=$((74 - ${#chunk}))
    printf '|    '
    printf '%b%s%b' "$color" "$chunk" "$CREDENTIALS_COLOR_RESET"
    printf '%*s|\n' "$padding" ''
  done
}

show_credentials() {
  local env_file="$INSTALL_DIR/.env" domain credentials_color_url credentials_color_login credentials_color_password
  domain="$(env_value MENU_TV_2_DOMAIN "$env_file")"
  CREDENTIALS_COLOR_RESET=''
  credentials_color_url=''
  credentials_color_login=''
  credentials_color_password=''
  if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
    CREDENTIALS_COLOR_RESET=$'\033[0m'
    credentials_color_url=$'\033[1;36m'
    credentials_color_login=$'\033[1;32m'
    credentials_color_password=$'\033[1;33m'
  fi

  printf '\n+------------------------------------------------------------------------------+\n'
  credentials_box_text '  MENU TV 2.0 — СОХРАНИТЕ ПАРАМЕТРЫ'
  printf '|------------------------------------------------------------------------------|\n'
  credentials_box_value 'Версия проекта' "$(project_version)" ''
  credentials_box_value 'Веб-адрес' "https://$domain" "$credentials_color_url"
  credentials_box_value 'Логин администратора' "$INITIAL_ADMIN_USERNAME" "$credentials_color_login"
  credentials_box_value 'Пароль администратора' "$INITIAL_ADMIN_PASSWORD" "$credentials_color_password"
  printf '|------------------------------------------------------------------------------|\n'
  credentials_box_value 'Хост БД' 'db (доступен только внутри сети menu-tv-2-internal)' ''
  credentials_box_value 'Имя БД' "$(env_value POSTGRES_DB "$env_file")" ''
  credentials_box_value 'Пользователь БД' "$(env_value POSTGRES_USER "$env_file")" ''
  credentials_box_value 'Пароль БД' "$(env_value POSTGRES_PASSWORD "$env_file")" ''
  credentials_box_value 'Env-файл' "$env_file" ''
  credentials_box_value 'Ветка/реф' "$BRANCH" ''
  printf '+------------------------------------------------------------------------------+\n'
  printf 'Пароли больше не выводятся командами status. Сохраните их в менеджер паролей.\n'
}

cleanup_failed_install() {
  warn "Установка не завершилась. Удаляются только созданные ресурсы Menu TV 2.0."
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    docker compose --project-name "$COMPOSE_PROJECT" --project-directory "$INSTALL_DIR" --env-file "$INSTALL_DIR/.env" down --volumes --rmi local --remove-orphans || true
  fi
  docker volume rm "$DB_VOLUME" >/dev/null 2>&1 || true
  docker volume rm "$SFTP_VOLUME" >/dev/null 2>&1 || true
  docker volume rm "$SITE_ASSETS_VOLUME" >/dev/null 2>&1 || true
  rm -rf -- "$INSTALL_DIR"
  if [[ -d "$PROXY_DIR" ]]; then
    docker compose --project-name menu-tv-2-proxy --project-directory "$PROXY_DIR" --env-file "$PROXY_ENV_FILE" down --volumes --remove-orphans || true
    docker network rm "$PROXY_NETWORK" >/dev/null 2>&1 || true
    rm -rf -- "$PROXY_DIR"
  fi
  info "Ресурсы неудачной установки удалены."
}

install_app() {
  require_root
  local domain acme_email owner stage_dir
  [[ ! -e "$INSTALL_DIR" ]] || die "Каталог $INSTALL_DIR уже существует. Для установленного приложения используйте обновление."
  prepare_host
  check_dependencies
  domain="$(ask_for_domain)"
  acme_email="$(ask_for_acme_email)"
  owner="$(project_owner)"
  id "$owner" >/dev/null 2>&1 || die "Не найден пользователь, запустивший sudo: $owner"
  log "Загрузка независимого репозитория ($BRANCH)"
  stage_dir="$(mktemp -d -t "${PROGRAM_NAME}.install.XXXXXX")"
  chown "$owner:$owner" "$stage_dir"
  git_as_project_owner clone --depth 1 --branch "$BRANCH" --single-branch "$REPO_URL" "$stage_dir/source"
  printf '%s\n' "$owner" > "$stage_dir/source/.installer-owner"
  printf '%s\n' "$BRANCH" > "$stage_dir/source/.installer-ref"
  mv "$stage_dir/source" "$INSTALL_DIR"
  rmdir "$stage_dir"
  write_new_env "$domain"
  repair_permissions full
  install_launcher
  if ! setup_proxy "$acme_email" || ! build_and_start; then
    cleanup_failed_install
    die "Установка не завершилась. Исправьте ошибку и запустите установку заново."
  fi
  show_credentials
}

update_app() {
  local env_before remote_revision changed_files source_changed=false env_changed=false needs_runtime=false needs_build=false needs_database_backup=false final_message
  require_root
  [[ -d "$INSTALL_DIR/.git" ]] || die "Menu TV 2.0 не установлен: $INSTALL_DIR"

  UPDATE_LOG_FILE="$(mktemp -t "${PROGRAM_NAME}.update-log.XXXXXX")"
  chmod 600 "$UPDATE_LOG_FILE"
  exec 3>&1
  UPDATE_PROGRESS_ACTIVE=true
  exec >>"$UPDATE_LOG_FILE" 2>&1

  update_progress 0 "Подготовка"
  if ! prepare_host; then die "Не удалось подготовить систему к обновлению."; fi
  update_progress 10 "Проверка системы"
  if ! check_dependencies; then die "Проверка зависимостей не пройдена."; fi
  update_progress 18 "Проверка установщика"
  handoff_update_to_latest_script

  env_before="$(mktemp -t "${PROGRAM_NAME}.env.XXXXXX")"
  cp "$INSTALL_DIR/.env" "$env_before"
  update_progress 25 "Проверка конфигурации"
  ensure_sftp_env
  validate_env
  if ! cmp -s "$env_before" "$INSTALL_DIR/.env"; then
    env_changed=true
  fi
  rm -f -- "$env_before"

  update_progress 35 "Проверка репозитория"
  if ! remote_revision="$(fetch_remote_revision)"; then
    die "Не удалось получить актуальную ревизию проекта."
  fi
  if ! git_as_project_owner -C "$INSTALL_DIR" diff --quiet HEAD "$remote_revision"; then
    source_changed=true
    changed_files="$(git_as_project_owner -C "$INSTALL_DIR" diff --name-only HEAD "$remote_revision")"
    source_requires_runtime_update "$changed_files" && needs_runtime=true
    source_requires_image_rebuild "$changed_files" && needs_build=true
    source_requires_database_backup "$changed_files" && needs_database_backup=true
  fi
  update_progress 45 "Анализ изменений"

  if [[ "$source_changed" == false && "$env_changed" == false ]]; then
    final_message="Уже актуально. Версия проекта: $(project_version)"
    update_progress 100 "Готово"
    exec 1>&3 2>&3
    exec 3>&-
    UPDATE_PROGRESS_ACTIVE=false
    rm -f -- "$UPDATE_LOG_FILE"
    UPDATE_LOG_FILE=""
    printf '%s\n' "$final_message"
    return
  fi

  if [[ "$source_changed" == true ]]; then
    if [[ "$needs_runtime" == true ]]; then
      update_progress 55 "Резервная копия"
      if ! create_temporary_backup "$needs_database_backup"; then
        die "Не удалось создать резервную копию перед обновлением."
      fi
    fi
    update_progress 65 "Применение исходников"
    if ! sync_existing_source "$remote_revision"; then
      die "Не удалось применить обновление исходников."
    fi
  fi

  update_progress 72 "Применение конфигурации"
  if bootstrap_administrator_is_configured && administrator_is_persisted; then
    finalize_bootstrap_administrator
    env_changed=true
  fi

  if [[ "$needs_runtime" == false && "$env_changed" == false ]]; then
    final_message="Обновлены служебные файлы. Версия проекта: $(project_version)"
    update_progress 100 "Готово"
    exec 1>&3 2>&3
    exec 3>&-
    UPDATE_PROGRESS_ACTIVE=false
    rm -f -- "$UPDATE_LOG_FILE"
    UPDATE_LOG_FILE=""
    printf '%s\n' "$final_message"
    return
  fi

  update_progress 82 "$([[ "$needs_build" == true ]] && printf 'Сборка контейнеров' || printf 'Запуск контейнеров')"
  if [[ "$needs_build" == true ]]; then
    if ! build_and_start build false; then recover_failed_update; fi
  elif ! build_and_start apply false; then
    recover_failed_update
  fi

  update_progress 96 "Финальная проверка"
  final_message="Обновление завершено. Версия проекта: $(project_version)"
  update_progress 100 "Готово"
  exec 1>&3 2>&3
  exec 3>&-
  UPDATE_PROGRESS_ACTIVE=false
  rm -f -- "$UPDATE_LOG_FILE"
  UPDATE_LOG_FILE=""
  printf '%s\n' "$final_message"
}

reset_admin_password() {
  local username="${1:-}"
  require_root
  [[ -d "$INSTALL_DIR/.git" ]] || die "Menu TV 2.0 не установлен: $INSTALL_DIR"
  [[ -f "$INSTALL_DIR/.env" ]] || die "Отсутствует $INSTALL_DIR/.env"
  command_exists docker || die "Не найдена команда: docker"
  docker info >/dev/null 2>&1 || die "Docker daemon недоступен."
  docker compose version >/dev/null 2>&1 || die "Нужен Docker Compose v2."
  verify_application >/dev/null 2>&1 || die "Контейнер приложения не готов. Сначала запустите или обновите Menu TV 2.0."
  log "Сброс пароля администратора"
  if [[ -n "$username" ]]; then
    compose exec -T "$APP_SERVICE" node src/cli/reset-admin-password.js "$username"
  else
    compose exec -T "$APP_SERVICE" node src/cli/reset-admin-password.js
  fi
}

confirm_removal() {
  local input
  printf '\nБудут затронуты только Menu TV 2.0: %s, %s, %s, %s и %s.\n' "$INSTALL_DIR" "$APP_CONTAINER" "$DB_CONTAINER" "$SFTP_CONTAINER" "$DB_VOLUME"
  printf 'Также будут удалены тома SFTP и оформления сайта: %s, %s.\n' "$SFTP_VOLUME" "$SITE_ASSETS_VOLUME"
  read -r -p 'Подтвердить удаление? [y/N]: ' input
  [[ "${input,,}" == y ]]
}

remove_project() {
  require_root
  [[ -d "$INSTALL_DIR" ]] || die "Menu TV 2.0 не установлен."
  confirm_removal || { info "Удаление отменено."; return; }
  log "Остановка и удаление контейнеров Menu TV 2.0"
  compose down --volumes --rmi local --remove-orphans || true
  docker volume rm "$DB_VOLUME" >/dev/null 2>&1 || true
  docker volume rm "$SFTP_VOLUME" >/dev/null 2>&1 || true
  docker volume rm "$SITE_ASSETS_VOLUME" >/dev/null 2>&1 || true
  rm -rf -- "$INSTALL_DIR"
  info "Проект удалён. Скрипт оставлен: sudo $PROGRAM_NAME"
}

purge_project() {
  require_root
  [[ -d "$INSTALL_DIR" || -e "$LAUNCHER_PATH" ]] || die "Menu TV 2.0 не установлен."
  confirm_removal || { info "Удаление отменено."; return; }
  if [[ -d "$INSTALL_DIR" ]]; then
    log "Полное удаление Menu TV 2.0"
    compose down --volumes --rmi local --remove-orphans || true
    docker volume rm "$DB_VOLUME" >/dev/null 2>&1 || true
    docker volume rm "$SFTP_VOLUME" >/dev/null 2>&1 || true
    docker volume rm "$SITE_ASSETS_VOLUME" >/dev/null 2>&1 || true
    rm -rf -- "$INSTALL_DIR"
  fi
  rm -f -- "$LAUNCHER_PATH"
  if [[ -d "$PROXY_DIR" ]]; then
    docker compose --project-name menu-tv-2-proxy --project-directory "$PROXY_DIR" --env-file "$PROXY_ENV_FILE" down --volumes --remove-orphans || true
    docker network rm "$PROXY_NETWORK" >/dev/null 2>&1 || true
    rm -rf -- "$PROXY_DIR"
  fi
  info "Проект, его данные и системный скрипт удалены."
}

remove_script() {
  local input
  require_root
  [[ -e "$LAUNCHER_PATH" ]] || die "Системный скрипт Menu TV 2.0 не найден."
  read -r -p 'Удалить только системный скрипт, не затрагивая проект и данные? [y/N]: ' input
  [[ "${input,,}" == y ]] || { info "Удаление отменено."; return; }
  rm -f -- "$LAUNCHER_PATH"
  info "Системный скрипт удалён. Проект, данные и другие Docker-контейнеры не затронуты."
}

status_app() {
  require_root
  [[ -d "$INSTALL_DIR" ]] || die "Menu TV 2.0 не установлен."
  printf 'Версия проекта: %s\n' "$(project_version)"
  printf 'Версия скрипта: %s\n' "$SCRIPT_VERSION"
  printf 'Installation: %s\n' "$INSTALL_DIR"
  printf 'Ref: %s\n' "$BRANCH"
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
    printf '\n============================================\n'
    printf ' Menu TV 2.0\n'
    printf ' Версия проекта: %s\n' "$(project_version)"
    printf ' Версия скрипта: %s\n' "$SCRIPT_VERSION"
    printf ' Ветка/реф: %s\n' "$BRANCH"
    printf '============================================\n'
    printf '  1. Установить\n'
    printf '  2. Обновить\n'
    printf '  3. Удалить проект\n'
    printf '  4. Удалить скрипт\n'
    printf '  5. Удалить проект и скрипт\n'
    printf '  6. Проверить обновления скрипта\n'
    printf '  7. Сбросить пароль администратора\n'
    printf '  0. Выход\n'
    printf '============================================\n'
    read -r -p 'Выберите действие: ' action
    case "$action" in
      1) install_app ;;
      2) update_app ;;
      3) remove_project ;;
      4) remove_script; return ;;
      5) purge_project; return ;;
      6) update_script ;;
      7) reset_admin_password ;;
      0) return ;;
      *) warn "Выберите пункт от 0 до 7." ;;
    esac
  done
}

main() {
  case "${1:-menu}" in
    menu) menu ;;
    install) install_app ;;
    update) update_app ;;
    reset-admin-password) reset_admin_password "${2:-}" ;;
    check-script-update) check_script_update ;;
    update-script) update_script ;;
    remove) remove_project ;;
    remove-script) remove_script ;;
    purge) purge_project ;;
    status) status_app ;;
    help|-h|--help) usage ;;
    *) die "Неизвестная команда: ${1:-}" ;;
  esac
}

main "$@"