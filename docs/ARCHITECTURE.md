# ТВ МЕНЮ 2 — целевая архитектура

Этот документ фиксирует целевую структуру проекта и порядок постепенной миграции. Рабочую систему не переписываем с нуля: сохраняем Node.js/Express/PostgreSQL/Docker/SFTPGo и поэтапно уменьшаем монолиты `server.js`, `db.js`, `app.js`, `style.css`.

## Базовые принципы

1. `.env` — единственный источник настраиваемых лимитов, таймаутов, размеров, security-параметров и инфраструктурных значений.
2. API-контракты и пользовательская логика не меняются только ради рефакторинга.
3. Frontend: `API -> state -> render -> UI`. DOM не является источником бизнес-состояния.
4. Backend: `HTTP -> service -> repository/integration`. HTTP-слой не содержит SQL, DB-слой не содержит HTTP-логики.
5. Редактор — отдельное приложение внутри frontend.
6. Один renderer используется и для визуального preview, и как источник данных/геометрии для формирования конечного изображения. Это исключает расхождение «в редакторе одно — на ТВ другое».
7. Изменения редактора не пишутся в PostgreSQL до обычного действия `Сохранить`.
8. Миграция выполняется маленькими проверяемыми этапами; после каждого этапа приложение должно оставаться устанавливаемым и рабочим.

## Базовый стек

- Node.js 24+
- Express 5
- PostgreSQL
- `pg`
- Docker Compose
- Traefik
- SFTPGo
- Нативные ES Modules во frontend
- HTML/CSS/JavaScript без обязательного React/Vue

## Целевая структура проекта

```text
menu-tv-2/
├── docs/
│   ├── ARCHITECTURE.md
│   └── VPS-ACCEPTANCE.md
├── infra/
├── src/
│   ├── config/
│   ├── contracts/
│   ├── shared/
│   ├── logger/
│   ├── api/
│   ├── middleware/
│   ├── services/
│   ├── db/
│   ├── sftp/
│   ├── web/
│   └── server.js
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

# Backend

```text
src/
├── config/
│   ├── index.js
│   └── env.js
│
├── contracts/
│   ├── menu.js
│   ├── screens.js
│   ├── catalog.js
│   ├── templates.js
│   └── locations.js
│
├── shared/
│   ├── errors.js
│   ├── ids.js
│   ├── validation.js
│   └── dates.js
│
├── logger/
│   └── index.js
│
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
│
├── middleware/
│   ├── auth.js
│   ├── errors.js
│   ├── security.js
│   └── validation.js
│
├── services/
│   ├── auth-service.js
│   ├── location-service.js
│   ├── screen-service.js
│   ├── catalog-service.js
│   ├── template-service.js
│   ├── publish-service.js
│   ├── settings-service.js
│   └── notification-service.js
│
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
│
├── sftp/
│   ├── client.js
│   ├── storage.js
│   └── publisher.js
│
└── server.js
```

### Ответственность backend-слоёв

- `config/*` — только нормализованная конфигурация из `.env`. Не дублировать значения константами в коде.
- `contracts/*` — JSDoc/структуры входных и выходных данных. Это единый словарь `Screen`, `ScreenDraft`, `MenuRow`, `TemplateSettings`, `Product` и т.д.
- `shared/*` — независимые переиспользуемые функции: типовые ошибки, ID, примитивная валидация, даты.
- `logger/*` — структурированные логи вместо хаотичного `console.log/error`. Поля: timestamp, level, requestId, actor, action, entityType/entityId, error.
- `api/*` — маршруты, HTTP-коды, чтение params/body/query и вызов services. Без SQL.
- `middleware/*` — сессия, security headers, request-id, единая обработка ошибок, общие проверки.
- `services/*` — бизнес-правила и транзакционные сценарии.
- `db/*` — PostgreSQL-запросы и миграции. Без HTTP и UI-логики.
- `sftp/*` — интеграция с SFTPGo, staging и публикация файлов.
- `server.js` — только сборка приложения и запуск.

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
│
├── js/
│   ├── core/
│   │   ├── api.js
│   │   ├── session.js
│   │   ├── state.js
│   │   ├── events.js
│   │   ├── navigation.js
│   │   ├── notifications.js
│   │   └── config.js
│   │
│   ├── components/
│   │   ├── sidebar.js
│   │   ├── header.js
│   │   ├── modal.js
│   │   ├── toast.js
│   │   ├── dropdown.js
│   │   ├── confirm.js
│   │   └── loader.js
│   │
│   ├── pages/
│   │   ├── dashboard.js
│   │   ├── locations.js
│   │   ├── screens.js
│   │   ├── catalog.js
│   │   ├── templates.js
│   │   ├── settings.js
│   │   └── profile.js
│   │
│   └── editor/
│       ├── editor.js
│       ├── state.js
│       ├── commands.js
│       ├── history.js
│       ├── rows.js
│       ├── properties.js
│       ├── templates.js
│       ├── canvas.js
│       ├── renderer.js
│       ├── preview.js
│       └── serializer.js
│
└── css/
    ├── tokens.css
    ├── reset.css
    ├── base.css
    ├── layout.css
    ├── components/
    └── pages/
```

### Frontend core

- `core/api.js` — единый HTTP-клиент: JSON, GET/POST/PUT/DELETE, 401/409/422/500, network errors.
- `core/session.js` — пользователь, сессия, logout, проверка авторизации.
- `core/state.js` — общее UI-состояние.
- `core/events.js` — слабосвязанные события между модулями.
- `core/navigation.js` — единая навигация и active-state.
- `components/*` — один sidebar/header/modal/toast/dropdown/confirm/loader для всех страниц.
- `pages/*` — маленький контроллер на страницу; страницы не знают реализацию других страниц.

# Ядро редактора меню

```text
editor/
├── editor.js       # точка входа и orchestration
├── state.js        # единый Editor State
├── commands.js     # add/delete/move/update/apply-template
├── history.js      # будущий Undo/Redo
├── rows.js         # разделы/продукция/тара
├── properties.js   # панель свойств
├── templates.js    # локальное применение шаблонов
├── canvas.js       # DOM-рабочая область 16:9
├── renderer.js     # единая модель визуального результата
├── preview.js      # preview через renderer
└── serializer.js   # state <-> API draft
```

## Editor State

Минимальная модель:

```text
screen
rows
settings
selectedRowId
templateId
dirty
revision
```

Все действия проходят через commands:

```text
UI -> command -> Editor State -> renderer -> UI
```

`commands.js` создаёт фундамент для `Undo/Redo`, так как операции редактора перестают быть прямыми изменениями DOM.

## Единый renderer

Критическое правило:

```text
Editor State
    |
    v
Renderer
  |      |
  v      v
Preview  Final image pipeline
```

`preview.js` и формирование конечного изображения не должны иметь две независимые реализации раскладки. Renderer должен выдавать нормализованную геометрию/стили/текст, используемые обоими путями.

# CSS / дизайн-система

`tokens.css` — единый источник frontend-дизайна:
- цвета;
- типографика;
- spacing;
- радиусы;
- тени;
- анимации;
- transitions;
- z-index;
- breakpoints.

Компонентные и страничные стили используют только токены, где это применимо.

# Тестовая структура

```text
tests/
├── unit/
│   ├── shared/
│   ├── services/
│   └── editor/
├── integration/
│   ├── api/
│   ├── postgres/
│   └── sftp/
└── e2e/
    └── menu-workflow/
```

Главный e2e-сценарий:

```text
создать точку
-> создать монитор
-> добавить продукцию/тару
-> собрать меню
-> сохранить
-> сформировать конечный файл
-> опубликовать
-> проверить доступность результата
```

# Порядок миграции

## Этап 1 — фундамент
- architecture/acceptance docs;
- `shared/errors`;
- `logger`;
- contracts;
- `frontend/core/api`, events;
- `editor/state`, commands, renderer skeleton;
- unit tests чистых модулей.

## Этап 2 — frontend core
- перевести существующий `api()` на `core/api.js`;
- session/navigation/notifications;
- общие components;
- после каждого переноса удалять старую реализацию из `app.js`.

## Этап 3 — страницы
- locations;
- screens;
- catalog;
- templates;
- settings/profile;
- dashboard.

## Этап 4 — редактор
- Editor State;
- commands/history;
- rows/properties/templates;
- общий renderer;
- preview;
- serializer;
- final-image pipeline.

## Этап 5 — backend
- shared/errors + error middleware;
- auth/session;
- API routes по доменам;
- services;
- db repositories;
- sftp integration;
- тонкий `server.js`.

## Этап 6 — чистая VPS
- установка только через штатный `menu-tv-2.sh`;
- fresh install без миграции старых данных;
- PostgreSQL поднимается автоматически;
- healthcheck;
- вход в браузере;
- полный e2e workflow;
- проверка логов и перезапуска контейнеров.

# Что не делаем

- не меняем Node.js / Express / PostgreSQL ради моды;
- не внедряем React/Vue без функциональной необходимости;
- не делаем Big Bang rewrite;
- не меняем API-контракты без причины;
- не меняем публикацию без отдельной проверки;
- не трогаем ТВ МЕНЮ 1.
