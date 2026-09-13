/**
 * 中国 56 个民族选项数据源（个人信息表单「民族」字段）。
 *
 * 约定与既有 political_status / marital_status 保持一致：
 * - **value 存中文原名**：模板渲染（`templates/template.html` 直接输出原值）与后端 autofill
 *   （`pkg/autofill/normalize.go` 按原文 put）都不做二次映射，换任何写法都会动到已保存
 *   简历的取值，所以这里必须原样出入。
 * - **label 同为中文原名**：民族名称是专有名词，中/英界面均显示中文原名，不走 i18n 词表
 *   （56 个词条进词典既臃肿，英文转写也没有通用定译）。
 *
 * 排序：按人口规模从多到少，汉族居首（绝大多数用户就近选择，不用翻列表）。
 * 模块级常量：避免像组件内数组那样每次渲染重建，下拉的 options 引用保持稳定。
 */

/** 人口规模降序的中国 56 个民族，汉族居首。 */
export const CHINA_ETHNICITIES: string[] = [
  '汉族',
  '壮族',
  '回族',
  '满族',
  '维吾尔族',
  '苗族',
  '彝族',
  '土家族',
  '藏族',
  '蒙古族',
  '侗族',
  '布依族',
  '瑶族',
  '白族',
  '朝鲜族',
  '哈尼族',
  '黎族',
  '哈萨克族',
  '傣族',
  '畲族',
  '傈僳族',
  '东乡族',
  '仡佬族',
  '拉祜族',
  '佤族',
  '水族',
  '纳西族',
  '羌族',
  '土族',
  '仫佬族',
  '锡伯族',
  '柯尔克孜族',
  '景颇族',
  '达斡尔族',
  '撒拉族',
  '布朗族',
  '毛南族',
  '塔吉克族',
  '普米族',
  '阿昌族',
  '怒族',
  '鄂温克族',
  '京族',
  '基诺族',
  '德昂族',
  '保安族',
  '俄罗斯族',
  '裕固族',
  '乌孜别克族',
  '门巴族',
  '鄂伦春族',
  '独龙族',
  '塔塔尔族',
  '赫哲族',
  '高山族',
  '珞巴族',
]

/** 默认民族：汉族（列表首位）。表单未选择时以此作为展示默认值。 */
export const DEFAULT_ETHNICITY: string = CHINA_ETHNICITIES[0]

/** CustomSelect 选项格式（结构兼容 SelectOption）。 */
export interface EthnicityOption {
  value: string
  label: string
}

export const ETHNICITY_OPTIONS: EthnicityOption[] = CHINA_ETHNICITIES.map((name) => ({
  value: name,
  label: name,
}))

/** 判断取值是否在 56 个民族清单内（用于识别历史自由文本输入）。 */
export function isKnownEthnicity(value: string): boolean {
  return CHINA_ETHNICITIES.includes(value)
}
