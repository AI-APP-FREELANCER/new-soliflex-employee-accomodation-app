# Phase 3 — Customer Feedback (Dashboard accuracy, room-level structure, refunds, units, alerts)

Response to the HR review (Gouthami G). This note covers what changed, how each
dashboard figure is now calculated, and how to deploy safely.

## 1. Dashboard corrections

All dashboard figures now come from one calculation module
(`backend/data/accommodationSnapshot.js`), used by `/api/analytics`, `/api/analytics/mis`,
the room screens and alerts, so every screen shows the same numbers.

| Feedback | Cause | Fix |
|---|---|---|
| Occupancy % not reflecting room utilization | Used "residences with an active agreement ÷ all residences" and "active agreements ÷ house count" — never the actual beds | Occupancy = occupied beds ÷ bed capacity of rooms in active residences. Residences without rooms set up are reported separately ("Room setup pending") instead of distorting the % |
| Allocated vs unallocated count | "Allocated" meant "employee has an agreement ID", ignoring bed allocations; the department table also counted inactive employees | Active employees are split into **Room allocated** (holds a bed), **Residence, no room** (linked to an agreement, room not assigned) and **Not allocated**. These add up to active employees |
| Vacancy only as a total | No room-level table | New **Occupancy & Vacancy** dashboard tab (per residence and per room), **Rooms & Allocation** page with filters + Excel export |
| Rent / advance figures | (a) Department/designation rent added the full agreement rent once per occupant (totals exceeded the real rent bill). (b) "Advance pending refund" included every active agreement's deposit. (c) Refunds settled with landlord deductions stayed "Pending" forever and deductions were subtracted twice in "Net returned". (d) Partially received refunds counted as fully pending | (a) Rent is split equally across an agreement's occupants, so totals equal the real rent. (b) Only vacated agreements are "outstanding"; vacating ones are "upcoming"; active ones are "locked". (c)(d) Outstanding = (due back − deductions) − received, from recorded receipts |

The dashboard has a "How these figures are calculated" panel with these definitions.

## 2. Enhancements

- **Floor & room structure** (`room_master`): each residence → floors → rooms with type and
  capacity. Capacity = number of beds; raising it adds beds, lowering it removes vacant beds
  and is refused below current occupancy. Existing beds were grouped into rooms automatically.
- **Residence view** (Residences → *Floors & Rooms*, or Rooms & Allocation): building → floor →
  room → bed → employee, with vacancy per room and a movement history.
- **Room-level allocation, transfer, vacate**: allocate to a room (first free bed is used) or a
  specific bed; transfer requires a reason; every action is transactional and records who did
  it. The employee's room/floor/agreement fields are kept in sync. The database now enforces
  one active bed per employee and one employee per bed.
- **Alerts** (bell in the header): overdue/upcoming renewals, landlord notice deadlines,
  employees past their last working day still holding a bed, beds held by inactive employees,
  occupants in residences being vacated or without an active agreement, refunds not requested
  or with overdue follow-up, residences without rooms set up, unallocated employees.
- **Advance refund process** (Advance Refunds page): record deductions (electricity / water /
  other) → mark as requested with a follow-up date → record each amount received (partial
  payments allowed, with mode and reference). Settled automatically when receipts cover the
  expected refund. The existing "Process Refund" button records deductions + full balance.
- **Standardisation across units**: a single unit list (Units page). Agreements must use a unit
  from it (Unit is now on the agreement form, along with Advance Amount and Possession Date).
  Different spellings of the same unit are merged in reports and can be fixed in one click.

**Not included — approval workflow** (allocation / transfer / vacate approvals). As suggested in
the feedback, its scope and cost are to be agreed at the factory meeting. The audit trail added
here (who allocated / transferred / vacated, when and why) is the base it will build on.

## 3. Database changes

All in the app's existing `public` schema of the shared database — **no new database**, nothing
touches `transport_schema`. The backend now pins `search_path=public` on every connection and
refuses to run its startup migrations if the connection is not in that schema. (Optional
`DB_SCHEMA` env var; defaults to `public` — no `.env` change needed.)

Added on backend start-up (idempotent — safe to restart any number of times):

- Tables: `room_master`, `unit_master`, `advance_refund_receipts`
- Columns: `bed_allocations.movement_type / transferred_from_alloc_id / allocated_by / released_by`,
  `agreement_master.agreement_refund_requested_date / _followup_date / _settled_date / _notes`
- Unique indexes: one active allocation per bed and per employee
- Backfills: rooms from existing beds; units from existing agreement values; an opening receipt
  for every refund amount already recorded

## 4. Deploying to the VM

1. **Back up the app tables** (from the VM, in `backend/`):
   ```bash
   export $(grep -E '^DB_' .env | xargs)
   PGPASSWORD="$DB_PASSWORD" pg_dump "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=require" \
     -n public -f ~/accommodation_public_backup_$(date +%F).sql
   ```
2. **Pre-check for duplicate active allocations** (the new unique indexes cannot be created if
   any exist). Both queries should return no rows; if they do, release the extra allocation
   before deploying:
   ```sql
   SELECT bed_id, COUNT(*) FROM bed_allocations WHERE is_active GROUP BY bed_id HAVING COUNT(*) > 1;
   SELECT employee_id, COUNT(*) FROM bed_allocations WHERE is_active GROUP BY employee_id HAVING COUNT(*) > 1;
   ```
3. Merge the branch to `main`, then on the VM run the usual update
   (`./scripts/vm-pull-and-deploy.sh` — pulls, installs, builds the frontend, restarts PM2).
4. Check `pm2 logs sol-emp-backend` — any "Startup migration failed" line names the statement.
5. After deploy, ask HR to:
   - open **Units** and merge any non-standard unit spellings,
   - set up floors/rooms for residences shown as "Room setup pending",
   - assign rooms to employees listed as "Residence, no room".
