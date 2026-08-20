# TV Device Player

## Назначение

`/player` — отдельный телевизионный контур, не использующий администраторскую web-session.

Поток подключения:

1. Неавторизованный телевизор открывает `/player` и создаёт короткоживущую activation-заявку.
2. Телевизор показывает QR и 6-значный резервный код.
3. QR содержит только одноразовый `TV2:<scan-claim>`; polling secret и будущая Device Session в QR не попадают.
4. Администратор открывает «Мониторы → Подключить ТВ», сканирует QR или вводит резервный код.
5. Администратор явно выбирает торговую точку и конкретный монитор.
6. После подтверждения следующий poll телевизора атомарно создаёт `Device` и долгоживущую `Device Session`.
7. Device token выдаётся только в `HttpOnly; SameSite=Strict` cookie; PostgreSQL хранит только SHA-256 токена.
8. Один Screen имеет не более одного активного Device. Повторная авторизация экрана отзывает старую Device Session.

## Offline-first

После первого успешного запуска подключённый телевизор сохраняет:

- player shell (`/player.html`, CSS, JS, canonical renderer);
- последний успешный `/api/device/player-context`;
- используемые same-origin background assets.

Service Worker применяет network-first для player context и cache fallback только при сетевой ошибке/таймауте. Ответ сервера `401/403` считается явным отзывом: сохранённый context удаляется и offline fallback не используется.

Это даёт два режима устойчивости:

- при кратком обрыве текущая отрисовка остаётся на экране без изменений;
- после перезапуска браузера/телевизора без интернета Player поднимается из последней локально сохранённой версии.

При восстановлении связи Player автоматически получает актуальный context и обновляет локальный cache.

## Runtime-конфигурация

Все изменяемые сроки и интервалы читаются только из `.env`:

- `DEVICE_ACTIVATION_TTL_MINUTES`
- `DEVICE_ACTIVATION_POLL_SECONDS`
- `DEVICE_SESSION_TTL_DAYS`
- `DEVICE_HEARTBEAT_WRITE_SECONDS`
- `PLAYER_REFRESH_SECONDS`
