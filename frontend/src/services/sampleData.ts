import type { Resume } from '../types/resume'
import { generateId, DEFAULT_FONT_SIZE } from '../types/resume'
import { DEFAULT_MARGIN_KEY, DEFAULT_SECTION_SPACING_KEY } from '../lib/layoutPresets'
import avatarUrl from '../assets/svg/identity.svg'

export function createSampleResume(templateId: string): Resume {
  return {
    version: '1.0',
    meta: {
      template_id: templateId,
      language: 'zh-CN',
      font_size: DEFAULT_FONT_SIZE,
      page_margin: DEFAULT_MARGIN_KEY,
      section_spacing: DEFAULT_SECTION_SPACING_KEY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      export_count: 0,
      name: '示例简历',
    },
    personal: {
      full_name: '张三',
      english_name: 'San Zhang',
      email: 'san.zhang@example.com',
      phone: '138-0000-1234',
      wechat: 'zhangsan_dev',
      location: '上海市浦东新区',
      avatar: avatarUrl,
      github: 'github.com/san-zhang',
      job_title: '高级前端工程师',
      years_of_exp: 6,
    },
    summary:
      '拥有6年前端开发经验，精通React、Vue等主流框架，具备良好的工程化思维和团队协作能力。主导过多个大型中后台管理系统的架构设计与性能优化，关注代码质量、用户体验与技术演进。善于跨团队沟通，能够推动复杂项目从0到1落地。',
    internships: [
      {
        id: generateId(),
        company: '腾讯',
        title: '前端开发实习生',
        location: '深圳',
        start_date: '2018.01',
        end_date: '2018.05',
        is_current: false,
        summary: '参与腾讯云控制台前端开发，负责部分页面组件开发与单元测试编写。',
        highlights: [
          '独立完成3个后台管理页面的前端开发，按时交付并通过Code Review',
          '编写20+单元测试用例，覆盖率达85%',
          '参与前端技术分享会，主讲ES6新特性在实际项目中的应用',
        ],
      },
    ],
    jobs: [
      {
        id: generateId(),
        company: '字节跳动',
        title: '高级前端工程师',
        location: '上海',
        start_date: '2020.03',
        is_current: true,
        summary:
          '负责抖音电商中后台管理系统的前端架构设计与核心模块开发，主导微前端架构落地与技术栈升级。',
        highlights: [
          '主导微前端架构从零落地，将巨石应用拆分为8个独立子应用，部署效率提升60%',
          '搭建组件库与脚手架工具，统一20+项目中后台的技术栈与UI规范',
          '优化Webpack构建流程，生产环境构建时间从8分钟降至2分钟',
          '带领4人前端小组，制定代码评审规范与技术分享机制',
        ],
      },
      {
        id: generateId(),
        company: '美团',
        title: '前端工程师',
        location: '北京',
        start_date: '2018.07',
        end_date: '2020.02',
        is_current: false,
        summary: '参与美团外卖商家端Web与移动端开发，负责订单管理、数据分析等核心模块。',
        highlights: [
          '重构订单管理模块，使用React Hooks替代Class组件，代码量减少35%',
          '实现首屏SSR方案，LCP从3.2s优化至1.1s，商家满意度提升15%',
          '开发商家数据分析看板，支持自定义报表与实时数据展示',
        ],
      },
    ],
    education: [
      {
        id: generateId(),
        school: '浙江大学',
        degree: '硕士',
        major: '计算机科学与技术',
        start_date: '2016.09',
        end_date: '2018.06',
        gpa: '3.8/4.0',
        courses: '高级算法、分布式系统、机器学习、自然语言处理',
        highlights: ['获国家奖学金', '发表CCF-A类论文1篇'],
      },
      {
        id: generateId(),
        school: '华中科技大学',
        degree: '学士',
        major: '软件工程',
        start_date: '2012.09',
        end_date: '2016.06',
        gpa: '3.6/4.0',
        courses: '数据结构、操作系统、计算机网络、编译原理、数据库系统',
        highlights: ['校级优秀毕业生', 'ACM-ICPC亚洲区域赛银奖'],
      },
    ],
    skills: [
      {
        id: generateId(),
        category: '前端技术',
        items: [
          { name: 'React / Next.js', level: 5 },
          { name: 'Vue / Nuxt', level: 4 },
          { name: 'TypeScript', level: 5 },
          { name: 'Tailwind CSS', level: 5 },
          { name: 'Webpack / Vite', level: 4 },
        ],
      },
      {
        id: generateId(),
        category: '后端与工具',
        items: [
          { name: 'Node.js / Express', level: 4 },
          { name: 'Go', level: 3 },
          { name: 'Docker / K8s', level: 3 },
          { name: 'Git / CI/CD', level: 5 },
        ],
      },
    ],
    languages: [
      { id: generateId(), name: '中文', level: '母语' },
      { id: generateId(), name: '英语', level: '流利 (CET-6 580)' },
    ],
    projects: [
      {
        id: generateId(),
        name: 'Mars UI 组件库',
        role: '核心开发者',
        start_date: '2021.06',
        end_date: '2022.03',
        summary:
          '从零搭建支持React/Vue双框架的企业级组件库，包含50+高质量组件，服务公司内部20+项目。',
        highlights: [
          '设计主题定制系统，支持CSS变量与运行时主题切换',
          '集成Storybook文档与单元测试，组件覆盖率达95%',
          'npm周下载量突破3000+，被5个部门采用',
        ],
      },
      {
        id: generateId(),
        name: '前端监控告警平台',
        role: '项目负责人',
        start_date: '2022.06',
        end_date: '2023.01',
        summary: '自研前端错误监控与性能分析平台，支持SourceMap解析、会话回放与智能告警。',
        highlights: [
          '设计高性能日志上报SDK，日处理日志量超5000万条',
          '实现SourceMap自动解析服务，错误定位准确率提升至98%',
          '基于异常检测算法实现智能告警，误报率降低70%',
        ],
      },
    ],
    awards: [
      {
        id: generateId(),
        title: '公司年度技术创新奖',
        date: '2022',
        issuer: '字节跳动',
        summary: '因微前端架构落地与前端工程化建设获评年度技术创新奖',
      },
      {
        id: generateId(),
        title: '最佳技术分享讲师',
        date: '2021',
        issuer: '字节跳动前端技术委员会',
        summary: '全年主讲8场技术分享，内容涵盖性能优化、TypeScript进阶等主题',
      },
    ],
  }
}
