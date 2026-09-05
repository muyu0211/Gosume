import avatarRaw from '../assets/svg/identity.svg?raw'

/**
 * 默认灰色头像（自包含 data URI）。
 *
 * 直接引用 Vite 打包产物会把头像变成依赖源站的相对路径（如 /assets/identity-xxx.svg），
 * 编辑器预览（由 Wails/Vite 托管）能正常显示，但导出走 rod 无头浏览器时没有源站与
 * baseURL，该路径无法解析而显示裂图。内联为 data URI 后预览与导出均可正常渲染。
 * 去掉 SVG 的 XML 声明与 DOCTYPE，避免 Chromium 对 data URI 内外部 DTD 的兼容问题。
 */
export const DEFAULT_AVATAR_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  avatarRaw.replace(/^<\?xml[\s\S]*?\?>\s*/, '').replace(/^<!DOCTYPE[\s\S]*?>\s*/, ''),
)}`

/** 判断头像是否自包含（data URI）。外链/相对路径在无头导出中无法解析。 */
export function isSelfContainedAvatar(avatar?: string): boolean {
  return typeof avatar === 'string' && avatar.startsWith('data:image/')
}

/**
 * 渲染前归一化头像：
 * - 未设置 / 已删除（空串）：原样返回，不渲染头像区；
 * - 自包含（data URI）：原样返回；
 * - 其余（历史版本存下的 /assets/... 相对路径等依赖源站的值）：替换为默认灰色头像，
 *   保证导出不裂图。
 */
export function resolveAvatar(avatar?: string): string | undefined {
  if (!avatar) return avatar
  return isSelfContainedAvatar(avatar) ? avatar : DEFAULT_AVATAR_DATA_URI
}
