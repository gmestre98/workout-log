// Package export turns the whole workout log into a formatted Google Sheet.
// The row builders are pure (and unit tested); Run performs the Sheets API
// calls that create the spreadsheet, write the values, and apply formatting.
package export

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/gmestre98/workout-log/backend/internal/domain"
	"github.com/gmestre98/workout-log/backend/internal/stats"

	"google.golang.org/api/googleapi"
	gsheets "google.golang.org/api/sheets/v4"
)

// Data is everything the export needs: the current routine, every day log
// (chronological), and the saved routine versions.
type Data struct {
	Exercises []domain.Exercise
	Days      []domain.DayLog
	Versions  []domain.RoutineVersion
	Generated time.Time
}

// activeExercises returns the routine exercises used as the matrix columns and
// as the basis for completion stats, matching the app's stat semantics.
func activeExercises(exs []domain.Exercise) []domain.Exercise {
	out := make([]domain.Exercise, 0, len(exs))
	for _, e := range exs {
		if e.Active {
			out = append(out, e)
		}
	}
	return out
}

// dailyLogRows builds the "Daily Log" matrix: a header row, then one row per
// day with each active exercise's completion fraction (blank when not logged
// that day) and the day's average. Fractions are left as numbers so the sheet
// can format them as percentages and colour-scale them.
func dailyLogRows(active []domain.Exercise, days []domain.DayLog) [][]any {
	header := make([]any, 0, len(active)+2)
	header = append(header, "Date")
	for _, e := range active {
		header = append(header, e.Name)
	}
	header = append(header, "Day average")

	rows := make([][]any, 0, len(days)+1)
	rows = append(rows, header)
	for _, d := range days {
		row := make([]any, 0, len(active)+2)
		row = append(row, d.Date)
		for _, e := range active {
			if log, ok := d.Exercises[e.ID]; ok {
				row = append(row, stats.ExerciseCompletion(log))
			} else {
				row = append(row, nil) // untouched: leave blank
			}
		}
		row = append(row, stats.DayAverage(active, d))
		rows = append(rows, row)
	}
	return rows
}

// monthlySummaryRows rolls each calendar month up into the same figures the app
// shows (avg completion, days >0%, days >50%), plus an overall total row.
func monthlySummaryRows(active []domain.Exercise, days []domain.DayLog) [][]any {
	rows := [][]any{{"Month", "Days logged", "Avg completion", "Days >0%", "Days >50%"}}

	byMonth := map[string][]domain.DayLog{}
	order := make([]string, 0)
	for _, d := range days {
		m := d.Date
		if len(m) >= 7 {
			m = m[:7] // YYYY-MM
		}
		if _, seen := byMonth[m]; !seen {
			order = append(order, m)
		}
		byMonth[m] = append(byMonth[m], d)
	}
	for _, m := range order {
		s := stats.Summarize(active, byMonth[m])
		rows = append(rows, []any{m, s.Days, s.AvgCompletion, s.DaysAbove0, s.DaysAbove50})
	}
	if len(days) > 0 {
		s := stats.Summarize(active, days)
		rows = append(rows, []any{"All", s.Days, s.AvgCompletion, s.DaysAbove0, s.DaysAbove50})
	}
	return rows
}

// routineRows lists every exercise in the current routine with all its fields.
func routineRows(exs []domain.Exercise) [][]any {
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
	return rows
}

// versionRows lists the saved routine snapshots.
func versionRows(vs []domain.RoutineVersion) [][]any {
	rows := [][]any{{"Saved", "Note", "Status", "Exercises"}}
	for _, v := range vs {
		rows = append(rows, []any{
			v.CreatedAt.Format("2006-01-02 15:04"), v.Note, string(v.Status), len(v.Exercises),
		})
	}
	return rows
}

// yesNo renders a bool as "Yes"/falsy, where falsy is the text used for false.
func yesNo(b bool, ifFalse string) string {
	if b {
		return "Yes"
	}
	return ifFalse
}

const (
	sheetDaily    = "Daily Log"
	sheetSummary  = "Summary"
	sheetRoutine  = "Routine"
	sheetVersions = "Versions"
)

// Run creates a new spreadsheet in the connected Drive, writes every tab, and
// applies formatting (frozen headers, percentages, a green→red colour scale on
// the matrix). It returns the spreadsheet URL and title.
func Run(ctx context.Context, svc *gsheets.Service, d Data) (string, string, error) {
	active := activeExercises(d.Exercises)
	daily := dailyLogRows(active, d.Days)
	summary := monthlySummaryRows(active, d.Days)
	routine := routineRows(d.Exercises)
	versions := versionRows(d.Versions)

	title := "Workout Log — " + d.Generated.Format("2006-01-02 15:04")
	ss := &gsheets.Spreadsheet{
		// Pin the locale so numeric literals in formatting requests (e.g. the
		// colour-scale midpoint "0.5") parse regardless of the account's locale:
		// a comma-decimal locale otherwise rejects "0.5" as an invalid number.
		Properties: &gsheets.SpreadsheetProperties{Title: title, Locale: "en_US"},
		Sheets: []*gsheets.Sheet{
			sheet(sheetDaily, 1, 1),
			sheet(sheetSummary, 1, 0),
			sheet(sheetRoutine, 1, 0),
			sheet(sheetVersions, 1, 0),
		},
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
	values := &gsheets.BatchUpdateValuesRequest{
		ValueInputOption: "USER_ENTERED",
		Data: []*gsheets.ValueRange{
			{Range: a1(sheetDaily), Values: daily},
			{Range: a1(sheetSummary), Values: summary},
			{Range: a1(sheetRoutine), Values: routine},
			{Range: a1(sheetVersions), Values: versions},
		},
	}
	if err := retry(ctx, func() error {
		_, e := svc.Spreadsheets.Values.BatchUpdate(created.SpreadsheetId, values).Context(ctx).Do()
		return e
	}); err != nil {
		return "", "", fmt.Errorf("write values: %w", err)
	}

	// Apply formatting.
	var reqs []*gsheets.Request
	for _, name := range []string{sheetDaily, sheetSummary, sheetRoutine, sheetVersions} {
		reqs = append(reqs, headerFormat(idByTitle[name]))
	}
	if len(active) > 0 && len(d.Days) > 0 {
		dailyID := idByTitle[sheetDaily]
		firstDataCol := int64(1)
		lastCol := int64(len(active) + 2) // date + exercises + avg
		lastRow := int64(len(d.Days) + 1) // header + days
		reqs = append(reqs, percentFormat(dailyID, 1, lastRow, firstDataCol, lastCol))
		reqs = append(reqs, colorScale(dailyID, 1, lastRow, firstDataCol, lastCol))
	}
	if len(summary) > 1 {
		// "Avg completion" is column index 2 on the Summary tab.
		reqs = append(reqs, percentFormat(idByTitle[sheetSummary], 1, int64(len(summary)), 2, 3))
	}
	for _, name := range []string{sheetDaily, sheetSummary, sheetRoutine, sheetVersions} {
		reqs = append(reqs, autoResize(idByTitle[name]))
	}
	upd := &gsheets.BatchUpdateSpreadsheetRequest{Requests: reqs}
	if err := retry(ctx, func() error {
		_, e := svc.Spreadsheets.BatchUpdate(created.SpreadsheetId, upd).Context(ctx).Do()
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

// a1 quotes a sheet title for A1 notation (titles contain spaces).
func a1(title string) string { return "'" + title + "'!A1" }

func headerFormat(sheetID int64) *gsheets.Request {
	return &gsheets.Request{RepeatCell: &gsheets.RepeatCellRequest{
		Range: &gsheets.GridRange{SheetId: sheetID, StartRowIndex: 0, EndRowIndex: 1},
		Cell: &gsheets.CellData{UserEnteredFormat: &gsheets.CellFormat{
			TextFormat:      &gsheets.TextFormat{Bold: true},
			BackgroundColor: &gsheets.Color{Red: 0.90, Green: 0.90, Blue: 0.92},
		}},
		Fields: "userEnteredFormat(textFormat,backgroundColor)",
	}}
}

func percentFormat(sheetID, startRow, endRow, startCol, endCol int64) *gsheets.Request {
	return &gsheets.Request{RepeatCell: &gsheets.RepeatCellRequest{
		Range: &gsheets.GridRange{
			SheetId: sheetID, StartRowIndex: startRow, EndRowIndex: endRow,
			StartColumnIndex: startCol, EndColumnIndex: endCol,
		},
		Cell: &gsheets.CellData{UserEnteredFormat: &gsheets.CellFormat{
			NumberFormat: &gsheets.NumberFormat{Type: "PERCENT", Pattern: "0%"},
		}},
		Fields: "userEnteredFormat.numberFormat",
	}}
}

func colorScale(sheetID, startRow, endRow, startCol, endCol int64) *gsheets.Request {
	return &gsheets.Request{AddConditionalFormatRule: &gsheets.AddConditionalFormatRuleRequest{
		Rule: &gsheets.ConditionalFormatRule{
			Ranges: []*gsheets.GridRange{{
				SheetId: sheetID, StartRowIndex: startRow, EndRowIndex: endRow,
				StartColumnIndex: startCol, EndColumnIndex: endCol,
			}},
			GradientRule: &gsheets.GradientRule{
				Minpoint: &gsheets.InterpolationPoint{Type: "NUMBER", Value: "0", Color: &gsheets.Color{Red: 0.96, Green: 0.55, Blue: 0.55}},
				Midpoint: &gsheets.InterpolationPoint{Type: "NUMBER", Value: "0.5", Color: &gsheets.Color{Red: 1.0, Green: 0.90, Blue: 0.55}},
				Maxpoint: &gsheets.InterpolationPoint{Type: "NUMBER", Value: "1", Color: &gsheets.Color{Red: 0.55, Green: 0.82, Blue: 0.60}},
			},
		},
	}}
}

func autoResize(sheetID int64) *gsheets.Request {
	return &gsheets.Request{AutoResizeDimensions: &gsheets.AutoResizeDimensionsRequest{
		Dimensions: &gsheets.DimensionRange{SheetId: sheetID, Dimension: "COLUMNS"},
	}}
}
