# ТВ МЕНЮ 2 — утверждённая архитектура

Этот документ описывает фактическую структуру проекта. ТВ МЕНЮ 1 используется как визуальный и пользовательский эталон frontend; его рабочий код не изменяется. ТВ МЕНЮ 2 использует модульный frontend/backend, PostgreSQL, Docker Compose и SFTPGo.

## Базовые правила

1. `.env` — единственный источник настраиваемых лимитов, размеров, таймаутов, security- и инфраструктурных параметров.
2. Frontend: `API -> state -> render -> UI`. DOM не является источником бизнес-состояния.
3. Backend: `HTTP -> service -> repository/integration`.
4. HTTP-слой не содержит SQL; PostgreSQL-слой не знает об HTTP.
5. Редактор меню — отдельное ядро frontend.
6. Preview и конечный JPEG получают данные из одной render model.
7. Применение шаблона меняет только локальный Editor State; запись в PostgreSQL выполняется обычным сохранением.
8. Frontend имеет один shell и один CSS-entrypoint. Legacy/compatibility frontend отсутствует.
9. Fresh install создаёт чистую PostgreSQL. Перенос старых данных выполняется только при обновлении существующей установки.

## Стек

- Node.js 24+
- Express 5
- PostgreSQL 17
- `pg`
- native ES Modules
- HTML / CSS / JavaScript
- Docker Compose
- Traefik
- SFTPGo

# Frontend

```text
src/web/admin-ui/public/
├── index.html
├── locations.html
├── screens.html
├── screen-editor.html
├── catalog.html
├── templates.html
├── settings.html
├── profile.html
├── signin.html
├── app.js
├── theme-bootstrap.js
│
├── css/
│   ├── index.css
│   ├── tokens.css
│   ├── base.css
│   ├── shell.css
│   ├── components.css
│   ├── forms.css
│   ├── tables.css
│   ├── pages/
│   │   ├── dashboard.css
│   │   ├── locations.css
│   │   ├── screens.css
│   │   ├── catalog.css
│   │   ├── templates.css
│   │   └── settings.css
│   ├── editor/
│   │   └── editor.css
│   └── auth/
│       └── signin.css
│
└── js/
    ├── application.js
    ├── core/
    │   ├── api.js
    │   ├── config.js
    │   ├── state.js
    │   ├── session.js
    │   ├── events.js
    │   ├── navigation.js
    │   ├── notifications.js
    │   ├── presentation.js
    │   └── dom.js
    ├── components/
    │   ├── shell.js
    │   ├── sidebar.js
    │   ├── context-panel.js
    │   ├── header.js
    │   ├── notifications.js
    │   ├── dialogs.js
    │   └── icons.js
    ├── pages/
    │   ├── dashboard.js
    │   ├── locations.js
    │   ├── screens.js
    │   ├── catalog.js
    │   ├── templates.js
    │   ├── settings.js
    │   ├── profile.js
    │   └── signin.js
    └── editor/
        ├── editor.js
        ├── state.js
        ├── commands.js
        ├── history.js
        ├── rows.js
        ├── properties.js
        ├── templates.js
        ├── settings.js
        ├── renderer.js
        ├── preview.js
        ├── final-image.js
        └── serializer.js
```

HTML содержит только содержимое страниц и рабочие формы. Sidebar, context panel, header, профиль и уведомления создаются общими компонентами.

`css/index.css` — единственный CSS-entrypoint. Старых `style.css`, `css/tv1`, временных compatibility-стилей и старого shell ТВ МЕНЮ2 в проекте нет.

## Frontend core

- `core/api.js` — единый HTTP-клиент.
- `core/config.js` — frontend-конфигурация API.
- `core/state.js` — состояние приложения.
- `core/session.js` — авторизованный контекст.
- `core/navigation.js` — единая модель разделов и маршрутов.
- `core/notifications.js` — данные уведомлений.
- `core/presentation.js` — тема, логотип, favicon, имя и accent.
- `core/events.js` — слабосвязанные события.
- `core/dom.js` — общие DOM helpers.

## Components

- `shell.js` — только сборка shell.
- `sidebar.js` — основной rail.
- `context-panel.js` — контекстное меню раздела.
- `header.js` — верхняя панель, профиль, logout, theme toggle.
- `notifications.js` — UI уведомлений.
- `dialogs.js` — общие диалоги/confirm.
- `icons.js` — общие SVG.

В разделе «Каталог» контекстное меню содержит `Продукция` и `Тара`.

# Редактор меню

```text
UI
 |
 v
commands / properties / templates / rows
 |
 v
Editor State
 |
 v
Renderer
 |       |
 v       v
Preview  Final JPEG
             |
             v
          staging
             |
             v
           SFTP
```

- `editor.js` — orchestration загрузки, сохранения, staging и публикации.
- `state.js` — единый Editor State.
- `commands.js` — add/delete/move/update/apply-template.
- `history.js` — история снимков и основа Undo/Redo.
- `rows.js` — `section/product/packaging`.
- `properties.js` — параметры монитора и оформления.
- `templates.js` — загрузка и локальное применение шаблонов.
- `settings.js` — нормализация оформления.
- `renderer.js` — единая render model.
- `preview.js` — preview из render model.
- `final-image.js` — JPEG из той же render model.
- `serializer.js` — Editor State <-> API draft.

Editor State:

```text
screen
rows
settings
selectedRowId
templateId
dirty
revision
```

# Backend

```text
src/
├── config/
│   ├── index.js
│   └── env.js
├── contracts/
├── shared/
├── logger/
├── api/
│   ├── auth/
│   ├── session/
│   ├── overview/
│   ├── settings/
│   ├── notifications/
│   ├── locations/
│   ├── screens/
│   ├── catalog/
│   ├── templates/
│   └── sftp/
├── middleware/
├── services/
├── db/
│   ├── index.js
│   ├── pool.js
│   ├── helpers.js
│   ├── migrations/
│   │   ├── schema.js
│   │   └── seed.js
│   ├── overview.js
│   ├── users.js
│   ├── locations.js
│   ├── screens.js
│   ├── catalog.js
│   ├── templates.js
│   ├── settings.js
│   ├── notifications.js
│   └── sftp.js
├── sftp/
│   ├── index.js
│   ├── client.js
│   ├── storage.js
│   └── publisher.js
└── server.js
```

## Ответственность backend

- `config/` — чтение и проверка `.env`.
- `contracts/` — входные структуры и domain/API-контракты.
- `shared/` — независимые errors/ids/validation helpers.
- `logger/` — структурированные runtime-логи.
- `middleware/` — session, login limiter, error handling и HTTP middleware.
- `api/` — только HTTP routes и формирование HTTP-ответов.
- `services/` — бизнес-правила, публикация, SFTP access, password/session/site-assets.
- `db/` — только PostgreSQL, migrations и repository-функции.
- `db/index.js` — единый `MenuTvStore`, собирающий PostgreSQL repositories.
- `sftp/` — SFTPGo client, filesystem staging и publisher.
- `sftp/index.js` — композиция SFTP-сервиса.
- `server.js` — только сборка приложения, middleware, routers и lifecycle.

Корневых `src/config.js`, `src/db.js` и `src/sftp.js` нет. Эти границы защищаются архитектурными тестами.

# Основной поток

```text
Browser
  |
  v
Frontend core/pages/editor
  |
  v
HTTP API
  |
  v
Services
  |------------------|
  v                  v
MenuTvStore       SFTP service
  |                  |
  v                  v
PostgreSQL       staging/SFTPGo
                     |
                     v
                  TV JPEG
```

# Проверка качества

Перед установкой на VPS обязательны:

```text
npm ci
npm run check
docker compose config
production Docker build
docker compose up --wait
healthz
login
create location
create screen
editor load
frontend assets
SFTP service check
```

CI содержит два обязательных job:

- `node-check` — syntax, unit/integration и архитектурные guards.
- `clean-install-smoke` — production image + чистые PostgreSQL/SFTPGo/app + основной runtime-сценарий.

Главный пользовательский сценарий:

```text
вход
-> торговая точка
-> каталог
-> монитор
-> редактор
-> шаблон
-> сохранить
-> автоматически собрать JPEG
-> опубликовать
-> проверить SFTP-файл
```
