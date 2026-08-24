# Motion Engine v3

## Назначение

Motion Engine v3 — внутренний runtime-контур анимации TV Menu 2. Он отделяет структуру сцены и сценарий движения от конкретного renderer/API. Формат сохранённых пользовательских animation settings пока остаётся `motion_version: 2`; это отдельная persistence boundary.

## Главный поток

```text
Canonical Menu Renderer
        ↓
Renderer Adapter
        ↓
Scene Graph
        ↓
Motion Plan Compiler
        ↓
Motion Timeline
        ↓
Motion Driver
        ↓
Concrete Renderer Runtime
```

Текущая реализация:

```text
SVG/DOM menu
   ↓
dom-scene-adapter.js
   ↓
scene-graph.js
   ↓
motion-plan.js
   ↓
timeline.js
   ↓
drivers/waapi-driver.js
   ↓
Web Animations API
```

Будущие реализации не должны менять Scene Graph/Timeline ради подключения другого renderer:

```text
Scene Graph + Motion Plan + Timeline
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
- `transformOwner` — явный владелец transform;
- `metadata` — расширяемые данные.

Текущие layers:
- `background`;
- `menu`;
- `atmosphere`;
- `entity`.

`entity` резервируется уже сейчас, но обычный menu motion compiler не имеет права автоматически применять к нему `item_effect`.

## Renderer adapters

Adapter связывает конкретное представление с renderer-neutral scene graph.

`dom-scene-adapter.js` — единственное место Motion Engine core, которое знает selectors готового SVG/DOM меню. Он:
- находит section/item/promotion/price/background/atmosphere targets;
- создаёт scene nodes;
- сохраняет phase/order для связанных объектов;
- размечает DOM диагностическими `data-motion-*` атрибутами.

Будущий GPU adapter должен создавать те же scene node contracts, но `target` может быть, например, `Pixi.Container` или `Three.Object3D`.

## Transform ownership

Один render target не должен получать конкурирующие transform writers в одном канале.

Плашка «Акция» является отдельным sibling scene node относительно `table-item-content`, поэтому scale строки не применяется второй раз к `path + text` плашки. Price может иметь собственный node, потому что его дополнительный transform является намеренной дочерней анимацией.

Новые слои/сущности обязаны явно объявлять `transformOwner`.

## Motion Plan

`motion-plan.js` компилирует профиль в renderer-neutral tracks.

В plan запрещены browser-specific CSS transform/filter strings. Keyframe state хранится числами:
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

Текущий `WaapiMotionDriver` является первым adapter/runtime driver и единственным местом, где вызывается `Element.animate()`.

## Live Entity boundary

Live Entity — отдельная runtime-система, а не новый item preset.

Будущий entity runtime должен иметь:
- собственный scene adapter;
- собственный state machine;
- собственный behavior/scene compiler;
- возможность использовать общий timeline contract;
- отдельный driver либо общий GPU driver;
- независимый lifecycle от критичного menu renderer.

Menu motion compiler игнорирует неизвестные `kind`, включая будущий `entity`, пока для него явно не подключён отдельный compiler.

## Что намеренно НЕ делаем сейчас

На этом этапе не вводятся:
- FPS limits;
- asset budgets;
- device tiers;
- automatic quality degradation;
- PixiJS/Three.js dependencies;
- WebGL/WebGPU runtime;
- новые persistence migrations.

Эти решения будут приниматься отдельными этапами после появления реальных GPU-сцен и измерений.

## Неподвижные архитектурные правила

1. Canonical menu renderer остаётся источником читаемого меню.
2. Scene Graph не зависит от renderer.
3. Motion Plan не содержит CSS/WebGL/Three/Pixi-specific serialization.
4. Timeline не зависит от renderer.
5. Concrete driver — единственное место сериализации состояния под конкретный runtime.
6. Live Entity не наследует menu behavior неявно.
7. GPU/Entity никогда не должны становиться обязательным условием отображения основного меню.
