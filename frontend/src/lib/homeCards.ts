/**
 * 首页两种卡片（【我的简历】简历卡片 / 【简历模板】模板卡片）共享的网格规范。
 *
 * 两个面板必须引用同一常量，保证任意断点下两种卡片的列数（→ 宽度）完全一致：
 * 移动端 2 列、md 起 3 列、xl（≥1280px）起 4 列，列间距统一 gap-5（20px）。
 * 卡片高度由「预览区 aspect-ratio + 信息区等高结构」决定（见两个卡片组件）。
 */
export const HOME_CARD_GRID = 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5'
