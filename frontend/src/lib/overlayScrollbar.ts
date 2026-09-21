/**
 * 悬浮滚动条通用组件。
 *
 * 接入方式：给滚动容器挂约定类（`.gosume-modal-scroll` / `.overlay-scroll` /
 * `.glass-menu`），`initOverlayScrollbars()` 在应用启动时扫描一次，
 * 之后由 MutationObserver 自动跟随 React 挂载/卸载，组件侧零改动。
 * 容器 position 为 static 时由本模块内联补 relative（fixed/absolute 容器跳过）。
 */

type CleanupFn = () => void;

interface OverlayHost extends HTMLElement {
  __gosumeOverlayScrollCleanup?: CleanupFn;
}

/** 需要悬浮滚动条的滚动容器（约定类，后续新增容器挂类即生效） */
const SELECTOR = '.gosume-modal-scroll, .overlay-scroll, .glass-menu';

const THUMB_MIN_H = 24;

function attach(el: HTMLElement): void {
  if (el.classList.contains('overlay-scroll-thumb')) return;
  const host = el as OverlayHost;
  if (host.__gosumeOverlayScrollCleanup) return;

  // 滑块是 absolute，容器必须建立包含块；fixed/absolute 容器本身就是包含块，勿动
  let weSetPosition = false;
  if (getComputedStyle(el).position === 'static') {
    el.style.position = 'relative';
    weSetPosition = true;
  }

  const thumb = document.createElement('div');
  thumb.className = 'overlay-scroll-thumb';
  thumb.style.display = 'none';
  el.appendChild(thumb);
  el.classList.add('overlay-scroll-host');

  let lastTop = 0;

  const update = () => {
    if (!el.isConnected) {
      cleanup();
      return;
    }
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 1) {
      thumb.style.display = 'none';
      return;
    }
    if (thumb.style.display === 'none') thumb.style.display = '';
    const trackH = el.clientHeight;
    const thumbH = Math.max(THUMB_MIN_H, Math.round((trackH / el.scrollHeight) * trackH));
    const ratio = el.scrollTop / maxScroll;
    lastTop = Math.round(el.scrollTop + ratio * (trackH - thumbH));
    thumb.style.height = `${thumbH}px`;
    thumb.style.transform = `translateY(${lastTop}px)`;
  };

  // 容器自身尺寸变化（窗口缩放/面板重定位）
  const ro = new ResizeObserver(update);
  ro.observe(el);
  // 内容变化（表单加字段、选项列表增减、输入换行等导致 scrollHeight 变化）
  const cm = new MutationObserver(update);
  cm.observe(el, { childList: true, subtree: true });
  el.addEventListener('scroll', update, { passive: true });

  // 滑块拖拽 + 点击轨道跳转
  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (thumb.style.display === 'none') return;
    const trackH = el.clientHeight;
    const thumbH = thumb.offsetHeight;
    const range = Math.max(1, trackH - thumbH);
    const maxScroll = el.scrollHeight - el.clientHeight;
    const startY = e.clientY;
    const startTop = lastTop;
    thumb.classList.add('is-dragging');
    thumb.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const ratio = Math.min(1, Math.max(0, (startTop + (ev.clientY - startY)) / range));
      el.scrollTop = ratio * maxScroll;
    };
    const onUp = (ev: PointerEvent) => {
      thumb.classList.remove('is-dragging');
      thumb.releasePointerCapture(ev.pointerId);
      thumb.removeEventListener('pointermove', onMove);
      thumb.removeEventListener('pointerup', onUp);
      thumb.removeEventListener('pointercancel', onUp);
    };
    thumb.addEventListener('pointermove', onMove);
    thumb.addEventListener('pointerup', onUp);
    thumb.addEventListener('pointercancel', onUp);
  });

  function cleanup() {
    ro.disconnect();
    cm.disconnect();
    el.removeEventListener('scroll', update);
    thumb.remove();
    el.classList.remove('overlay-scroll-host');
    if (weSetPosition) el.style.position = '';
    delete host.__gosumeOverlayScrollCleanup;
  }

  host.__gosumeOverlayScrollCleanup = cleanup;
  update();
}

function dispose(node: Node): void {
  const host = node as OverlayHost;
  if (node instanceof HTMLElement && host.__gosumeOverlayScrollCleanup) {
    host.__gosumeOverlayScrollCleanup();
  }
}

function attachAll(root: Node): void {
  // ⚠ 只处理命中约定类的元素。
  if (root instanceof HTMLElement && root.matches(SELECTOR)) attach(root);
  if (root instanceof Element) {
    root.querySelectorAll(SELECTOR).forEach((n) => {
      if (n instanceof HTMLElement) attach(n);
    });
  }
}

/** 应用启动时调用一次：扫描现存容器并持续跟随 DOM 增删 */
export function initOverlayScrollbars(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  attachAll(document.body);
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach(attachAll);
      m.removedNodes.forEach((n) => {
        dispose(n);
        if (n instanceof Element) n.querySelectorAll(SELECTOR).forEach(dispose);
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}
