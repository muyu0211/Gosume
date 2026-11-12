// 应用内品牌徽章的唯一映射（主题 → 图片路径）。
// 三张图由 .workbuddy/logo_pipeline/gen_badge_assets.py 从 images/ 同步到 frontend/public/。
// 桌面图标 / 任务栏 / 安装器固定使用麦色版，不随主题变化；此处只负责应用内可见的 logo。
export const BADGE_SRC = {
  classic: '/gosume-badge-blue.png',
  wheat: '/gosume-badge-wheat.png',
  obsidian: '/gosume-badge-dark.png',
} as const

export type BadgeTheme = keyof typeof BADGE_SRC
