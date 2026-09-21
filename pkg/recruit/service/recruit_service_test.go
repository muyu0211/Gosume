package service

import (
	"database/sql"
	"testing"

	recruitmodel "gosume/pkg/recruit/model"
	recruitrepo "gosume/pkg/recruit/repo"
	"gosume/pkg/util"

	_ "modernc.org/sqlite"
)

// newRepos 在内存库上构建整套存储，返回注入完毕的服务。
func newRepos(t *testing.T) (*RecruitService, *recruitrepo.JobRepo) {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	settingsRepo, err := recruitrepo.NewSettingsRepo(db)
	if err != nil {
		t.Fatalf("settings repo: %v", err)
	}
	jobRepo, err := recruitrepo.NewJobRepo(db)
	if err != nil {
		t.Fatalf("job repo: %v", err)
	}
	companyRepo, err := recruitrepo.NewCompanyRepo(db)
	if err != nil {
		t.Fatalf("company repo: %v", err)
	}
	s := &RecruitService{}
	s.Inject(jobRepo, companyRepo, settingsRepo)
	return s, jobRepo
}

func mkDraft(company, status, stage string) recruitmodel.JobProcess {
	return recruitmodel.JobProcess{
		Company: company, CompanyNorm: normalizeCompany(company),
		Position: "后端开发工程师", Stage: stage, Status: status, Source: "manual",
		Confidence: map[string]string{},
	}
}

// 表为空时 GetSettings 返回默认值（48 / false）。
func TestGetSettings_Default(t *testing.T) {
	s, _ := newRepos(t)
	rsp := s.GetSettings()
	if !rsp.IsSuccess() {
		t.Fatalf("GetSettings failed: %s", rsp.Message)
	}
	data, err := util.ParseData[recruitrepo.JobSettings](rsp)
	if err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if data.NearThresholdHours != 48 || data.SaveRawText != false {
		t.Fatalf("unexpected default: %+v", data)
	}
}

// 部分 patch 只更新出现的键；saveRawText=false 是合法值不能被忽略。
func TestSetSettings_PartialMerge(t *testing.T) {
	s, _ := newRepos(t)

	rsp := s.SetSettings(map[string]any{"saveRawText": true})
	if !rsp.IsSuccess() {
		t.Fatalf("SetSettings failed: %s", rsp.Message)
	}
	cur := s.settingsRepo.Get()
	if !cur.SaveRawText || cur.NearThresholdHours != 48 {
		t.Fatalf("after saveRawText=true: %+v", cur)
	}

	// 关键回归：把 saveRawText 关回 false —— 修复前用户报的「取消选中无效」即此路径
	rsp = s.SetSettings(map[string]any{"saveRawText": false})
	if !rsp.IsSuccess() {
		t.Fatalf("SetSettings(false) failed: %s", rsp.Message)
	}
	cur = s.settingsRepo.Get()
	if cur.SaveRawText {
		t.Fatalf("saveRawText=false not persisted: %+v", cur)
	}
	if cur.NearThresholdHours != 48 {
		t.Fatalf("nearThresholdHours clobbered: %+v", cur)
	}

	// 阈值单独更新，不影响开关
	rsp = s.SetSettings(map[string]any{"nearThresholdHours": float64(24)})
	if !rsp.IsSuccess() {
		t.Fatalf("SetSettings(threshold) failed: %s", rsp.Message)
	}
	cur = s.settingsRepo.Get()
	if cur.NearThresholdHours != 24 || cur.SaveRawText {
		t.Fatalf("after threshold update: %+v", cur)
	}
}

// 未提供的键不改动现值；非法档位拒绝。
func TestSetSettings_Validation(t *testing.T) {
	s, _ := newRepos(t)

	if rsp := s.SetSettings(map[string]any{"nearThresholdHours": float64(36)}); rsp.IsSuccess() {
		t.Fatal("36 should be rejected")
	}
	if rsp := s.SetSettings(map[string]any{"nearThresholdHours": "48"}); rsp.IsSuccess() {
		t.Fatal("string value should be rejected")
	}
	if rsp := s.SetSettings(map[string]any{"saveRawText": "yes"}); rsp.IsSuccess() {
		t.Fatal("string bool should be rejected")
	}
	if got := s.settingsRepo.Get(); got != recruitrepo.DefaultJobSettings {
		t.Fatalf("rejected patches must not mutate state: %+v", got)
	}
}

// 持久化往返：重新打开同一 DB 仍能读到。
func TestRepo_Persistence(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	r1, err := recruitrepo.NewSettingsRepo(db)
	if err != nil {
		t.Fatal(err)
	}
	if err := r1.Save(recruitrepo.JobSettings{NearThresholdHours: 24, SaveRawText: true}); err != nil {
		t.Fatal(err)
	}
	r2, err := recruitrepo.NewSettingsRepo(db)
	if err != nil {
		t.Fatal(err)
	}
	if got := r2.Get(); got.NearThresholdHours != 24 || !got.SaveRawText {
		t.Fatalf("persisted roundtrip: %+v", got)
	}
}

// ───────────────────────── 手动添加完整链路 ─────────────────────────

// 仅填公司名即可保存（AC-01）；自动建档 + company_id 回填（AC-36）。
func TestCreateJob_Minimal(t *testing.T) {
	s, _ := newRepos(t)
	rsp := s.CreateJob(mkDraft("字节跳动", "pending", "other"), nil)
	if !rsp.IsSuccess() {
		t.Fatalf("create failed: %s", rsp.Message)
	}
	id, err := util.ParseData[map[string]any](rsp)
	if err != nil || id["id"] == "" {
		t.Fatalf("no id: %+v err=%v", id, err)
	}

	// 自动建档：norm 相同的第二个条目复用同一档案（「（北京）」括号内容去除后归并）
	rsp = s.CreateJob(mkDraft("字节跳动（北京）", "pending", "apply"), nil)
	if !rsp.IsSuccess() {
		t.Fatalf("create 2 failed: %s", rsp.Message)
	}
	cs, err := s.companyRepo.List()
	if err != nil || len(cs) != 1 {
		t.Fatalf("companies = %+v err=%v（应只有 1 个档案，norm 归并）", cs, err)
	}
	if cs[0].Name != "字节跳动" {
		t.Fatalf("first name should be kept: %+v", cs[0])
	}
}

// 公司名为空禁止保存（AC-05 后端兜底）。
func TestCreateJob_EmptyCompanyRejected(t *testing.T) {
	s, _ := newRepos(t)
	d := mkDraft("   ", "pending", "other")
	if rsp := s.CreateJob(d, nil); rsp.IsSuccess() {
		t.Fatal("empty company should be rejected")
	}
}

// 指纹去重：同 kind 指纹命中 → 不落库返回 duplicate；『仍然新建』与『更新原有』分支。
func TestCreateJob_Fingerprint(t *testing.T) {
	s, jobRepo := newRepos(t)
	d1 := mkDraft("字节跳动", "pending", "interview")
	if rsp := s.CreateJob(d1, nil); !rsp.IsSuccess() {
		t.Fatalf("first create failed: %s", rsp.Message)
	}
	d2 := d1
	d2.Position = "后端开发工程师（业务中台）" // 同指纹、字段有差异
	rsp := s.CreateJob(d2, nil)
	if !rsp.IsSuccess() {
		t.Fatalf("second create failed: %s", rsp.Message)
	}
	res, err := util.ParseData[map[string]any](rsp)
	if err != nil {
		t.Fatal(err)
	}
	if res["id"] != "" || res["duplicate"] == nil {
		t.Fatalf("expected duplicate, got %+v", res)
	}

	// 「仍然新建」：strategy=new 跳过去重，两条并存
	rsp = s.CreateJob(d2, strPtr("new"))
	if !rsp.IsSuccess() {
		t.Fatalf("strategy=new failed: %s", rsp.Message)
	}
	jobs, _ := jobRepo.List()
	if len(jobs) != 2 {
		t.Fatalf("jobs = %d, want 2", len(jobs))
	}

	// 「更新原有」：strategy=update 覆盖命中条目，不新增
	rsp = s.CreateJob(d2, strPtr("update"))
	if !rsp.IsSuccess() {
		t.Fatalf("strategy=update failed: %s", rsp.Message)
	}
	jobs, _ = jobRepo.List()
	if len(jobs) != 2 {
		t.Fatalf("jobs = %d, want 2 after update", len(jobs))
	}
}

// apply 指纹与 notice 指纹互不干扰（AC-29 双 kind 共存）。
func TestCreateJob_KindFingerprintsIndependent(t *testing.T) {
	s, _ := newRepos(t)
	a := mkDraft("字节跳动", "pending", "apply")
	n := mkDraft("字节跳动", "pending", "other")
	if rsp := s.CreateJob(a, nil); !rsp.IsSuccess() {
		t.Fatal("apply create failed")
	}
	if rsp := s.CreateJob(n, nil); !rsp.IsSuccess() {
		t.Fatal("notice create failed")
	}
	// apply 与 notice 指纹族不同 → 两条都应存在（不会互相判重）
	jobs, _ := s.jobRepo.List()
	if len(jobs) != 2 {
		t.Fatalf("jobs = %d, want 2", len(jobs))
	}
}

// 编辑改公司名：跨公司父关联自动解除（AC-34）+ 档案对齐。
func TestUpdateJob_UnlinkOnCompanyChange(t *testing.T) {
	s, _ := newRepos(t)
	// 造父 apply（字节）与子 notice（字节，已关联）
	if rsp := s.CreateJob(mkDraft("字节跳动", "pending", "apply"), nil); !rsp.IsSuccess() {
		t.Fatal("apply create failed")
	}
	rsp := s.CreateJob(mkDraft("字节跳动", "pending", "interview"), nil)
	if !rsp.IsSuccess() {
		t.Fatal("notice create failed")
	}
	list, _ := s.jobRepo.List()
	var applyID string
	var notice recruitmodel.JobProcess
	for _, j := range list {
		if j.Stage == "apply" {
			applyID = j.ID
		} else {
			notice = j
		}
	}
	if applyID == "" {
		t.Fatal("no apply created")
	}
	if rsp := s.LinkNotice(notice.ID, &applyID); !rsp.IsSuccess() {
		t.Fatalf("link failed: %s", rsp.Message)
	}

	// 编辑 notice 改公司 → 父 company_norm 不一致 → 自动解除 + 新档案
	notice.Company = "腾讯"
	notice.CompanyNorm = normalizeCompany("腾讯")
	if rsp := s.UpdateJob(notice); !rsp.IsSuccess() {
		t.Fatalf("update failed: %s", rsp.Message)
	}
	after, _ := s.jobRepo.Get(notice.ID)
	if after.ParentID != nil {
		t.Fatalf("parent should be unlinked: %+v", after)
	}
	if after.CompanyID == nil {
		t.Fatal("company_id should be realigned to new company")
	}
}

// 删除 apply：默认解关联保留通知；级联删除计数（AC-35）。
func TestDeleteJob_Cascade(t *testing.T) {
	s, _ := newRepos(t)
	if rsp := s.CreateJob(mkDraft("字节跳动", "pending", "apply"), nil); !rsp.IsSuccess() {
		t.Fatal("apply create failed")
	}
	if rsp := s.CreateJob(mkDraft("字节跳动", "pending", "interview"), nil); !rsp.IsSuccess() {
		t.Fatal("notice create failed")
	}
	list, _ := s.jobRepo.List()
	var applyID string
	for _, j := range list {
		if j.Stage == "apply" {
			applyID = j.ID
		}
	}
	if rsp := s.LinkNotice(noticeIDOf(t, s, list), &applyID); !rsp.IsSuccess() {
		t.Fatalf("link failed: %s", rsp.Message)
	}

	// 默认：解关联保留通知
	rsp := s.DeleteJob(applyID, false)
	if !rsp.IsSuccess() {
		t.Fatalf("delete failed: %s", rsp.Message)
	}
	res, _ := util.ParseData[map[string]any](rsp)
	if res["unlinked"] == nil {
		t.Fatalf("expected unlinked count, got %+v", res)
	}
	remaining, _ := s.jobRepo.List()
	if len(remaining) != 1 || remaining[0].ParentID != nil {
		t.Fatalf("notice should survive unlinked: %+v", remaining)
	}

	// 级联：一并删除
	if rsp := s.CreateJob(mkDraft("腾讯", "pending", "apply"), nil); !rsp.IsSuccess() {
		t.Fatal("apply2 create failed")
	}
	list, _ = s.jobRepo.List()
	for _, j := range list {
		if j.Stage == "apply" && j.CompanyNorm == normalizeCompany("腾讯") {
			rsp := s.DeleteJob(j.ID, true)
			if !rsp.IsSuccess() {
				t.Fatalf("cascade delete failed: %s", rsp.Message)
			}
			res, _ := util.ParseData[map[string]any](rsp)
			if res["deleted"] == nil {
				t.Fatalf("expected deleted count, got %+v", res)
			}
		}
	}
	remaining, _ = s.jobRepo.List()
	if len(remaining) != 1 {
		t.Fatalf("after cascade: %d entries, want 1", len(remaining))
	}
}

// 状态白名单校验（SetStatus）。
func TestSetStatus_Validation(t *testing.T) {
	s, _ := newRepos(t)
	if rsp := s.CreateJob(mkDraft("字节跳动", "pending", "other"), nil); !rsp.IsSuccess() {
		t.Fatal("create failed")
	}
	list, _ := s.jobRepo.List()
	if rsp := s.SetStatus(list[0].ID, "done"); !rsp.IsSuccess() {
		t.Fatalf("set status failed: %s", rsp.Message)
	}
	if j, _ := s.jobRepo.Get(list[0].ID); j.Status != "done" {
		t.Fatalf("status not persisted: %+v", j)
	}
	if rsp := s.SetStatus(list[0].ID, "nope"); rsp.IsSuccess() {
		t.Fatal("invalid status should be rejected")
	}
}

// 归一化与前端 normalize.ts 对拍（分组/指纹双端一致的根基）。
func TestNormalizeCompany_Parity(t *testing.T) {
	cases := map[string]string{
		"字节跳动":                 "字节跳动",
		"  字节跳动  ":             "字节跳动",
		"　字节跳动　":               "字节跳动", // 全角空格
		"字节跳动科技有限公司": "字节跳动科技", // 与 TS 版一致：命中一个后缀即止（先裁「有限公司」）
		"字节跳动科技":          "字节跳动",   // 再裁「科技」
		"字节跳动（北京）":       "字节跳动",
		"(ByteDance) Ltd":   "ltd", // 括号内容连括号去除，仅剩 Ltd（后缀表不含 Ltd）
		"ByteDance":            "bytedance",
		"腾讯（中国）有限公司": "腾讯",
		"美团（中国）":        "美团",
		"信息":                "信息", // 长度不大于后缀 → 不裁
	}
	for in, want := range cases {
		if got := normalizeCompany(in); got != want {
			t.Errorf("normalizeCompany(%q) = %q, want %q", in, got, want)
		}
	}
}

// 取指定条目的 id（测试辅助：避免依赖列表顺序）。
func noticeIDOf(t *testing.T, s *RecruitService, jobs []recruitmodel.JobProcess) string {
	t.Helper()
	for _, j := range jobs {
		if j.Stage != "apply" {
			return j.ID
		}
	}
	t.Fatal("no notice")
	return ""
}
