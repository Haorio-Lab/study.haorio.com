(function () {
  const EDITABLE_SELECTOR = "input, select, textarea, [contenteditable=''], [contenteditable='true']";
  const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, label, summary, [role='button'], [contenteditable=''], [contenteditable='true']";
  const DEFAULT_KEY_BY_ACTION = {
    previous: "ArrowLeft",
    next: "ArrowRight",
    confirm: "ArrowDown",
  };
  const NAV_BUTTON_BY_ACTION = {
    previous: 3,
    next: 4,
  };
  const ACTION_BY_KEY = {
    BrowserBack: "previous",
    BrowserForward: "next",
    PageUp: "previous",
    PageDown: "next",
    MediaTrackPrevious: "previous",
    MediaTrackNext: "next",
  };
  const ACTION_BY_KEY_CODE = {
    33: "previous",
    34: "next",
    166: "previous",
    167: "next",
  };

  function isEditableTarget(target) {
    return Boolean(target?.closest?.(EDITABLE_SELECTOR));
  }

  function isInteractiveTarget(target) {
    return Boolean(target?.closest?.(INTERACTIVE_SELECTOR));
  }

  function preventRemoteDefault(event) {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  }

  function actionFromKeyEvent(event) {
    if (event.altKey && event.key === "ArrowLeft") return "previous";
    if (event.altKey && event.key === "ArrowRight") return "next";
    return ACTION_BY_KEY[event.key] || ACTION_BY_KEY_CODE[event.keyCode] || null;
  }

  function actionFromMouseButton(event) {
    if (event.button === NAV_BUTTON_BY_ACTION.previous) return "previous";
    if (event.button === NAV_BUTTON_BY_ACTION.next) return "next";
    return null;
  }

  function actionFromTouchGesture(start, end, options) {
    const endX = Number.isFinite(end.clientX) ? end.clientX : start.x;
    const endY = Number.isFinite(end.clientY) ? end.clientY : start.y;
    const dx = endX - start.x;
    const dy = endY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const distance = Math.hypot(dx, dy);
    const duration = Date.now() - start.time;
    const swipeMinDistance = options.touchSwipeMinDistance ?? 120;
    const swipeAxisRatio = options.touchSwipeAxisRatio ?? 1.6;
    const verticalSwipeMinDistance = options.touchVerticalSwipeMinDistance ?? 80;
    const tapMaxDistance = options.touchTapMaxDistance ?? 80;
    const tapMaxDurationMs = options.touchTapMaxDurationMs ?? 900;
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
    const isCenterBand = !viewportWidth
      || (start.x >= viewportWidth * 0.25 && start.x <= viewportWidth * 0.75);

    if (absX >= swipeMinDistance && absX > absY * swipeAxisRatio) {
      return dx > 0 ? "previous" : "next";
    }

    if (absY >= verticalSwipeMinDistance && absY > absX * swipeAxisRatio) {
      return dy > 0 ? "scrollUp" : "scrollDown";
    }

    if (isCenterBand && distance <= tapMaxDistance && duration <= tapMaxDurationMs) {
      return "confirm";
    }

    return null;
  }

  function findScrollableElement(start) {
    let node = start;

    while (node && node !== document.body && node !== document.documentElement) {
      const style = window.getComputedStyle?.(node);
      const canScroll = node.scrollHeight > node.clientHeight;
      const allowsScroll = style && /(auto|scroll)/.test(`${style.overflowY}${style.overflow}`);
      if (canScroll && allowsScroll) return node;
      node = node.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function scrollByStep(action, event, options = {}) {
    const step = options.scrollStep ?? 72;
    const delta = action === "scrollUp" ? -step : step;
    const target = findScrollableElement(event?.target);

    if (target === document.scrollingElement || target === document.documentElement || target === document.body) {
      const scroller = document.scrollingElement || document.documentElement;
      scroller.scrollTop += delta;
      return true;
    }

    target.scrollTop += delta;
    return true;
  }

  function install(options) {
    const onAction = options?.onAction;
    if (typeof onAction !== "function") return () => {};

    const wheelThreshold = options.wheelThreshold ?? 40;
    const wheelCooldownMs = options.wheelCooldownMs ?? 180;
    const pointerCooldownMs = options.pointerCooldownMs ?? 220;
    const touchGestures = options.touchGestures ?? true;
    const touchStarts = new Map();
    const touchEventStarts = new Map();
    let lastWheelAt = 0;
    let lastPointerAt = 0;
    let lastTouchGestureAt = 0;

    function shouldIgnore(event) {
      return isEditableTarget(event.target) || Boolean(options.shouldIgnore?.(event));
    }

    function run(action, event) {
      const handled = onAction(action, event) !== false;
      if (handled) preventRemoteDefault(event);
      return handled;
    }

    function handleKeyDown(event) {
      if (shouldIgnore(event)) return;

      const action = actionFromKeyEvent(event);
      if (action) run(action, event);
    }

    function handleWheel(event) {
      if (shouldIgnore(event)) return;
      if (Math.abs(event.deltaY) < wheelThreshold || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      const now = Date.now();
      if (now - lastWheelAt < wheelCooldownMs) {
        preventRemoteDefault(event);
        return;
      }

      lastWheelAt = now;
      run(event.deltaY < 0 ? "scrollUp" : "scrollDown", event);
    }

    function handlePointerNavigation(event) {
      if (shouldIgnore(event)) return;

      const action = actionFromMouseButton(event);
      if (!action) return;

      const now = Date.now();
      if (now - lastPointerAt < pointerCooldownMs) {
        preventRemoteDefault(event);
        return;
      }

      lastPointerAt = now;
      run(action, event);
    }

    function shouldTrackTouchGesture(event) {
      if (!touchGestures) return false;
      if (event.pointerType && event.pointerType !== "touch") return false;
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
      if (shouldIgnore(event) || isInteractiveTarget(event.target)) return false;
      return true;
    }

    function handleTouchPointerDown(event) {
      if (!shouldTrackTouchGesture(event)) return;

      touchStarts.set(event.pointerId ?? 1, {
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
      });
    }

    function handleTouchPointerEnd(event) {
      const pointerId = event.pointerId ?? 1;
      const start = touchStarts.get(pointerId);
      touchStarts.delete(pointerId);
      if (!start || shouldIgnore(event) || isInteractiveTarget(event.target)) return;

      const action = actionFromTouchGesture(start, event, options);
      if (action) runTouchGesture(action, event);
    }

    function handleTouchPointerCancel(event) {
      touchStarts.delete(event.pointerId ?? 1);
    }

    function touchPointFromEvent(event) {
      const touch = event.changedTouches?.[0] || event.touches?.[0];
      if (!touch) return null;

      return {
        id: touch.identifier ?? 1,
        x: touch.clientX,
        y: touch.clientY,
        clientX: touch.clientX,
        clientY: touch.clientY,
      };
    }

    function handleTouchStart(event) {
      if (!touchGestures || shouldIgnore(event) || isInteractiveTarget(event.target)) return;

      for (const touch of Array.from(event.changedTouches || [])) {
        touchEventStarts.set(touch.identifier ?? 1, {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
          target: event.target,
        });
      }
    }

    function handleTouchMove(event) {
      const point = touchPointFromEvent(event);
      if (!point) return;

      const start = touchEventStarts.get(point.id);
      if (!start) return;

      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (Math.hypot(dx, dy) > (options.touchPreventDefaultDistance ?? 16)) {
        preventRemoteDefault(event);
      }
    }

    function handleTouchEnd(event) {
      const point = touchPointFromEvent(event);
      if (!point) return;

      const start = touchEventStarts.get(point.id);
      touchEventStarts.delete(point.id);
      if (!start || shouldIgnore(event) || isInteractiveTarget(event.target)) return;

      const action = actionFromTouchGesture(start, point, options);
      if (action) runTouchGesture(action, event);
    }

    function handleTouchCancel(event) {
      for (const touch of Array.from(event.changedTouches || [])) {
        touchEventStarts.delete(touch.identifier ?? 1);
      }
    }

    function runTouchGesture(action, event) {
      const now = Date.now();
      if (now - lastTouchGestureAt < (options.touchGestureCooldownMs ?? 140)) {
        preventRemoteDefault(event);
        return true;
      }

      lastTouchGestureAt = now;
      return run(action, event);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    window.addEventListener("mousedown", handlePointerNavigation, true);
    window.addEventListener("mouseup", handlePointerNavigation, true);
    window.addEventListener("auxclick", handlePointerNavigation, true);
    window.addEventListener("pointerdown", handleTouchPointerDown, true);
    window.addEventListener("pointerup", handleTouchPointerEnd, true);
    window.addEventListener("pointercancel", handleTouchPointerCancel, true);
    window.addEventListener("touchstart", handleTouchStart, { capture: true, passive: false });
    window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
    window.addEventListener("touchend", handleTouchEnd, { capture: true, passive: false });
    window.addEventListener("touchcancel", handleTouchCancel, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("wheel", handleWheel, true);
      window.removeEventListener("mousedown", handlePointerNavigation, true);
      window.removeEventListener("mouseup", handlePointerNavigation, true);
      window.removeEventListener("auxclick", handlePointerNavigation, true);
      window.removeEventListener("pointerdown", handleTouchPointerDown, true);
      window.removeEventListener("pointerup", handleTouchPointerEnd, true);
      window.removeEventListener("pointercancel", handleTouchPointerCancel, true);
      window.removeEventListener("touchstart", handleTouchStart, true);
      window.removeEventListener("touchmove", handleTouchMove, true);
      window.removeEventListener("touchend", handleTouchEnd, true);
      window.removeEventListener("touchcancel", handleTouchCancel, true);
    };
  }

  function installKeyboardBridge(options = {}) {
    const keyByAction = { ...DEFAULT_KEY_BY_ACTION, ...options.keyByAction };
    const actionHandlers = options.actionHandlers || {};

    return install({
      ...options,
      onAction(action, sourceEvent) {
        if (action === "scrollUp" || action === "scrollDown") {
          return scrollByStep(action, sourceEvent, options);
        }

        if (typeof actionHandlers[action] === "function") {
          return actionHandlers[action](sourceEvent) !== false;
        }

        const key = keyByAction[action];
        if (!key) return false;
        if (options.onAction?.(action, sourceEvent) === false) return false;

        window.dispatchEvent(new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        }));

        return true;
      },
    });
  }

  window.HaorioRemoteInput = {
    install,
    installKeyboardBridge,
    scrollByStep,
  };
})();
