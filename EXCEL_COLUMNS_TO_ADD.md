# Excel File Columns to Add

## Important Note
**The current system reads from Excel but does NOT write back to Excel.** All changes are stored in memory only and will be lost when the server restarts.

## Columns to Add to `agreement_master` Worksheet

You need to manually add these 5 new columns to your `agreement.xlsx` file in the `agreement_master` worksheet:

### 1. `agreement_scheduled_to_vacate`
- **Type**: Text/Boolean
- **Values**: `Yes` or `No` (or `true`/`false`)
- **Purpose**: Indicates if agreement is scheduled to be vacated
- **Default**: Leave empty or `No` for existing records

### 2. `agreement_vacate_date`
- **Type**: Date
- **Format**: YYYY-MM-DD (e.g., `2024-12-31`)
- **Purpose**: The date when the property will be vacated
- **Default**: Leave empty for existing records

### 3. `agreement_advance_due_back`
- **Type**: Number/Currency
- **Format**: Numeric value (e.g., `40000`)
- **Purpose**: Total advance amount that should be returned when property is vacated
- **Default**: `0` or leave empty for existing records
- **Note**: This is automatically set to `agreement_advance_amount` when status becomes inactive

### 4. `agreement_advance_received`
- **Type**: Number/Currency
- **Format**: Numeric value (e.g., `30000`)
- **Purpose**: Actual amount received back after maintenance deduction
- **Default**: `0` or leave empty for existing records
- **Calculation**: `agreement_advance_due_back - agreement_maintenance_cut`

### 5. `agreement_maintenance_cut`
- **Type**: Number/Currency
- **Format**: Numeric value (e.g., `10000`)
- **Purpose**: Amount deducted by landlord for maintenance
- **Default**: `0` or leave empty for existing records

## Column Order in Excel

Add these columns after the existing columns. The current columns are:
1. agreement_id
2. agreement_residence_id
3. agreement_possesion_date
4. agreement_renewal_due_date
5. agreement_employee_unit
6. agreement_advance_amount
7. agreement_monthly_rent_amount
8. agreement_status

**New columns to add:**
9. agreement_scheduled_to_vacate
10. agreement_vacate_date
11. agreement_advance_due_back
12. agreement_advance_received
13. agreement_maintenance_cut

## How to Add Columns

1. Open `agreement.xlsx` in Excel
2. Go to the `agreement_master` worksheet
3. Add the 5 new column headers in row 1 (after the last existing column)
4. Leave all existing rows empty for these new columns (or set defaults)
5. Save the file
6. Restart your backend server

## Current Limitation

⚠️ **IMPORTANT**: The system currently does NOT write changes back to Excel. All updates (scheduling vacate, processing refunds) are stored in memory only and will be lost when you restart the server.

To persist data, you would need to:
- Implement Excel write functionality, OR
- Migrate to a database (PostgreSQL, MySQL, etc.)

## MIS Dashboard Columns (Optional)

For full MIS reporting (Owner's Summary, Proactive Pipeline, Compliance, Landlord Rating), you can add these columns. They are optional; the dashboard will show "—" where data is missing.

### In `employee_master` worksheet
- **`employee_last_working_date`** (Date, YYYY-MM-DD): Projected last working day for 15-day notice and replacement planning.
- **`employee_notice_served`** (Text/Boolean): `Yes`/`No` — "Ready for Inspection" once notice is served.

### In `agreement_master` worksheet
- **`agreement_notice_period_days`** (Number): e.g. `30` — days of notice required before vacate.
- **`agreement_notice_due_by_date`** (Date, YYYY-MM-DD): Date by which landlord must be informed if you intend to vacate.
- **`agreement_statutory_status`** (Text): e.g. `Signed`, `Pending`.
- **`agreement_document_location`** (Text): Where the latest agreement is stored.

### In `residence_master` worksheet
- **`residence_owner_rating`** (Text/Number): Landlord rating (e.g. refund responsiveness).

## Testing After Adding Columns

1. Add the columns to Excel
2. Restart backend server
3. The system will read the new columns (even if empty)
4. When you schedule vacate or process refunds, the data will be stored in memory
5. The data will be visible in the app until server restart

