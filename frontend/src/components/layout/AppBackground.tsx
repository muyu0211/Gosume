import { useEffect, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import type { BackgroundId } from '../../lib/background'

/**
 * 应用壁纸层 —— 铺在内容之下的一张渐变「墙纸」。
 *
 * 结构：一个固定全屏容器（.app-bg-layer，z-index:-1）里放两个「面」（.app-bg-face），
 * 每个面自带 `data-app-bg` 从而取到对应壁纸的 --bg-image。
 *
 * 为什么要两面：CSS 的 background-image **不可插值**，直接换渐变只会「啪」地跳变。
 * 所以换壁纸时把新图写进**背面**那一层，再把正反面翻转，让两层各自的 opacity
 * 做交叉溶解（0.3s），观感就是平滑过渡。
 *
 * 壁纸本身是纯 CSS 渐变（见 globals.css「应用背景壁纸」段），不加载任何图片文件。
 */
export function AppBackground() {
  const bg = useAppStore((s) => s.background)

  // a/b 两面各自的当前壁纸，front 指出哪一面正显示（opacity:1）。
  const [faces, setFaces] = useState<{ a: BackgroundId; b: BackgroundId; front: 'a' | 'b' }>({
    a: bg,
    b: bg,
    front: 'a',
  })

  useEffect(() => {
    setFaces((prev) => {
      // 正面已经是目标壁纸（首次挂载）→ 无需翻转，也就不会有入场动画
      if (prev[prev.front] === bg) return prev
      return prev.front === 'a'
        ? { a: prev.a, b: bg, front: 'b' }
        : { a: bg, b: prev.b, front: 'a' }
    })
  }, [bg])

  return (
    <div className="app-bg-layer" aria-hidden="true">
      <div data-app-bg={faces.a} className={faces.front === 'a' ? 'app-bg-face is-on' : 'app-bg-face'} />
      <div data-app-bg={faces.b} className={faces.front === 'b' ? 'app-bg-face is-on' : 'app-bg-face'} />
    </div>
  )
}
