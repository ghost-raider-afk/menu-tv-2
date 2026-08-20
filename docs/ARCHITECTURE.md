# Архитектура TV Menu 2.0 — 1.2.0

## 1. Доменная модель

Runtime-модель приложения намеренно упрощена до одной цепочки:

```text
Location
└── Screen
    ├── ScreenDraft
    │   ├── rows
    │   └── settings
    └── Publication state
```

### Location

Торговая точка хранит собственные реквизиты и при необходимости SFTP-привязку. Удаление точки каскадно удаляет её мониторы и черновики, но SFTP-доступ перед удалением должен быть явно отключён.

### Screen

`Screen` — самостоятельный монитор. Он хранит идентичность и состояние доставки:
- `location_id`;
- `name`;
- `resolution`;
- `status`;
- `active`;
- `delivery_filename`;
- prepared/publishing/published SHA-256 и revision;
- timestamps.

### ScreenDraft

`screen_drafts` — единственный источник редактируемого содержимого монитора:
- `rows_json`;
- `settings_json`;
- `revision`;
- `updated_at`.

`revision` используется для optimistic locking. Сохранение с устаревшей revision отклоняется с конфликтом.

## 2. Настройки монитора

`settings_json` содержит canonical presentation state:

```text
background_color
background_image_url
accent_color
text_color
font_scale_percent
font_family
table_x
table_y
table_width_px
table_height_px
```

Renderer, preview и финальный JPEG используют эти же значения. Отдельного layout слоя для JPEG нет.

Фоновое изображение хранится в:

```text
/site-assets/screens/background-<uuid>.<ext>
```

Разрешены PNG, JPEG и WebP. Максимальный размер берётся только из:

```env
SCREEN_BACKGROUND_MAX_BYTES
```

Релизное значение 1.2.0 — `20971520` байт.

## 3. Отказ от отдельного слоя оформления

В runtime нет отдельной сущности для переиспользуемого оформления. Оформление принадлежит монитору напрямую.

Для обновления старых установок существует только одноразовая migration boundary:

```text
legacy assigned presentation
        ↓ materialize
screen_drafts.rows_json/settings_json
        ↓
drop obsolete foreign key/column/table
```

Этот compatibility-код не участвует в обычных API/UI операциях после старта обновлённой базы.

## 4. Клонирование

### Monitor clone

Копируются:
- rows;
- settings;
- resolution;
- active state.

Не копируются:
- screen ID;
- prepared asset;
- publication pending state;
- published SHA/revision/timestamp;
- delivery filename identity.

Новая запись получает собственную revision и lifecycle публикации.

### Location clone

Копируются:
- name/address задаются пользователем для новой точки;
- все мониторы;
- rows/settings каждого монитора.

Не копируются:
- location ID;
- SFTP directory binding;
- SFTP username/password;
- publication state мониторов.

## 5. Frontend

### Shell

Постоянные модули:
- `components/sidebar.js`;
- `components/context-panel.js`;
- `components/header.js`;
- `components/shell.js`;
- `core/navigation.js`.

Компактная геометрия задаётся базовыми tokens, а не page-specific override слоями:
- rail: 64 px;
- context: 250 px;
- control height: 32 px;
- уменьшенные page/card gaps и paddings.

### Monitor editor

`screen-editor.html` построен вокруг sticky command bar:
- Monitor;
- Table;
- Appearance;
- Delivery;
- Add row actions;
- Save.

Основное рабочее пространство ниже toolbar содержит только:
- compact semantic row editor;
- preview.

Настройки не занимают постоянную правую колонку.

## 6. Renderer

Canonical renderer:

```text
Editor State
   ↓
buildRenderModel
   ↓
buildDisplayLines
   ↓
buildRenderLayout
   ↓
buildTableSvg
   ├── browser preview
   └── final JPEG canvas pipeline
```

TV Menu 1 reference defaults для 1920×1080:
- table X = 56;
- table Y = 15;
- width = 1374;
- height = 925.

Каждый монитор может менять эти значения. Цена остаётся правовыровненной внутри текущей ширины таблицы.

## 7. PostgreSQL

Критичные свойства:
- FK `screens.location_id → locations.id ON DELETE CASCADE`;
- PK `screen_drafts.screen_id → screens.id ON DELETE CASCADE`;
- unique `(location_id, name)`;
- transaction wrapper для multi-step mutations;
- optimistic locking по `screen_drafts.revision`.

## 8. JPEG consistency

Prepared JPEG связан с:
- asset key;
- SHA-256;
- byte size;
- draft revision.

Изменение черновика инвалидирует prepared asset. Публикация проверяет SHA и revision перед внешней SFTP-операцией.

## 9. SFTP publication

Публикация выполняется через staging:
1. validate/decode JPEG;
2. stage file;
3. record prepared SHA/revision;
4. mark publication started inside DB transaction;
5. atomically publish through SFTP service;
6. finalize DB state;
7. cleanup staging.

Startup reconciliation восстанавливает незавершённые операции. HTTP calls к SFTPGo ограничены timeout из `.env`.

## 10. Site settings

`site_settings` хранит:
- application name;
- accent;
- logo/favicon names;
- timezone/date format;
- dashboard refresh;
- default monitor resolution;
- `signin_logo_size` от 1 до 7.

Уровень `1` — минимальный исходный размер логотипа страницы входа.

## 11. Runtime configuration

`.env` — единственный источник изменяемых runtime limits/security settings. В частности:
- HTTP/body limits;
- session/login limits;
- password limits;
- PostgreSQL pool/timeouts;
- SFTP timeout/staging age;
- screen resolution limits;
- image pixel limits;
- site asset limits;
- monitor background limit.

Код не должен иметь второй production-default для значения, которое объявлено в `.env`.

## 12. Release gates

Merge разрешён только после:
- `node-check`;
- `clean-install-smoke`;
- `browser-visual`.

Browser checks обязаны тестировать реальные DOM/SVG метрики, а не только наличие CSS-строк.
