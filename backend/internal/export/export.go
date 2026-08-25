// Package export turns the whole workout log into a formatted Google Sheet.
// The grid builders are pure (and unit tested); Run performs the Sheets API
// calls that create the spreadsheet, write the values, and apply formatting.
//
// Layout: a Summary tab (per-month rollups), then one tab per saved routine
// ("workout") holding one daily-completion table per month, then a Routine tab
// (the current config) and a Versions tab. Routine tabs run in chronological
// order and are titled by the month-year span they cover (e.g. "May–Jul 2026").
// A routine's tables fill in every calendar day it was active per the schedule,
// so rest / no-activity days appear (blank, 0%), not only the days logged.
//
// Each day is attributed to a routine by the version schedule (the effective-
// dated VersionAssignment timeline): the routine a day belongs to is the version
// scheduled for that date. Days that predate the schedule fall back to matching
// the routine whose exercises they best fit (see attribute), so days logged
// under an old, unscheduled routine are still scored against that routine — not
// left at 0% against the current one.
package export

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/gmestre98/workout-log/backend/internal/domain"
	"github.com/gmestre98/workout-log/backend/internal/stats"

	"google.golang.org/api/googleapi"
	gsheets "google.golang.org/api/sheets/v4"
)

// Data is everything the export needs: the current routine, every day log
// (chronological), and the saved routine versions.
type Data struct {
	Exercises   []domain.Exercise
	Days        []domain.DayLog
	Versions    []domain.RoutineVersion
	Assignments []domain.VersionAssignment // the version schedule (effective-dated)
	Generated   time.Time
}

// routine is one "workout": a set of exercises (from a saved version, or the
// live routine as a fallback) that days can be attributed to and scored against.
type routine struct {
	id        string // saved-version ID, for schedule attribution ("" for the fallback)
	name      string
	active    []domain.Exercise
	ids       map[string]bool // active exercise IDs, for attribution
	createdAt time.Time
	current   bool
}

// activeExercises returns only the active exercises, matching the app's stat
// semantics (inactive exercises are not part of daily tracking).
func activeExercises(exs []domain.Exercise) []domain.Exercise {
	out := make([]domain.Exercise, 0, len(exs))
	for _, e := range exs {
		if e.Active {
			out = append(out, e)
		}
	}
	return out
}

func idSet(exs []domain.Exercise) map[string]bool {
	s := make(map[string]bool, len(exs))
	for _, e := range exs {
		s[e.ID] = true
	}
	return s
}

// versionName is the human label for a saved version: its note, or a dated
// fallback when unnamed.
func versionName(v domain.RoutineVersion) string {
	if strings.TrimSpace(v.Note) != "" {
		return v.Note
	}
	return "Routine " + v.CreatedAt.Format("2006-01-02")
}

// buildRoutines turns the saved versions into routines, newest first. When there
// are no saved versions it falls back to a single "Current" routine built from
// the live exercises, so an unversioned setup still exports.
func buildRoutines(d Data) []routine {
	routines := make([]routine, 0, len(d.Versions))
	for _, v := range d.Versions {
		active := activeExercises(v.Exercises)
		routines = append(routines, routine{
			id:        v.ID,
			name:      versionName(v),
			active:    active,
			ids:       idSet(active),
			createdAt: v.CreatedAt,
			current:   v.Status == domain.StatusCurrent,
		})
	}
	sort.SliceStable(routines, func(i, j int) bool {
		return routines[i].createdAt.After(routines[j].createdAt)
	})
	if len(routines) == 0 {
		active := activeExercises(d.Exercises)
		routines = append(routines, routine{name: "Current", active: active, ids: idSet(active), current: true})
	}
	return routines
}

// loggedIDs is the set of exercise IDs that have a log on the given day.
func loggedIDs(day domain.DayLog) map[string]bool {
	s := make(map[string]bool, len(day.Exercises))
	for id := range day.Exercises {
		s[id] = true
	}
	return s
}

// jaccard is |a∩b| / |a∪b|, 0 when both are empty. It rewards the routine that
// overlaps a day's exercises most while penalising a routine that is much larger
// than the day (so a day belongs to the routine it actually fits, not a superset).
func jaccard(a, b map[string]bool) float64 {
	if len(a) == 0 && len(b) == 0 {
		return 0
	}
	inter := 0
	for id := range a {
		if b[id] {
			inter++
		}
	}
	union := len(a) + len(b) - inter
	if union == 0 {
		return 0
	}
	return float64(inter) / float64(union)
}

// attribute returns the index of the routine a day belongs to, or -1 when the
// day has no logged exercises. routines must be newest-first, so ties resolve to
// the newest routine.
func attribute(day domain.DayLog, routines []routine) int {
	ids := loggedIDs(day)
	if len(ids) == 0 {
		return -1
	}
	best, bestScore := 0, -1.0
	for i, r := range routines {
		if s := jaccard(ids, r.ids); s > bestScore {
			best, bestScore = i, s
		}
	}
	return best
}

// scheduleAttributor returns a function mapping a day's date to a routine index
// using the version schedule: the version in effect on a date is the assignment
// with the greatest StartDate <= date (see domain.VersionAssignment). It returns
// (idx, true) when the schedule covers the date and its version maps to a known
// routine; otherwise (_, false) so the caller can fall back to exercise
// matching (e.g. for days that predate the earliest assignment).
func scheduleAttributor(assignments []domain.VersionAssignment, routines []routine) func(date string) (int, bool) {
	idxByVersion := make(map[string]int, len(routines))
	for i, r := range routines {
		if r.id != "" {
			idxByVersion[r.id] = i
		}
	}
	sorted := append([]domain.VersionAssignment(nil), assignments...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].StartDate < sorted[j].StartDate })
	return func(date string) (int, bool) {
		vid := ""
		for _, a := range sorted {
			if a.StartDate > date {
				break
			}
			vid = a.VersionID // latest assignment on or before the date wins
		}
		if vid == "" {
			return 0, false
		}
		idx, ok := idxByVersion[vid]
		return idx, ok
	}
}

// scheduleDates returns, per routine index, every calendar date the routine was
// active according to the schedule: for each assignment mapping to a routine,
// each day from its StartDate up to the next assignment's StartDate (exclusive).
// The final, open-ended interval (the current routine) is capped at `through`
// (the export's generation date, inclusive) so it fills up to today and no
// further. Dates are "YYYY-MM-DD", ascending. These are used to show rest / no-
// activity days within a routine's active months, not just the days logged.
func scheduleDates(assignments []domain.VersionAssignment, routines []routine, through string) map[int][]string {
	idxByVersion := make(map[string]int, len(routines))
	for i, r := range routines {
		if r.id != "" {
			idxByVersion[r.id] = i
		}
	}
	sorted := append([]domain.VersionAssignment(nil), assignments...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].StartDate < sorted[j].StartDate })

	out := map[int][]string{}
	for i, a := range sorted {
		idx, ok := idxByVersion[a.VersionID]
		if !ok {
			continue
		}
		start, err := time.Parse("2006-01-02", a.StartDate)
		if err != nil {
			continue
		}
		var end time.Time // exclusive
		if i+1 < len(sorted) {
			if end, err = time.Parse("2006-01-02", sorted[i+1].StartDate); err != nil {
				continue
			}
		} else {
			t, err := time.Parse("2006-01-02", through)
			if err != nil {
				continue
			}
			end = t.AddDate(0, 0, 1) // make `through` inclusive
		}
		for day := start; day.Before(end); day = day.AddDate(0, 0, 1) {
			out[idx] = append(out[idx], day.Format("2006-01-02"))
		}
	}
	return out
}

// dayCompletion is a day's average completion scored against its attributed
// routine (untouched exercises of that routine count as 0, matching the app).
// A day with no logged exercises is 0%.
func dayCompletion(day domain.DayLog, routines []routine, idx int) float64 {
	if idx < 0 {
		return 0
	}
	return stats.DayAverage(routines[idx].active, day)
}

// --- grid model: a tab's cell values plus the ranges to format ---

type fmtKind int

const (
	fmtBold       fmtKind = iota // bold text only (month titles)
	fmtHeader                    // bold + shaded (header rows)
	fmtPercent                   // percentage number format
	fmtColorScale                // green→red gradient over completion cells
)

type rangeFmt struct {
	kind           fmtKind
	r0, r1, c0, c1 int64 // half-open [r0,r1) x [c0,c1)
}

type cellGrid struct {
	title                  string
	rows                   [][]any
	fmts                   []rangeFmt
	freezeRows, freezeCols int64
}

// summaryGrid rolls every logged month up into avg completion and day counts,
// using each day's attributed-routine score, plus an overall total row.
func summaryGrid(d Data, routines []routine, attr map[string]int) cellGrid {
	rows := [][]any{{"Month", "Days logged", "Avg completion", "Days >0%", "Days >50%"}}
	months, byMonth := groupByMonth(d.Days)

	var allTotal float64
	var allD0, allD50, allCount int
	for _, m := range months {
		var total float64
		var d0, d50 int
		for _, day := range byMonth[m] {
			c := dayCompletion(day, routines, attr[day.Date])
			total += c
			if c > 0 {
				d0++
			}
			if c > 0.5 {
				d50++
			}
		}
		n := len(byMonth[m])
		rows = append(rows, []any{monthLabel(m), n, avg(total, n), d0, d50})
		allTotal += total
		allD0 += d0
		allD50 += d50
		allCount += n
	}
	if allCount > 0 {
		rows = append(rows, []any{"All", allCount, avg(allTotal, allCount), allD0, allD50})
	}

	g := cellGrid{title: "Summary", rows: rows, freezeRows: 1}
	g.fmts = append(g.fmts, rangeFmt{fmtHeader, 0, 1, 0, 5})
	if len(rows) > 1 {
		g.fmts = append(g.fmts, rangeFmt{fmtPercent, 1, int64(len(rows)), 2, 3})
	}
	return g
}

// routineGrid builds one tab for a routine: a monthly completion table per month
// the routine was used, sharing the routine's exercises as columns. days must be
// only those attributed to this routine.
func routineGrid(r routine, days []domain.DayLog) cellGrid {
	nCols := int64(len(r.active))
	header := make([]any, 0, nCols+2)
	header = append(header, "Date")
	for _, e := range r.active {
		header = append(header, e.Name)
	}
	header = append(header, "Day average")
	lastCol := nCols + 2 // exclusive end covering Date..Day average

	g := cellGrid{title: r.name, freezeCols: 1}
	appendHeader := func() {
		hr := int64(len(g.rows))
		g.rows = append(g.rows, header)
		g.fmts = append(g.fmts, rangeFmt{fmtHeader, hr, hr + 1, 0, lastCol})
	}

	months, byMonth := groupByMonth(days)
	if len(months) == 0 {
		appendHeader() // no data yet: still show the columns
		return g
	}
	for _, m := range months {
		tr := int64(len(g.rows))
		g.rows = append(g.rows, []any{monthLabel(m)})
		g.fmts = append(g.fmts, rangeFmt{fmtBold, tr, tr + 1, 0, 1})

		appendHeader()

		start := int64(len(g.rows))
		for _, day := range byMonth[m] {
			row := make([]any, 0, nCols+2)
			row = append(row, day.Date)
			for _, e := range r.active {
				if log, ok := day.Exercises[e.ID]; ok {
					row = append(row, stats.ExerciseCompletion(log))
				} else {
					row = append(row, nil)
				}
			}
			row = append(row, stats.DayAverage(r.active, day))
			g.rows = append(g.rows, row)
		}
		end := int64(len(g.rows))
		if end > start && nCols > 0 {
			g.fmts = append(g.fmts, rangeFmt{fmtPercent, start, end, 1, lastCol})
			g.fmts = append(g.fmts, rangeFmt{fmtColorScale, start, end, 1, lastCol})
		}
		g.rows = append(g.rows, []any{}) // blank separator between months
	}
	return g
}

// routineConfigGrid lists the current routine's exercises with all their fields.
func routineConfigGrid(exs []domain.Exercise) cellGrid {
	rows := [][]any{{
		"Time slot", "Name", "Sets", "Amount", "Unit", "Rest (s)",
		"Muscle group", "Equipment", "Per side", "Active", "Note",
	}}
	for _, e := range exs {
		rows = append(rows, []any{
			e.TimeSlot, e.Name, e.PlannedSets, e.PlannedAmount, string(e.Unit), e.RestSeconds,
			e.MuscleGroup, e.Equipment, yesNo(e.PerSide, ""), yesNo(e.Active, "No"), e.Note,
		})
	}
	return cellGrid{title: "Routine", rows: rows, freezeRows: 1,
		fmts: []rangeFmt{{fmtHeader, 0, 1, 0, 11}}}
}

// versionsGrid lists the saved routine snapshots.
func versionsGrid(vs []domain.RoutineVersion) cellGrid {
	rows := [][]any{{"Saved", "Note", "Status", "Exercises"}}
	for _, v := range vs {
		rows = append(rows, []any{
			v.CreatedAt.Format("2006-01-02 15:04"), v.Note, string(v.Status), len(v.Exercises),
		})
	}
	return cellGrid{title: "Versions", rows: rows, freezeRows: 1,
		fmts: []rangeFmt{{fmtHeader, 0, 1, 0, 4}}}
}

// buildGrids assembles every tab: Summary, one per routine that has days (plus
// the current routine even if empty), then Routine and Versions. Titles are
// sanitised and de-duplicated for the Sheets API.
func buildGrids(d Data) []cellGrid {
	routines := buildRoutines(d)
	sched := scheduleAttributor(d.Assignments, routines)
	attr := make(map[string]int, len(d.Days))
	for _, day := range d.Days {
		switch {
		case len(day.Exercises) == 0:
			attr[day.Date] = -1 // nothing logged: not part of any routine tab
		default:
			if idx, ok := sched(day.Date); ok {
				attr[day.Date] = idx // scheduled version wins
			} else {
				attr[day.Date] = attribute(day, routines) // pre-schedule fallback
			}
		}
	}

	// Each routine's rows are the union of the days logged against it and every
	// calendar day it was active per the schedule, so rest / no-activity days show
	// up within the routine's active months (as blank, 0% rows).
	schedDates := scheduleDates(d.Assignments, routines, d.Generated.Format("2006-01-02"))
	logged := make(map[string]domain.DayLog, len(d.Days))
	for _, day := range d.Days {
		logged[day.Date] = day
	}

	// Collect the routine tabs to emit (skip empty historical routines; keep the
	// current one even when empty), then order them chronologically by their
	// first day. Empty tabs sort last.
	type routineTab struct {
		r    routine
		days []domain.DayLog
	}
	var tabs []routineTab
	for i, r := range routines {
		seen := map[string]bool{}
		var dates []string
		addDate := func(dt string) {
			if !seen[dt] {
				seen[dt] = true
				dates = append(dates, dt)
			}
		}
		for _, day := range d.Days {
			if attr[day.Date] == i {
				addDate(day.Date)
			}
		}
		for _, dt := range schedDates[i] {
			addDate(dt)
		}
		if len(dates) == 0 && !r.current {
			continue
		}
		sort.Strings(dates)
		days := make([]domain.DayLog, 0, len(dates))
		for _, dt := range dates {
			if dl, ok := logged[dt]; ok {
				days = append(days, dl) // a real log (possibly empty)
			} else {
				days = append(days, domain.NewDayLog(dt)) // no record: a rest day
			}
		}
		tabs = append(tabs, routineTab{r, days})
	}
	sort.SliceStable(tabs, func(i, j int) bool {
		di, dj := firstDate(tabs[i].days), firstDate(tabs[j].days)
		switch {
		case di == "" && dj == "":
			return false
		case di == "":
			return false // i empty → sorts after j
		case dj == "":
			return true // j empty → i sorts before
		default:
			return di < dj
		}
	})

	grids := []cellGrid{summaryGrid(d, routines, attr)}
	for _, t := range tabs {
		g := routineGrid(t.r, t.days)
		g.title = routineTabTitle(t.r, t.days)
		grids = append(grids, g)
	}
	grids = append(grids, routineConfigGrid(d.Exercises), versionsGrid(d.Versions))

	dedupeTitles(grids)
	return grids
}

// firstDate is the earliest day's date in a chronologically-sorted slice, or ""
// when there are none.
func firstDate(days []domain.DayLog) string {
	if len(days) == 0 {
		return ""
	}
	return days[0].Date
}

// routineTabTitle names a routine's tab by the month-year span of the days it
// holds (e.g. "May–Jul 2026", or "May 2026" for a single month). A routine with
// no days yet (the current/future one) falls back to its version name.
func routineTabTitle(r routine, days []domain.DayLog) string {
	if len(days) == 0 {
		return r.name
	}
	return monthSpanLabel(days[0].Date, days[len(days)-1].Date)
}

// monthSpanLabel turns a [min,max] date range ("YYYY-MM-DD") into a compact
// month-year label: "May 2026" (one month), "May–Jul 2026" (same year), or
// "Nov 2025 – Feb 2026" (spanning years). Falls back to the raw min on a parse
// error.
func monthSpanLabel(minDate, maxDate string) string {
	lo, errLo := time.Parse("2006-01-02", minDate)
	hi, errHi := time.Parse("2006-01-02", maxDate)
	if errLo != nil || errHi != nil {
		return minDate
	}
	switch {
	case lo.Year() == hi.Year() && lo.Month() == hi.Month():
		return lo.Format("January 2006")
	case lo.Year() == hi.Year():
		return fmt.Sprintf("%s–%s", lo.Format("Jan"), hi.Format("Jan 2006"))
	default:
		return fmt.Sprintf("%s – %s", lo.Format("Jan 2006"), hi.Format("Jan 2006"))
	}
}

// dedupeTitles sanitises each grid title and makes them unique (case-insensitive),
// since Sheets rejects invalid or duplicate tab names.
func dedupeTitles(grids []cellGrid) {
	seen := map[string]bool{}
	for i := range grids {
		base := sanitizeTitle(grids[i].title)
		title := base
		for n := 2; seen[strings.ToLower(title)]; n++ {
			title = fmt.Sprintf("%s (%d)", clip(base, 90-5), n)
		}
		seen[strings.ToLower(title)] = true
		grids[i].title = title
	}
}

var titleReplacer = strings.NewReplacer(":", " ", "\\", " ", "/", " ", "?", " ", "*", " ", "[", " ", "]", " ")

func sanitizeTitle(s string) string {
	s = strings.TrimSpace(titleReplacer.Replace(s))
	if s == "" {
		s = "Sheet"
	}
	return clip(s, 90)
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return strings.TrimSpace(string(r[:n]))
	}
	return s
}

func yesNo(b bool, ifFalse string) string {
	if b {
		return "Yes"
	}
	return ifFalse
}

func avg(total float64, n int) float64 {
	if n == 0 {
		return 0
	}
	return total / float64(n)
}

// groupByMonth buckets days by YYYY-MM, returning the months in first-seen order
// (days arrive chronologically) alongside the buckets.
func groupByMonth(days []domain.DayLog) ([]string, map[string][]domain.DayLog) {
	order := make([]string, 0)
	byMonth := map[string][]domain.DayLog{}
	for _, d := range days {
		m := d.Date
		if len(m) >= 7 {
			m = m[:7]
		}
		if _, seen := byMonth[m]; !seen {
			order = append(order, m)
		}
		byMonth[m] = append(byMonth[m], d)
	}
	return order, byMonth
}

// monthLabel turns "2026-01" into "January 2026", falling back to the key.
func monthLabel(key string) string {
	if t, err := time.Parse("2006-01", key); err == nil {
		return t.Format("January 2006")
	}
	return key
}

// Run creates a new spreadsheet in the connected Drive, writes every tab, and
// applies formatting. It returns the spreadsheet URL and title.
func Run(ctx context.Context, svc *gsheets.Service, d Data) (string, string, error) {
	grids := buildGrids(d)

	title := "Workout Log — " + d.Generated.Format("2006-01-02 15:04")
	sheetsList := make([]*gsheets.Sheet, 0, len(grids))
	for _, g := range grids {
		sheetsList = append(sheetsList, sheet(g.title, g.freezeRows, g.freezeCols))
	}
	ss := &gsheets.Spreadsheet{
		// Pin the locale so numeric literals in formatting requests (e.g. the
		// colour-scale midpoint "0.5") parse regardless of the account's locale:
		// a comma-decimal locale otherwise rejects "0.5" as an invalid number.
		Properties: &gsheets.SpreadsheetProperties{Title: title, Locale: "en_US"},
		Sheets:     sheetsList,
	}
	var created *gsheets.Spreadsheet
	if err := retry(ctx, func() error {
		var e error
		created, e = svc.Spreadsheets.Create(ss).Context(ctx).Do()
		return e
	}); err != nil {
		return "", "", fmt.Errorf("create spreadsheet: %w", err)
	}

	idByTitle := map[string]int64{}
	for _, sh := range created.Sheets {
		if sh.Properties != nil {
			idByTitle[sh.Properties.Title] = sh.Properties.SheetId
		}
	}

	// Write the values.
	valueData := make([]*gsheets.ValueRange, 0, len(grids))
	for _, g := range grids {
		valueData = append(valueData, &gsheets.ValueRange{Range: a1(g.title), Values: g.rows})
	}
	if err := retry(ctx, func() error {
		_, e := svc.Spreadsheets.Values.BatchUpdate(created.SpreadsheetId,
			&gsheets.BatchUpdateValuesRequest{ValueInputOption: "USER_ENTERED", Data: valueData}).Context(ctx).Do()
		return e
	}); err != nil {
		return "", "", fmt.Errorf("write values: %w", err)
	}

	// Apply formatting.
	var reqs []*gsheets.Request
	for _, g := range grids {
		id := idByTitle[g.title]
		for _, f := range g.fmts {
			reqs = append(reqs, formatReq(id, f))
		}
		reqs = append(reqs, autoResize(id))
	}
	if err := retry(ctx, func() error {
		_, e := svc.Spreadsheets.BatchUpdate(created.SpreadsheetId,
			&gsheets.BatchUpdateSpreadsheetRequest{Requests: reqs}).Context(ctx).Do()
		return e
	}); err != nil {
		return "", "", fmt.Errorf("format spreadsheet: %w", err)
	}

	return created.SpreadsheetUrl, title, nil
}

// retry runs fn up to 4 times, backing off between attempts, but only while the
// error is a transient Google backend error (HTTP 429 or 5xx — e.g. the Sheets
// API's "503 backendError" that can occur right after the API is enabled or
// under transient load). Non-transient errors return immediately.
func retry(ctx context.Context, fn func() error) error {
	const attempts = 4
	var err error
	for i := 0; i < attempts; i++ {
		if err = fn(); err == nil || !transient(err) {
			return err
		}
		if i == attempts-1 {
			break
		}
		backoff := time.Duration(1<<i) * 500 * time.Millisecond // 0.5s, 1s, 2s
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
	}
	return err
}

// transient reports whether err is a retryable Google API error (429 or 5xx).
func transient(err error) bool {
	var gerr *googleapi.Error
	if errors.As(err, &gerr) {
		return gerr.Code == 429 || gerr.Code >= 500
	}
	return false
}

func sheet(title string, frozenRows, frozenCols int64) *gsheets.Sheet {
	return &gsheets.Sheet{Properties: &gsheets.SheetProperties{
		Title: title,
		GridProperties: &gsheets.GridProperties{
			FrozenRowCount:    frozenRows,
			FrozenColumnCount: frozenCols,
		},
	}}
}

// a1 quotes a sheet title for A1 notation (titles contain spaces; embedded
// apostrophes are doubled per A1 escaping rules).
func a1(title string) string {
	return "'" + strings.ReplaceAll(title, "'", "''") + "'!A1"
}

func formatReq(sheetID int64, f rangeFmt) *gsheets.Request {
	switch f.kind {
	case fmtBold:
		return &gsheets.Request{RepeatCell: &gsheets.RepeatCellRequest{
			Range:  gridRange(sheetID, f),
			Cell:   &gsheets.CellData{UserEnteredFormat: &gsheets.CellFormat{TextFormat: &gsheets.TextFormat{Bold: true}}},
			Fields: "userEnteredFormat.textFormat",
		}}
	case fmtHeader:
		return &gsheets.Request{RepeatCell: &gsheets.RepeatCellRequest{
			Range: gridRange(sheetID, f),
			Cell: &gsheets.CellData{UserEnteredFormat: &gsheets.CellFormat{
				TextFormat:      &gsheets.TextFormat{Bold: true},
				BackgroundColor: &gsheets.Color{Red: 0.90, Green: 0.90, Blue: 0.92},
			}},
			Fields: "userEnteredFormat(textFormat,backgroundColor)",
		}}
	case fmtPercent:
		return &gsheets.Request{RepeatCell: &gsheets.RepeatCellRequest{
			Range: gridRange(sheetID, f),
			Cell: &gsheets.CellData{UserEnteredFormat: &gsheets.CellFormat{
				NumberFormat: &gsheets.NumberFormat{Type: "PERCENT", Pattern: "0%"},
			}},
			Fields: "userEnteredFormat.numberFormat",
		}}
	default: // fmtColorScale
		return &gsheets.Request{AddConditionalFormatRule: &gsheets.AddConditionalFormatRuleRequest{
			Rule: &gsheets.ConditionalFormatRule{
				Ranges: []*gsheets.GridRange{gridRange(sheetID, f)},
				GradientRule: &gsheets.GradientRule{
					Minpoint: &gsheets.InterpolationPoint{Type: "NUMBER", Value: "0", Color: &gsheets.Color{Red: 0.96, Green: 0.55, Blue: 0.55}},
					Midpoint: &gsheets.InterpolationPoint{Type: "NUMBER", Value: "0.5", Color: &gsheets.Color{Red: 1.0, Green: 0.90, Blue: 0.55}},
					Maxpoint: &gsheets.InterpolationPoint{Type: "NUMBER", Value: "1", Color: &gsheets.Color{Red: 0.55, Green: 0.82, Blue: 0.60}},
				},
			},
		}}
	}
}

func gridRange(sheetID int64, f rangeFmt) *gsheets.GridRange {
	return &gsheets.GridRange{
		SheetId: sheetID, StartRowIndex: f.r0, EndRowIndex: f.r1,
		StartColumnIndex: f.c0, EndColumnIndex: f.c1,
	}
}

func autoResize(sheetID int64) *gsheets.Request {
	return &gsheets.Request{AutoResizeDimensions: &gsheets.AutoResizeDimensionsRequest{
		Dimensions: &gsheets.DimensionRange{SheetId: sheetID, Dimension: "COLUMNS"},
	}}
}
