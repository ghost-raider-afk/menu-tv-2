export class WaapiMotionDriver {
  constructor() {
    this.name = 'waapi';
  }

  createTrack(track) {
    if (!(track?.node?.element instanceof Element)) throw new TypeError('WAAPI track requires a DOM element.');
    return track.node.element.animate(track.keyframes, track.timing);
  }

  createClock(root, clock) {
    if (!(root instanceof Element)) throw new TypeError('WAAPI clock requires a DOM root.');
    return root.animate([{ opacity: 1 }, { opacity: 1 }], clock);
  }

  play(handle) {
    handle?.play?.();
  }

  pause(handle) {
    handle?.pause?.();
  }

  cancel(handle) {
    handle?.cancel?.();
  }

  seek(handle, milliseconds) {
    if (handle) handle.currentTime = milliseconds;
  }

  currentTime(handle) {
    return Number(handle?.currentTime) || 0;
  }

  playState(handle) {
    return handle?.playState || 'idle';
  }
}
