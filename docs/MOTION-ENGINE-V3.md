# Motion Engine v3

## Назначение

Motion Engine v3 — внутренний runtime-контур анимации TV Menu 2. Он отделяет структуру сцены, поведение и сценарий движения от конкретного renderer/API. Формат сохранённых пользовательских animation settings пока остаётся `motion_version: 2`; это отдельная persistence boundary.

## Главный поток

```text
Canonical Menu Renderer / Entity Renderer
        ↓
Renderer Adapter
        ↓
Scene Graph
        ↓
Independent Scene Compilers
        ↓
Scene Composer
        ↓
Scene Runtime
        ↓
Motion Timeline
        ↓
Motion Driver
        ↓
Concrete Renderer Runtime
```

Текущая реализация:

```text
SVG/DOM menu + DOM Live Entity
   ↓
dom-scene-adapter.js
   ↓
scene-graph.js
   ↓
menu-motion + atmosphere + entity-idle compilers
   ↓
scene-composer.js
   ↓
scene-runtime.js
   ↓
timeline.js
   ↓
drivers/waapi-driver.js
   ↓
Web Animations API
```

Будущие реализации не должны менять Scene Graph/Composer/Timeline ради подключения другого renderer:

```text
Scene Graph
   ↓
Menu / Atmosphere / Entity / GPU compilers
   ↓
Scene Composer + Runtime
   ↓
Timeline
   ├── WAAPI Driver → SVG/DOM
   ├── Pixi Driver  → GPU 2.5D
   └── Three Driver → GPU 3D / Live Entity
```

## Scene Graph

`scene-graph.js` не знает о DOM, SVG, Canvas, Pixi, Three.js, WebGL или WebGPU.

Scene node содержит:
- `id` — стабильная идентичность внутри сцены;
- `kind` — семантический тип объекта;
- `layer` — слой сцены;
- `target` — opaque render target, смысл которого знает только соответствующий adapter/driver;
- `order/count` — положение в последовательности;
- `depth` — логическая глубина;
- `transformOwner` — явный владелец transform на уровне scene node;
- `metadata` — расширяемые данные.

Текущие layers:
- `background`;
- `menu`;
- `atmosphere`;
- `entity`.

Первый production Entity регистрируется как canonical node `entity.primary`. Обычный menu compiler по-прежнему не имеет права применять к нему `item_effect`: объект обслуживается только отдельным entity compiler.

## Renderer adapters

Adapter связывает конкретное представление с renderer-neutral Scene Graph.

`dom-scene-adapter.js` знает selectors готового SVG/DOM меню и DOM Entity. Он:
- находит section/item/promotion/price/background/atmosphere/entity targets;
- создаёт canonical scene nodes;
- сохраняет phase/order/depth;
- размечает DOM диагностическими `data-motion-*` атрибутами.

`screen-preview.js` и canonical menu renderer не создают Scene Graph и не знают Motion Runtime. Preview renderer только предоставляет слои сцены, включая пустой `data-entity-layer`. Binding выполняется после рендера через adapter.

`entity-dom.js` является DOM renderer первого Live Entity. Он намеренно разделяет геометрию размещения и анимируемый target:

```text
entity-placement
  └── entity-motion target
       └── image
```

`entity-placement` владеет только статическими X/Y/width/depth/opacity. `entity-motion target` владеет только runtime transform/appearance. Благодаря этому idle-анимация не может затереть пользовательское размещение объекта.

Будущий GPU adapter должен создавать те же scene node contracts, но `target` может быть `Pixi.Container` или `Three.Object3D`.

## Scene programs и compilers

Каждая независимая подсистема компилирует свой `SceneProgram`.

Сейчас существуют:
- `menu-motion` — section/item/promotion/price/background;
- `atmosphere` — отдельные атмосферные эффекты;
- `entity-idle` — постоянная жизнь первого отдельного Live Entity.

`entity-idle` поддерживает начальные состояния `alive`, `float`, `breathe`, `drift`, `none`. Это не конечная cinematic state machine, а первый production behavior на общей архитектуре.

В будущем независимо добавляются:
- entity state machine / cinematic scene program;
- внутренние части составной Entity;
- `gpu-atmosphere`;
- другие behavior-компиляторы.

Compiler получает общий Scene Graph и runtime context, но не управляет Timeline и не вызывает driver напрямую.

## Channel ownership

Каждый track обязан заранее объявить `claims` — каналы render target, которыми он пишет:
- `transform`;
- `opacity`;
- `appearance`.

`scene-composer.js` проверяет ownership до запуска анимации. Два track не могут одновременно владеть одним каналом одного scene node.

Пример допустимой композиции:

```text
node X
├── program A → transform
└── program B → appearance
```

Пример запрещённой композиции:

```text
node X
├── program A → transform
└── program B → transform   ← ownership conflict
```

Такой конфликт завершается явной ошибкой до вызова renderer driver, а не случайным визуальным дёрганием.

WAAPI driver сериализует только заявленные track claims. Если track владеет только `transform`, он не имеет права одновременно записывать `opacity` или `filter`.

## Transform ownership

Один render target не должен получать конкурирующие transform writers в одном канале.

Плашка «Акция» является отдельным sibling scene node относительно `table-item-content`, поэтому scale строки не применяется второй раз к `path + text` плашки. Оба sibling node получают одинаковую row phase, но каждый владеет собственным transform.

Live Entity использует тот же принцип ещё жёстче: placement transform физически находится на родительском DOM-слое, а motion transform — на дочернем canonical Entity target. Компенсирующие/inverse transforms запрещены.

## Motion Plan state

Motion compiler формирует renderer-neutral keyframe state.

В state запрещены browser-specific CSS transform/filter strings. Keyframe state хранится числами:
- `x/y/z`;
- `xPercent`;
- `scale`;
- `skewXDeg`;
- `opacity`;
- `brightness`;
- `glowRadius/glowColor`;
- transform composition order.

Timing также семантический:
- `duration`;
- `delay`;
- `easing`;
- `loop`.

CSS `translate3d(...)`, `drop-shadow(...)`, `cubic-bezier(...)` формирует только WAAPI driver.

## Scene Composer

`scene-composer.js`:
- принимает несколько независимых SceneProgram;
- проверяет уникальность program id;
- проверяет canonical scene node;
- проверяет channel ownership;
- объединяет tracks;
- формирует один master scene plan и master clock.

Composer не знает DOM, CSS и конкретный animation API.

## Scene Runtime

`scene-runtime.js` является orchestration boundary.

Runtime:
1. получает Scene Graph и context;
2. вызывает подключённые compilers независимо;
3. передаёт programs в Scene Composer;
4. загружает итоговый plan в Motion Timeline;
5. предоставляет lifecycle `play/pause/replay/seek/destroy`.

Добавление нового behavior происходит через новый compiler, а не через условные ветки внутри UI-player или TV Player.

Motion Studio и реальный `/player` используют один и тот же Scene Graph / Composer / Runtime / WAAPI Driver. Preview больше не является отдельной реализацией анимации.

## Motion Timeline

`timeline.js` не знает renderer и не требует DOM root. Он управляет:
- load;
- play;
- pause;
- replay;
- seek;
- currentTime;
- destroy.

Все операции делегируются driver contract.

## Driver contract

Driver обязан реализовать:
- `createTrack(track)`;
- `createClock(root, clock)`;
- `play(handle)`;
- `pause(handle)`;
- `cancel(handle)`;
- `seek(handle, milliseconds)`;
- `currentTime(handle)`;
- `playState(handle)`.

`WaapiMotionDriver` является текущим runtime driver и единственным местом, где вызывается `Element.animate()` и выполняется CSS serialization.

## Live Entity v1

Первый Live Entity — отдельное изображение PNG/WebP с реальным прозрачным фоном. Asset хранится в `SITE_ASSETS_ROOT`; PostgreSQL хранит только безопасный same-origin URL и параметры Entity внутри animation profile.

Persisted Entity contract:
- `enabled`;
- `asset_url`;
- `x_percent`, `y_percent`;
- `width_percent`;
- `depth`;
- `opacity`;
- `idle_effect`;
- `idle_amount`;
- `idle_cycle_seconds`.

Координаты и размер хранятся относительно экрана, а не в пикселях. Поэтому один профиль не привязан к конкретному Full HD viewport.

Motion Studio позволяет загружать/заменять asset, перетаскивать объект непосредственно по preview и редактировать параметры. TV Player получает тот же animation profile через `player-context`, строит тот же Entity node и запускает тот же `entity-idle` SceneProgram.

Offline-контур кэширует Entity asset и все Motion Engine modules. Потеря сети не должна удалять объект или останавливать уже загруженную сцену.

Context refresh не должен перезапускать timeline, если ETag сцены не изменился.

## Будущая Entity

Live Entity v1 является первым renderer/behavior, но не заменяет запланированную сущность со state machine. Следующие уровни могут добавить:
- `idle`, `attention`, `promo`, `transition`, `sleep`;
- составные части объекта (например стекло/пиво/пена/пузырьки/конденсат/блик);
- cinematic scenes;
- Pixi/Three renderer;
- GPU particles/light/depth.

Эти уровни должны подключаться через отдельные SceneProgram/driver contracts, не меняя menu renderer и базовый Scene Graph.

## Что намеренно НЕ делаем сейчас

На этом этапе не вводятся:
- FPS limits;
- asset budgets как performance policy;
- device tiers;
- automatic quality degradation;
- PixiJS/Three.js dependencies;
- WebGL/WebGPU runtime;
- новые persistence migrations.

Существующие security/HTTP/image validation limits из `.env` продолжают действовать и не являются политикой качества GPU-сцены.

## Неподвижные архитектурные правила

1. Canonical menu renderer остаётся источником читаемого меню.
2. Renderer не зависит от Motion Runtime.
3. Scene Graph не зависит от renderer.
4. Каждый behavior компилируется в независимый SceneProgram.
5. Scene Composer запрещает конкурирующее владение каналами одного node.
6. Motion state не содержит CSS/WebGL/Three/Pixi-specific serialization.
7. Timeline не зависит от renderer.
8. Concrete driver — единственное место сериализации состояния под конкретный runtime.
9. Live Entity не наследует menu behavior неявно.
10. Placement transform и motion transform Entity принадлежат разным физическим слоям.
11. Motion Studio и TV Player не имеют отдельных реализаций движка.
12. GPU/Entity никогда не должны становиться обязательным условием отображения основного меню.
