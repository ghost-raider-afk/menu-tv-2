import { WaapiMotionDriver } from './drivers/waapi-driver.js';
import { buildDomMotionScene } from './dom-scene-adapter.js';
import { DEFAULT_SCENE_COMPILERS } from './motion-plan.js';
import { compileEntityBehaviorProgram } from './entity-behavior.js';
import { SceneRuntime } from './scene-runtime.js';

export class LiveMenuMotion {
  constructor(stage) {
    if (!(stage instanceof Element)) throw new TypeError('Live menu motion requires a stage element.');
    this.stage = stage;
    this.runtime = new SceneRuntime({
      root: stage,
      driver: new WaapiMotionDriver(),
      compilers: [...DEFAULT_SCENE_COMPILERS, compileEntityBehaviorProgram]
    });
    this.scene = null;
  }

  destroy() {
    this.runtime.destroy();
    this.scene = null;
    delete this.stage.dataset.motionMode;
  }

  render({ enabled = false, profile = null, entity = null } = {}) {
    this.runtime.destroy();
    this.scene = null;
    if (!enabled || !profile) {
      delete this.stage.dataset.motionMode;
      return null;
    }
    this.scene = buildDomMotionScene(this.stage);
    const plan = this.runtime.load({ scene: this.scene, context: { profile, entity } });
    this.stage.dataset.motionMode = 'continuous';
    this.runtime.play();
    return plan;
  }
}
