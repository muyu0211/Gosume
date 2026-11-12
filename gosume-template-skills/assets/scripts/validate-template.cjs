#!/usr/bin/env node
/**
 * Gosume 模板包静态校验器（跨平台、零依赖）
 * ===================================================================
 * 唯一的校验实现：package-template.ps1 / .sh 都在打包前调用本脚本，
 * 规则与 pkg/resume/template/template_importer.go 保持一致，另加渲染契约提示。
 *
 * 用法：
 *   node validate-template.cjs <模板目录>                 完整校验（错误阻断，警告提示）
 *   node validate-template.cjs <模板目录> --strict       警告也视为失败
 *   node validate-template.cjs <模板目录> --print-name      仅输出清洗后的 <name>.zip 文件名
 *   node validate-template.cjs <模板目录> --print-name-b64 同上但输出 UTF-8 的 base64（供 PS5.1 无损捕获中文）
 *
 * 退出码：0 = 通过；1 = 存在错误（--strict 下含警告）；2 = 用法/环境问题
 * ===================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 与 template_importer.go 保持一致的常量
const MAX_FILE_SIZE = 2 << 20;         // 2 MB
const MAX_PACKAGE_SIZE = 10 << 20;     // 10 MB
const MAX_ENTRIES = 2;                 // MaxTemplateEntries
const REQUIRED = ['template.json', 'styles.css'];
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;
const CATEGORY_ENUM = ['tech', 'business', 'creative', 'academic', 'general'];

const ITEM_CLASSES = [
  '.section-title', '.experience-item', '.education-item', '.award-item',
  '.custom-item', '.skill-category', '.skill-item', '.sidebar-item',
];
const DETAIL_CLASSES = [
  '.exp-header', '.exp-location', '.exp-summary', '.highlights',
  '.edu-detail', '.edu-courses', '.extra-row',
];
const LEGACY_CLASSES = [
  '.sidebar ', '.header-left', '.header-avatar', '.contact-info',
  '.school', '.skill-list', '.inline-list', '.english-name', '.job-title',
  '.custom-subtitle', '.contact-line',
];

function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith('--'));
  const strict = argv.includes('--strict');
  const printName = argv.includes('--print-name');
  const printNameB64 = argv.includes('--print-name-b64');

  if (positional.length !== 1) {
    process.stderr.write('用法: node validate-template.cjs <模板目录> [--strict|--print-name]\n');
    process.exit(2);
  }
  const dir = path.resolve(positional[0]);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    if (printName) {
      process.stderr.write('模板目录不存在\n');
      process.exit(2);
    }
    fail('模板目录不存在或不是目录: ' + dir);
    return;
  }

  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  // ── 1. 包结构 ────────────────────────────────────────────────
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  for (const name of REQUIRED) {
    if (!files.includes(name)) err(`缺少必需文件: ${name}（zip 根目录必须恰好是 ${REQUIRED.join(' + ')}）`);
  }
  if (dirs.length) warn(`目录内有子目录（${dirs.join(', ')}）：打包只会取两个必需文件，不会带上它们`);

  if (files.includes('template.html')) {
    err('目录含 template.html：HTML 由应用内置，且源码 MaxTemplateEntries=2，带第三个文件导入会报 "template package has too many files"，必须删除');
  }
  const extra = files.filter((f) => !REQUIRED.includes(f) && f !== 'template.html');
  if (extra.length) warn(`目录内有额外文件（${extra.join(', ')}）：打包脚本不会把它们放进 zip`);

  // 条目数 / 体积（只按会被打包的两个文件计）
  const packed = REQUIRED.filter((f) => files.includes(f));
  if (packed.length > MAX_ENTRIES) err(`包内文件条目数 ${packed.length} > ${MAX_ENTRIES}`);
  let total = 0;
  for (const name of packed) {
    const size = fs.statSync(path.join(dir, name)).size;
    total += size;
    if (size > MAX_FILE_SIZE) err(`${name} 超过单文件上限 2MB（${size} bytes）`);
  }
  if (total > MAX_PACKAGE_SIZE) err(`解压后累计 ${total} bytes 超过整包上限 10MB`);

  // ── 2. 元数据 ────────────────────────────────────────────────
  let meta = null;
  const jsonPath = path.join(dir, 'template.json');
  if (files.includes('template.json')) {
    try {
      meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (e) {
      err(`parse template.json: ${e.message}`);
    }
  }

  if (meta) {
    const id = String(meta.id ?? '').trim();
    const name = String(meta.name ?? '').trim();
    const version = String(meta.version ?? '').trim();
    const author = String(meta.author?.name ?? '').trim();
    const paper = String(meta.paper_size ?? '').trim();

    if (!ID_PATTERN.test(id)) err('id 不匹配 ^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$（推荐 UUID v4）');
    if (!name) err('name 为空（template name is required）');
    if (!version) err('version 为空（template version is required）');
    if (!author) err('author.name 为空（template author name is required）');
    if (paper && paper !== 'A4') err(`paper_size 是 "${paper}"，导入校验只接受 "A4"`);
    if (!paper) warn('paper_size 为空：导入时会被 normalize 成 A4，建议显式填 "A4"');

    if (meta.uses_unified_html !== true) warn('uses_unified_html 建议设为 true');
    if (version && !/^\d+\.\d+\.\d+/.test(version)) warn('version 建议用 SemVer（MAJOR.MINOR.PATCH）');
    if (!Array.isArray(meta.tags) || meta.tags.length < 3) warn('tags 建议至少 3 个（AGENTS.md 约定）');
    if (meta.category && !CATEGORY_ENUM.includes(meta.category)) {
      warn(`category "${meta.category}" 不在枚举 tech/business/creative/academic/general 内`);
    }

    const colors = meta.colors || {};
    const colorKeys = ['primary', 'secondary', 'text', 'background', 'accent'];
    for (const k of colorKeys) {
      const v = colors[k];
      if (!v) warn(`colors.${k} 缺失`);
      else if (!/^#[0-9A-Fa-f]{6}$/.test(v)) warn(`colors.${k}="${v}" 应为 6 位 HEX #RRGGBB`);
    }
  }

  // ── 3. CSS 基础与渲染契约 ────────────────────────────────────
  let css = '';
  if (files.includes('styles.css')) css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
  if (!css.trim()) err('styles.css is empty');

  if (css.trim()) {
    const clean = stripComments(css);

    if (/@import\b/i.test(clean)) err('CSS 含 @import：禁止引入外部样式表');
    if (/url\(\s*['"]?https?:/i.test(clean)) err('CSS 引用了外部 URL：禁止外部图片/字体');
    if (/@font-face[^}]*https?:/i.test(clean)) err('CSS 含在线 @font-face：只能使用系统字体');

    // 页边距必须经变量消费
    const isTwoColumn = /\.resume-container\s*\{[^}]*display\s*:\s*grid/.test(clean);
    const pageBlocks = blocksFor(clean, '.resume-page');
    const sideBlocks = blocksFor(clean, '.r-header').concat(blocksFor(clean, '.r-main'));
    const singleVar = pageBlocks.some((b) => /var\(\s*--resume-padding\s*,/.test(b));
    const doubleVar = sideBlocks.some((b) => /var\(\s*--resume-padding-[xy]\s*,/.test(b));
    if (isTwoColumn) {
      if (!doubleVar) warn('双栏模板：.r-header / .r-main 的 padding 未消费 var(--resume-padding-y/-x, …)');
    } else if (!singleVar) {
      warn('单栏模板：.resume-page 的 padding 未消费 var(--resume-padding, …)（页边距调整会失效）');
    }

    // 联系方式分组：单栏应显式适配；双栏靠全局 display:contents 兜底（不要求栅格）
    if (!isTwoColumn) {
      if (!/\.r-contact-group/.test(clean)) {
        warn('单栏模板未出现 .r-contact-group：建议按 4 列栅格 + display:contents 适配（见 style-guide.md 第 7 节）');
      }
      if (!/\.r-contact-item[^}]*min-width\s*:\s*0/.test(clean)) {
        warn('.r-contact-item 未见 min-width: 0：长值自适应跨列（contactFit）可能失效');
      }
    }

    // 字体必须经变量消费
    if (!/--font-family\s*:/.test(clean)) {
      warn('未定义 --font-family 变量：用户切换全局字体不会生效');
    } else {
      // 先剔除 :root 变量定义与所有自定义属性声明，再逐条看 font-family 的值
      // （不能用 (?!var\() 负向预查：\s* 回溯会让它在空格处"绕过"预查而误报）
      const noRoot = clean
        .replace(/:root\s*\{[^}]*\}/g, '')
        .replace(/--[A-Za-z0-9_-]+\s*:\s*[^;}]*/g, '');
      const decls = noRoot.match(/font-family\s*:\s*[^;}]+/g) || [];
      const hardCoded = decls.filter((d) => !/:\s*var\(/.test(d));
      if (hardCoded.length) warn('存在硬编码 font-family（应全部用 var(--font-family*)）：' + hardCoded.length + ' 处');
    }

    // 必选元素
    if (!/@page\b/.test(clean)) warn('缺少 @page { size: A4; margin: 0; }（打印分页）');
    if (!/\.page-break\s*\{/.test(clean)) warn('缺少 .page-break 工具类');
    if (!/\.skill-dot\s*\{/.test(clean) || !/\.skill-dot\.filled\s*\{/.test(clean)) {
      warn('未定义 .skill-dot / .skill-dot.filled：若模板要显示技能等级点，必须补上这两个类');
    }
    const summaryBlock = blocksFor(clean, '.summary').join(' ');
    if (!/overflow-wrap|word-break/.test(summaryBlock)) {
      warn('.summary 缺少 overflow-wrap / word-break 换行规则');
    }
    const avatarBlock = blocksFor(clean, '.r-avatar img').join(' ');
    if (avatarBlock && !(/width\s*:/.test(avatarBlock) && /height\s*:/.test(avatarBlock) && /object-fit/.test(avatarBlock))) {
      warn('.r-avatar img 需同时设置 width + height + object-fit');
    }

    // 节奏方向：仅检查内容类选择器块内的 margin-top
    const rhythm = ITEM_CLASSES.concat(DETAIL_CLASSES);
    const offenders = [];
    for (const b of allBlocks(clean)) {
      if (rhythm.some((cls) => b.selector.includes(cls)) && /margin-top\s*:/.test(b.body)) {
        offenders.push(b.selector.trim().slice(0, 60));
      }
    }
    if (offenders.length) warn('内容类组件使用了 margin-top（节奏间距应一律 margin-bottom）：' + offenders.slice(0, 3).join(' | '));

    // 分页易碎选择器
    if (/:(?:first-child|last-child|nth-child|only-child)\b/.test(clean)) {
      warn('CSS 出现 :first-child / :nth-child() 等结构选择器：分页克隆会改变兄弟关系，建议改用纯类名');
    }
    const legacy = LEGACY_CLASSES.filter((c) => clean.includes(c));
    if (legacy.length) warn('疑似旧版类名: ' + legacy.join(', '));
    if (/\.(?:exp-summary|summary|extra-value)\s+(?:ul|ol)\b/.test(clean)) {
      warn('模板自定义了 Markdown 列表样式：marker 已由 resume-global.css 全局收敛，重复定义会出现双圆点');
    }
  }

  // ── 4. 输出 ──────────────────────────────────────────────────
  if (printName || printNameB64) {
    if (errors.length) {
      process.stderr.write(errors.join('\n') + '\n');
      process.exit(1);
    }
    const safe = safeFileName(meta ? meta.name : 'template');
    // PowerShell 5.1 捕获外部程序 stdout 时按系统 ANSI 代码页解码，中文名会乱码；
    // base64 是纯 ASCII，可无损穿越控制台编码，由 PS 侧再按 UTF-8 还原。
    if (printNameB64) process.stdout.write(Buffer.from(safe, 'utf8').toString('base64') + '\n');
    else process.stdout.write(safe + '\n');
    process.exit(0);
  }

  const header = 'Gosume 模板校验: ' + dir;
  if (!errors.length && !warnings.length) {
    process.stdout.write(header + '\n  ✔ 结构 / 元数据 / 渲染契约全部通过\n');
    process.exit(0);
  }
  let out = header + '\n';
  if (warnings.length) {
    out += '  ⚠ ' + warnings.length + ' 条提示:\n';
    for (const w of warnings) out += '    - ' + w + '\n';
  }
  if (errors.length) {
    out += '  ✘ ' + errors.length + ' 项错误:\n';
    for (const e of errors) out += '    - ' + e + '\n';
  }
  out += errors.length
    ? '结果: 未通过（请修复错误后重新打包）\n'
    : (strict ? '结果: --strict 模式下警告视为失败\n' : '结果: 通过（提示项建议一并处理）\n');
  process.stdout.write(out);
  process.exit(errors.length || (strict && warnings.length) ? 1 : 0);
}

function fail(msg) {
  process.stdout.write('Gosume 模板校验\n  ✘ ' + msg + '\n结果: 未通过\n');
  process.exit(1);
}

/** 去掉 CSS 注释，避免把示例注释误判为规则。 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 所有顶层 { } 块（@media 内部会被摊平，用于宽松的静态提示）。 */
function allBlocks(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) out.push({ selector: m[1], body: m[2] });
  return out;
}

/** 取某个选择器的所有声明块内容（可能有多处，如 @media print）。 */
function blocksFor(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped + '\\s*\\{([^}]*)\\}', 'g');
  const out = [];
  let m;
  while ((m = re.exec(css)) !== null) out.push(m[1]);
  return out;
}

/** 清洗 template.json 的 name，作为跨平台安全的 zip 文件名（不含扩展名）。 */
function safeFileName(name) {
  let s = String(name ?? '').trim()
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\.+$/, '')
    .trim();
  if (s.length > 80) s = s.slice(0, 80);
  return s || 'template';
}

main();
