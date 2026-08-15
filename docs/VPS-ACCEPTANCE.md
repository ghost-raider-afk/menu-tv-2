# ТВ МЕНЮ 2 — критерии приёмки на чистой VPS

Цель: подтвердить, что проект устанавливается с нуля на пустую VPS и полностью проходит основной пользовательский сценарий в браузере.

## Fresh install

Для чистой VPS не выполняется перенос старой БД или файлов. Миграция нужна только при обнаруженной установленной старой версии.

## Установка тестовой ветки

До слияния в `main` установочный тест выполняется именно из ветки `agent/backend-modularization`:

```bash
curl -fsSL https://raw.githubusercontent.com/ghost-raider-afk/menu-tv-2/agent/backend-modularization/menu-tv-2.sh -o /tmp/menu-tv-2.sh
sudo env MENU_TV_REF=agent/backend-modularization bash /tmp/menu-tv-2.sh install
```

Установщик сохраняет выбранный ref в `/opt/menu-tv-2.0/.installer-ref`, поэтому последующие `sudo menu-tv-2.0 update` продолжают использовать ту же тестовую ветку и не переключаются самопроизвольно на `main`.

После установки:

```bash
sudo menu-tv-2.0 status
```

должен показывать `Ref: agent/backend-modularization` и успешные проверки Health/SFTP.

## Ожидаемый сценарий установки

1. Подготовить чистую поддерживаемую Ubuntu VPS.
2. Запустить штатный `menu-tv-2.sh` с нужным `MENU_TV_REF`.
3. Скрипт устанавливает/проверяет Docker и необходимые зависимости.
4. Создаётся `.env` с обязательными значениями и всеми runtime-лимитами.
5. Поднимаются PostgreSQL, SFTPGo, app и инфраструктурные init-контейнеры.
6. PostgreSQL проходит healthcheck до запуска приложения.
7. Приложение отвечает на `/healthz`.
8. Traefik публикует приложение по HTTPS при настроенном домене.
9. Начальный администратор переносится в PostgreSQL, после чего bootstrap-пароль удаляется из `.env`.

## Автоматический smoke до VPS

GitHub Actions перед ручной установкой обязан успешно пройти два job:

### `node-check`

- `npm ci`;
- синтаксическая проверка всех JS-файлов;
- API/unit tests;
- импорт полного графа frontend ES Modules;
- тест env-driven лимитов;
- тест login limiter;
- тест длины генерируемого SFTP-пароля.

### `clean-install-smoke`

- `bash -n menu-tv-2.sh`;
- проверка `MENU_TV_REF`;
- создание чистого `.env.ci`;
- `docker compose config -q`;
- сборка production Docker image;
- запуск чистых PostgreSQL + SFTPGo + app через `docker compose up --wait`;
- `/healthz`;
- вход bootstrap-администратором;
- создание торговой точки;
- создание монитора без шаблона;
- загрузка editor API;
- открытие `screen-editor.html`;
- `sftpgo ping`;
- полное удаление тестовых контейнеров и томов.

## Проверка контейнеров

После установки должны быть здоровы/завершены ожидаемым образом:

- `menu-tv-2-db` — healthy;
- `menu-tv-2-sftp` — healthy;
- `menu-tv-2.0` — running;
- init-контейнеры — completed successfully;
- Traefik — running.

Не должно быть crash-loop, постоянных restart или ошибок подключения к PostgreSQL/SFTPGo.

## Проверка в браузере

1. Открывается страница входа.
2. Вход администратора работает.
3. Открывается dashboard.
4. Навигация между разделами работает при любом количестве переключений.
5. Создаётся торговая точка.
6. Добавляется монитор без обязательного выбора шаблона.
7. В каталог добавляются продукция и тара.
8. Открывается редактор монитора.
9. Добавляются разделы/продукция/тара.
10. Применение шаблона меняет только локальное состояние до `Сохранить`.
11. `Сохранить` сохраняет черновик и автоматически собирает JPEG через общий renderer.
12. Preview и конечный JPEG используют одну render-model и должны соответствовать друг другу по данным и настройкам.
13. Если автоматическая сборка JPEG в браузере недоступна, ручная загрузка JPEG остаётся резервным путём.
14. Настраивается SFTP-привязка точки.
15. Выполняется публикация.
16. Готовый JPEG появляется в ожидаемом каталоге SFTP.
17. Раздел «Шаблоны» при повторном открытии автоматически показывает последний открытый/сохранённый шаблон.

## Проверка лимитов

На VPS параметры ниже должны находиться в `/opt/menu-tv-2.0/.env` и управляться только оттуда:

```text
PASSWORD_MIN_LENGTH
PASSWORD_MAX_LENGTH
GENERATED_PASSWORD_LENGTH
SESSION_TTL_HOURS
SECURE_COOKIES
LOGIN_MAX_ATTEMPTS
LOGIN_WINDOW_MINUTES
LOGIN_LIMITER_MAX_ENTRIES
JSON_BODY_MAX_BYTES
MENU_DRAFT_MAX_BYTES
SCREEN_SOURCE_MAX_BYTES
DASHBOARD_REFRESH_MIN_SECONDS
DASHBOARD_REFRESH_MAX_SECONDS
SCREEN_MAX_WIDTH
SCREEN_MAX_HEIGHT
SITE_LOGO_MAX_BYTES
SITE_FAVICON_MAX_BYTES
```

Текущий максимальный размер макета: `1920×1080`.

## Проверка сохранности

После:

```bash
cd /opt/menu-tv-2.0
sudo docker compose --env-file .env restart
```

должны сохраниться:

- пользователь и возможность входа;
- точки;
- мониторы;
- каталог;
- шаблоны;
- черновики;
- SFTP-привязки;
- опубликованные данные.

## Проверка логов

```bash
cd /opt/menu-tv-2.0
sudo docker compose --env-file .env ps
sudo docker compose --env-file .env logs --tail=200 app
sudo docker compose --env-file .env logs --tail=200 db
sudo docker compose --env-file .env logs --tail=200 sftp
```

Критерий: нет необработанных исключений, циклических ошибок подключения, ошибок схемы БД и постоянных 5xx в основном пользовательском сценарии.

## Проверка обновления отдельно от fresh install

Обновление существующей установки тестируется отдельно. Только в этом сценарии разрешён перенос данных старой версии. Fresh install всегда начинается с пустой PostgreSQL.

## Итоговый критерий готовности

Версия готова к установочному тесту, когда:

- `node-check` завершён `success`;
- `clean-install-smoke` завершён `success`;
- production image собирается;
- PostgreSQL/SFTPGo/app поднимаются с пустыми томами;
- критический API workflow проходит на чистом Docker stack;
- чистая установка не требует ручного изменения файлов проекта;
- после установки вся основная логика доступна и проверяема в браузере.
