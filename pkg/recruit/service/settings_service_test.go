package service

import (
	"database/sql"
	"testing"

	recruitrepo "gosume/pkg/recruit/repo"
	"gosume/pkg/util"

	_ "modernc.org/sqlite"
)

func newTestRepo(t *testing.T) *recruitrepo.SettingsRepo {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	r, err := recruitrepo.NewSettingsRepo(db)
	if err != nil {
		t.Fatalf("new settings repo: %v", err)
	}
	return r
}

// 表为空时 GetSettings 返回默认值（48 / false）。
func TestGetSettings_Default(t *testing.T) {
	s := &RecruitService{}
	s.Inject(newTestRepo(t))
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
	s := &RecruitService{}
	s.Inject(newTestRepo(t))

	rsp := s.SetSettings(map[string]any{"saveRawText": true})
	if !rsp.IsSuccess() {
		t.Fatalf("SetSettings failed: %s", rsp.Message)
	}
	cur := s.repo.Get()
	if !cur.SaveRawText || cur.NearThresholdHours != 48 {
		t.Fatalf("after saveRawText=true: %+v", cur)
	}

	// 关键回归：把 saveRawText 关回 false —— 修复前用户报的「取消选中无效」即此路径
	rsp = s.SetSettings(map[string]any{"saveRawText": false})
	if !rsp.IsSuccess() {
		t.Fatalf("SetSettings(false) failed: %s", rsp.Message)
	}
	cur = s.repo.Get()
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
	cur = s.repo.Get()
	if cur.NearThresholdHours != 24 || cur.SaveRawText {
		t.Fatalf("after threshold update: %+v", cur)
	}
}

// 未提供的键不改动现值；非法档位拒绝。
func TestSetSettings_Validation(t *testing.T) {
	s := &RecruitService{}
	s.Inject(newTestRepo(t))

	if rsp := s.SetSettings(map[string]any{"nearThresholdHours": float64(36)}); rsp.IsSuccess() {
		t.Fatal("36 should be rejected")
	}
	if rsp := s.SetSettings(map[string]any{"nearThresholdHours": "48"}); rsp.IsSuccess() {
		t.Fatal("string value should be rejected")
	}
	if rsp := s.SetSettings(map[string]any{"saveRawText": "yes"}); rsp.IsSuccess() {
		t.Fatal("string bool should be rejected")
	}
	if got := s.repo.Get(); got != recruitrepo.DefaultJobSettings {
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
