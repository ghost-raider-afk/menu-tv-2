# ТВ МЕНЮ 2 — архитектура проекта

Этот документ является единой схемой проекта. ТВ МЕНЮ 1 используется только как визуальный и пользовательский эталон frontend; рабочий код ТВ МЕНЮ 1 не изменяется. ТВ МЕНЮ 2 использует новую модульную архитектуру, PostgreSQL, Docker Compose и SFTPGo.

## Базовые принципы

1. `.env` — единственный источник настраиваемых лимитов, таймаутов, размеров, security-параметров и инфраструктурных значений.
2. Frontend: `API -> state -> render -> UI`. DOM не является источником бизнес-состояния.
3. Backend: `HTTP -> service -> repository/integration`. HTTP-слой не должен содержать SQL, DB-слой — HTTP-логику.
4. Редактор меню — самостоятельное ядро внутри frontend.
5. Один render model используется для preview и формирования конечного JPEG.
6. Применение шаблона меняет только локальный Editor State. PostgreSQL меняется только после обычного `Сохранить`.
7. Frontend имеет один shell, один CSS-entrypoint и один набор модулей. Параллельного legacy/compatibility frontend нет.
8. API-контракты меняются только по функциональной необходимости.
9. Fresh install создаёт пустую PostgreSQL и ничего не мигрирует. Перенос данных нужен только при обновлении существующей старой установки.

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

Фактическая структура frontend:

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

## HTML

HTML-страницы содержат только контент и рабочие формы. В них нет копий sidebar, topbar, профиля или уведомлений.

```text
HTML page
   -> app.js
      -> application.js
         -> authenticated context
         -> shell
         -> page/editor module
```

## CSS

`css/index.css` — единственный CSS-entrypoint.

```text
index.css
├── tokens.css       дизайн-токены
├── base.css         базовые элементы и общие controls
├── shell.css        rail/context/layout
├── components.css   header, notifications, dialogs, toast
├── forms.css        формы и поля
├── tables.css       списки и строки меню
├── pages/*          стили конкретных страниц
├── editor/*         рабочая область редактора
└── auth/*           вход
```

В проекте не должно быть второго `style.css`, каталога `css/tv1`, временного compatibility CSS или классов старого shell ТВ МЕНЮ2.

## Core

- `core/api.js` — единственный HTTP-клиент frontend.
- `core/config.js` — адреса API и базовая конфигурация клиента.
- `core/state.js` — состояние приложения.
- `core/session.js` — получение авторизованного контекста.
- `core/navigation.js` — единая модель маршрутов, разделов и контекстного меню.
- `core/notifications.js` — получение/обновление уведомлений.
- `core/presentation.js` — тема, логотип, favicon, имя приложения, accent.
- `core/events.js` — слабосвязанные события между модулями.
- `core/dom.js` — небольшие безопасные DOM helpers.

## Components

- `shell.js` — только orchestration shell.
- `sidebar.js` — основной rail.
- `context-panel.js` — контекстное подменю раздела и account block.
- `header.js` — верхняя панель, профиль, logout, theme toggle.
- `notifications.js` — UI уведомлений.
- `dialogs.js` — общие confirm/dialog механизмы.
- `icons.js` — общие SVG icons.

Каталог в контекстной панели содержит отдельные пункты `Продукция` и `Тара`.

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

Ответственность модулей:

- `editor.js` — orchestration: load/save/staging/publish.
- `state.js` — единый Editor State.
- `commands.js` — add/delete/move/update/apply-template.
- `history.js` — снимки состояния и база Undo/Redo.
- `rows.js` — строки `section/product/packaging`.
- `properties.js` — чтение/запись параметров монитора и оформления.
- `templates.js` — список и локальное применение шаблонов.
- `settings.js` — нормализация настроек оформления.
- `renderer.js` — единая render model.
- `preview.js` — отображение render model в редакторе.
- `final-image.js` — создание JPEG из той же render model.
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

Кнопка `Применить` шаблон не сохраняет. Сохранение выполняется только `Сохранить монитор и меню`.

# Backend

Целевая backend-структура:

```text
src/
├── config/
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
│   ├── pool.js
│   ├── migrations/
│   ├── users.js
│   ├── locations.js
│   ├── screens.js
│   ├── catalog.js
│   ├── templates.js
│   ├── settings.js
│   ├── notifications.js
│   └── sftp.js
├── sftp/
│   ├── client.js
│   ├── storage.js
│   └── publisher.js
└── server.js
```

Правила backend:

- `config` получает конфигурацию из `.env`; UI не дублирует env-лимиты.
- `contracts` описывает структуры API/domain.
- `shared` содержит независимые errors/ids/validation/date helpers.
- `middleware` содержит auth/security/error/login-limit механизмы.
- `api` отвечает только за HTTP.
- `services` содержит бизнес-правила.
- `db` содержит только PostgreSQL.
- `sftp` содержит staging/publish/integration с SFTPGo.
- `server.js` должен стать точкой сборки приложения, а не местом хранения бизнес-логики.

Часть backend-фундамента уже вынесена (`contracts`, `shared`, `logger`, `middleware`); дальнейшая декомпозиция `server.js` и `db.js` выполняется без изменения внешних API-контрактов.

# Проверка качества

Обязательные проверки перед VPS:

```text
npm ci
npm run check
Docker build
docker compose config
docker compose up --wait
healthz
login
create location
create screen
editor load
frontend assets
SFTP ping
```

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
-> проверить файл SFTP
```

После fresh install PostgreSQL должна быть пустой, кроме необходимых системных/initial-admin записей. Миграция старых данных при чистой установке не выполняется.
