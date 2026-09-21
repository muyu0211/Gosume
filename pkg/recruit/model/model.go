package model

// 求职进程模块的数据模型。
// JSON 字段名与前端 types/recruit.ts 逐字段对齐（snake_case 主体 +
// nearThresholdHours/saveRawText 两个驼峰例外），禁止改名——
// Wails 序列化后不一致会静默丢字段。

// JobProcess 主实体：求职进程条目。
// 类型不再独立存储：stage === "apply" 即投递记录，其余环节均为招聘通知
// （父子链/指纹/筛选等判定一律以 Stage 派生，与前端 kindOfStage 同口径）。
type JobProcess struct {
	ID          string            `json:"id"`
	Company     string            `json:"company"`
	CompanyNorm string            `json:"company_norm"`
	CompanyID   *string           `json:"company_id"`
	ParentID    *string           `json:"parent_id"`
	Position    string            `json:"position"`
	Stage       string            `json:"stage"`
	RoundNo     int               `json:"round_no"`
	EventTime   *string           `json:"event_time"`
	EventEnd    *string           `json:"event_end"`
	Deadline    *string           `json:"deadline"`
	AllDay      bool              `json:"all_day"`
	TimeBasis   *string           `json:"time_basis"`
	Link        string            `json:"link"`
	Location    string            `json:"location"`
	Online      bool              `json:"online"`
	Source      string            `json:"source"`
	Status      string            `json:"status"`
	Note        string            `json:"note"`
	RawText     *string           `json:"raw_text,omitempty"`
	Confidence  map[string]string `json:"confidence"`
	CreatedAt   string            `json:"created_at"`
	UpdatedAt   string            `json:"updated_at"`
}

// JobCompany 公司档案（三层结构顶层；norm 为归并唯一键）。
type JobCompany struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Norm      string `json:"norm"`
	Aliases   string `json:"aliases"`
	Website   string `json:"website"`
	CareerURL string `json:"career_url"`
	Contact   string `json:"contact"`
	Note      string `json:"note"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// 枚举白名单（落库为英文原名，UI label 走 i18n）。
var (
	Stages   = []string{"apply", "assessment", "written", "interview", "talk", "offer", "other"}
	Statuses = []string{"pending", "done", "dropped", "missed", "archived"}
	Sources  = []string{"manual", "email", "sms", "other"}
)

// Contains 判断枚举值是否合法。
func Contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
