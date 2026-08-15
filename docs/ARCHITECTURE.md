# ТВ МЕНЮ 2 — целевая архитектура

Этот документ фиксирует целевую структуру проекта без требования переписывать рабочую систему с нуля.

Основной принцип: сохраняем текущий стек и рабочее поведение, а монолитные файлы постепенно делим на независимые модули.

## Базовый стек

- Node.js 24+
- Express 5
- PostgreSQL
- `pg`
- Docker Compose
- Traefik
- SFTPGo
- Нативные ES Modules во frontend
- HTML/CSS/JavaScript без обязательного перехода на React/Vue

## Целевая структура backend

```text
src/
├── config/
│   ├── index.js
│   └── limits.js
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

### Ответственность слоёв backend

- `server.js` — только создание Express-приложения, подключение middleware и маршрутов, запуск сервера.
- `api/*` — HTTP-маршруты и преобразование HTTP-запросов/ответов.
- `middleware/*` — авторизация, обработка ошибок, безопасность, общая валидация.
- `services/*` — бизнес-логика.
- `db/*` — только PostgreSQL и запросы к данным.
- `sftp/*` — работа с SFTPGo, файлами и публикацией.
- `config/*` — единая конфигурация из `.env`.

`server.js` и текущий `db.js` должны уменьшаться постепенно, без изменения API и поведения приложения.

## Целевая структура frontend

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
│       ├── canvas.js
│       ├── rows.js
│       ├── properties.js
│       ├── templates.js
│       ├── preview.js
│       └── serializer.js
│
└── css/
    ├── tokens.css
    ├── reset.css
    ├── base.css
    ├── layout.css
    │
    ├── components/
    │   ├── sidebar.css
    │   ├── buttons.css
    │   ├── cards.css
    │   ├── forms.css
    │   ├── modal.css
    │   └── tables.css
    │
    └── pages/
        ├── dashboard.css
        ├── locations.css
        ├── screens.css
        ├── catalog.css
        └── editor.css
```

## Frontend core

### `core/api.js`

Единый HTTP-клиент для всех страниц.

Отвечает за:
- `GET/POST/PUT/DELETE`
- JSON
- HTTP-ошибки
- `401` и переход на вход
- `409/422/500`
- общие заголовки
- сетевые ошибки

Страницы не должны напрямую дублировать `fetch()`-логику.

### `core/state.js`

Общее состояние интерфейса. DOM не должен быть единственным источником состояния.

Поток данных:

```text
API → state → render → UI
```

### `core/navigation.js`

Единая навигация и активное состояние разделов.

### `components/*`

Повторно используемые элементы интерфейса: sidebar, header, модальные окна, уведомления, dropdown, loader и подтверждения.

## Редактор меню

Редактор считается отдельным модулем приложения и должен развиваться независимо от остальных страниц.

```text
editor/
├── editor.js
├── state.js
├── canvas.js
├── rows.js
├── properties.js
├── templates.js
├── preview.js
└── serializer.js
```

### Назначение модулей редактора

- `editor.js` — точка входа и координация редактора.
- `state.js` — текущее состояние меню, выбранный элемент, настройки, шаблон, dirty-state.
- `canvas.js` — визуальная рабочая область 16:9.
- `rows.js` — разделы, продукция, тара, порядок и включение/выключение строк.
- `properties.js` — свойства выбранного элемента.
- `templates.js` — загрузка и применение шаблона только в локальное состояние редактора.
- `preview.js` — живой предпросмотр.
- `serializer.js` — преобразование состояния редактора в формат API/черновика.

Изменения в редакторе не должны записываться в PostgreSQL до обычного действия `Сохранить`.

## CSS / дизайн-система

Текущий единый `style.css` постепенно делится на:

- дизайн-токены
- базовые стили
- layout
- компоненты
- стили отдельных страниц

`tokens.css` становится единым источником цветов, отступов, радиусов, размеров шрифтов, теней и анимаций.

## Принцип миграции frontend

Никакой полной одномоментной переписи.

Порядок:

```text
текущий app.js
  ↓
core/api.js
  ↓
session + navigation
  ↓
общие components
  ↓
отдельные pages
  ↓
editor/*
  ↓
удаление оставшегося монолитного app.js
```

На каждом этапе приложение должно оставаться рабочим.

## Принцип миграции backend

Аналогично:

```text
текущий server.js / db.js
  ↓
общие middleware и helpers
  ↓
маршруты по доменам
  ↓
services
  ↓
репозитории PostgreSQL
  ↓
тонкий server.js
```

API-контракты и поведение не меняются только ради рефакторинга.

## Что пока не делаем

- не меняем Node.js / Express / PostgreSQL;
- не внедряем React/Vue только ради модности;
- не переписываем рабочий редактор с нуля;
- не меняем схему публикации без отдельного решения;
- не трогаем ТВ МЕНЮ 1.

Этот документ является целевой структурой ТВ МЕНЮ 2 и ориентиром для дальнейшей постепенной модернизации frontend и backend.
