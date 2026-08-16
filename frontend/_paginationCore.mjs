// src/lib/paginationCore.ts
var OVERFLOW_TOLERANCE = 2;
var MAX_SPLIT_DEPTH = 2;
function readPageStyle(doc) {
  const el = doc.querySelector(".resume-page");
  if (!el) return null;
  const s = doc.defaultView.getComputedStyle(el);
  return {
    padTop: parseFloat(s.paddingTop) || 0,
    padRight: parseFloat(s.paddingRight) || 0,
    padBottom: parseFloat(s.paddingBottom) || 0,
    padLeft: parseFloat(s.paddingLeft) || 0,
    pageBg: s.backgroundColor || "#ffffff"
  };
}
function paginateResume(doc, body, options) {
  const pageMarginBottom = options.pageMarginBottom ?? "0";
  const empty = { wrapper: doc.createElement("div"), pageCount: 1 };
  const container = body.querySelector(".resume-container");
  if (!container) return empty;
  const double = isDoubleColumn(doc, container);
  const header = container.querySelector(".r-header");
  const main = container.querySelector(".r-main");
  const mainSections = main ? Array.from(main.children) : [];
  const wrapper = doc.createElement("div");
  wrapper.className = "resume-pages-wrapper";
  body.replaceChildren(wrapper);
  const ctx = {
    doc,
    wrapper,
    padTop: options.padTop,
    padRight: options.padRight,
    padBottom: options.padBottom,
    padLeft: options.padLeft,
    pageBg: options.pageBg,
    pageMarginBottom,
    double,
    header,
    main
  };
  const cursor = { page: makePage(ctx), container: null, count: 1 };
  wrapper.appendChild(cursor.page);
  const c = cursor.page.querySelector(".resume-container");
  if (header) c.appendChild(header.cloneNode(true));
  cursor.container = appendMainShell(c, main);
  for (const section of mainSections) placeSection(ctx, cursor, section, 0);
  return { wrapper, pageCount: cursor.count };
}
function isDoubleColumn(doc, container) {
  return doc.defaultView.getComputedStyle(container).display === "grid";
}
function appendMainShell(container, main) {
  if (!main) return container;
  const shell = main.cloneNode(false);
  container.appendChild(shell);
  return shell;
}
function placeSection(ctx, cursor, section, depth) {
  const clone = section.cloneNode(true);
  cursor.container.appendChild(clone);
  void cursor.page.offsetHeight;
  if (!overflows(cursor.page)) return;
  cursor.container.removeChild(clone);
  const currentEmpty = cursor.container.children.length === 0;
  if (!currentEmpty) {
    newPage(ctx, cursor);
    cursor.container.appendChild(clone);
    void cursor.page.offsetHeight;
    if (!overflows(cursor.page)) return;
    cursor.container.removeChild(clone);
  }
  if (depth < MAX_SPLIT_DEPTH && section.children.length > 0) {
    for (const child of Array.from(section.children)) {
      placeSection(ctx, cursor, child, depth + 1);
    }
  } else {
    cursor.container.appendChild(clone);
  }
}
function newPage(ctx, cursor) {
  cursor.page = makePage(ctx);
  ctx.wrapper.appendChild(cursor.page);
  const c = cursor.page.querySelector(".resume-container");
  if (ctx.double && ctx.header) c.appendChild(ctx.header.cloneNode(false));
  cursor.container = appendMainShell(c, ctx.main);
  cursor.count++;
}
function overflows(page) {
  return page.scrollHeight > page.offsetHeight + OVERFLOW_TOLERANCE;
}
function makePage(ctx) {
  const page = ctx.doc.createElement("div");
  page.className = "resume-page";
  page.style.cssText = `width: 210mm;height: 297mm;padding: ${ctx.padTop}px ${ctx.padRight}px ${ctx.padBottom}px ${ctx.padLeft}px;overflow: hidden;background: ${ctx.pageBg};margin: 0 auto ${ctx.pageMarginBottom};box-sizing: border-box;`;
  const container = ctx.doc.createElement("div");
  container.className = "resume-container";
  container.style.maxWidth = "100%";
  page.appendChild(container);
  return page;
}
export {
  paginateResume,
  readPageStyle
};
