// 简历字段 ↔ 表单字段 的启发式匹配。字段键与 Go 侧 normalize.go 的 Fields 契约一致。
// 规则命中即可，保证第一次给出的建议足够合理；歧义时由用户在预览面板手动纠正。

// 每个规范键对应其“常见标签关键词”。关键词全部小写匹配。
const KEYWORDS = {
  name: ['姓名', '名字', 'name', 'real name', 'full name', '真实姓名'],
  english_name: ['英文名', 'english name', 'english'],
  email: ['邮箱', 'email', 'e-mail', 'mail'],
  phone: ['手机', '电话', '联系电话', 'mobile', 'tel', 'phone'],
  wechat: ['微信', 'wechat', 'weixin'],
  qq: ['qq'],
  location: ['所在城市', '现居城市', '现居地', '现住', '城市', 'location', 'city', '地址', '现住址'],
  website: ['个人网站', 'website', '主页', 'portfolio', '作品集'],
  linkedin: ['linkedin'],
  github: ['github', 'git'],
  birthday: ['生日', '出生日期', '出生年月', 'birthday', '出生', 'birth'],
  gender: ['性别', 'gender', 'sex'],
  target_position: ['求职意向', '应聘职位', '期望职位', '期望岗位', '意向岗位', '应聘岗位', '目标职位', 'position', '目标岗位', '应聘岗位'],
  years_of_exp: ['工作年限', '工龄', '经验年限', '工作年数', 'yearsofexp', '工作经验'],
  summary: ['个人简介', '自我介绍', '自我评价', '个人总结', '能力总结', 'summary', 'profile', 'about me', '简介', '关于我', '一句话介绍'],
  school: ['学校', '院校', '毕业院校', '大学', 'school', 'university', '学院'],
  degree: ['学历', '学位', '最高学历', 'degree'],
  major: ['专业', 'major', '主修'],
  minor: ['辅修', 'minor'],
  gpa: ['gpa', '绩点'],
  edu_start_date: ['入学时间', '入学', '开始时间在校'],
  edu_end_date: ['毕业时间', '毕业', '结束时间在校'],
  company: ['公司', '单位', '企业', '公司名称', 'company', 'employer', '工作单位', '就职公司'],
  work_position: ['职位', '职务', '岗位', 'title', '担任职务', '担任职位'],
  work_start_date: ['入职时间', '入职', '起始时间在职'],
  work_end_date: ['离职时间', '离职', '结束时间在职'],
  skills: ['技能', '特长', '专业技能', '技术栈', 'skill', '能力', '掌握技能'],
};

// English 键展示名 → 中文。
const FIELD_LABELS = {
  name: '姓名', english_name: '英文名', email: '邮箱', phone: '手机号', wechat: '微信',
  qq: 'QQ', location: '所在地', website: '个人网站', linkedin: 'LinkedIn', github: 'GitHub',
  birthday: '生日', gender: '性别', target_position: '求职意向', years_of_exp: '工作年限',
  summary: '个人简介', school: '毕业院校', degree: '学历', major: '专业', minor: '辅修',
  gpa: 'GPA', edu_start_date: '入学时间', edu_end_date: '毕业时间', company: '公司',
  work_position: '职位', work_start_date: '入职时间', work_end_date: '离职时间', skills: '技能',
};

// 类型强提示：某些表单控件类型几乎必然对应某个简历字段。
const TYPE_HINTS = {
  email: 'email',
  tel: 'phone',
};

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

// 基于表单字段的特征（label / name / type）猜测最匹配的简历字段键。
function suggestField(field, payload) {
  const type = (field.type || '').toLowerCase();
  if (TYPE_HINTS[type] && payload.fields[TYPE_HINTS[type]]) {
    return TYPE_HINTS[type];
  }

  const haystack = normalize(fieldSearchText(field) + ' ' + (field.type || ''));
  const fields = payload.fields || {};

  let bestKey = null;
  let bestScore = 0;
  for (const key of Object.keys(KEYWORDS)) {
    if (!fields[key]) continue; // 简历中无此数据，跳过
    let score = 0;
    for (const kw of KEYWORDS[key]) {
      if (haystack.includes(normalize(kw))) score += kw.length > 1 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestScore > 0 ? bestKey : null;
}

// 列出简历中所有可用字段（含 spec 化的值），供下拉框手动选择。
function listResumeFields(payload) {
  const out = [];
  const f = payload.fields || {};
  for (const key of Object.keys(f)) {
    const value = f[key];
    if (typeof value === 'string' && value.trim()) {
      out.push({ key, label: FIELD_LABELS[key] || key, value });
    }
  }
  return out;
}

// 附加在 suggestField 中被误写的辅助：把 name/placeholder 也并入 haystack。
// 单独暴露，避免 popup 重复实现。
function fieldSearchText(field) {
  return [field.label, field.nameAttr || '', field.placeholder || ''].filter(Boolean).join(' ');
}

window.GosumeMap = { KEYWORDS, FIELD_LABELS, listResumeFields, suggestField, fieldSearchText };