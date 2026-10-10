# BCIS User Manual

## 1. Sign in and navigation

Start the desktop client, enter the assigned username and password, then select **Sign in**. The left navigation shows only the destinations permitted for the signed-in role; the API independently checks every operation. Destinations are grouped under Today, Customers, Money, Field work, Insights, and System. On a wide window, use **Collapse sidebar** in the sidebar header to switch to the icon rail; **Expand sidebar** there restores the labels. The preference is remembered. In the rail, hover an icon to see its name; each icon also has an accessible label, and the current destination stays highlighted. At compact widths, **Open navigation menu** opens a drawer; choose a destination, select **Close navigation**, press `Esc`, or click the shaded area to close it.

Each workspace keeps one page title and purpose line above its work area. The compact top bar stays available for subscriber search and session controls, with an opaque background so scrolling content does not show through it.

**Today** starts with a recommended action and a small set of work cards based on your permissions. Select a Receivables, Payments, or Field collections card to open a focused detail panel; select its action to continue into that workspace. The panel closes with **Close details**, `Esc`, or the shaded area. Staff with reporting access can change the dashboard date range, see the billing-versus-collection chart, and expand **View monthly figures** for the chart values. Open **Reports** for detailed financial breakdowns. Cashiers see **Start a payment** when permitted, with customer and payment shortcuts beneath it.

For a complete laboratory walkthrough, sign in as `owner`. In normal operations, use the account appropriate to the work:

| Role                  | Typical work                                                       |
| --------------------- | ------------------------------------------------------------------ |
| Owner                 | All implemented workflows, reports, backup, and guarded restore    |
| Administrator         | Plans, subscribers, services, billing, and operations              |
| Cashier               | Subscriber lookup, office payments, GCash submission, and receipts |
| Collection Supervisor | Collection batches, remittance, reconciliation, and receivables    |
| Accounting / Auditor  | Read-only financial, collection, report, and audit review          |
| Technician            | Subscriber lookup and service-status work                          |

User and role administration is not currently available in the desktop
workflow. Accounting / Auditor can review financial corrections and audit
history, but cannot create adjustments or reverse payments.

Use the lock button when stepping away and sign out when finished. Seeded accounts are laboratory accounts and must receive unique passwords before real use.

When an invoice, receipt, collection batch, or receivable account is opened, its details appear in a modal dialog over a dimmed workspace. Select **Close**, press `Esc`, or select the shaded area outside the dialog to return to the list.

Actions that change financial or master data open an in-app review dialog from the clicked action. Review the amount and effect, enter the requested reason, then explicitly confirm. **Cancel** or `Esc` leaves the record unchanged. If an attachment is unavailable, the GCash proof panel explains that state and keeps approval/rejection unavailable.

## 2. Complete subscriber-to-collection workflow

The normal business lifecycle is:

```text
Create or confirm plan
        -> Register subscriber
        -> Add service account
        -> Generate and finalize monthly billing
        -> Receive and allocate payment
        -> Review ledger and receipt
        -> Monitor collections and receivables
        -> Produce reports and backup
        -> Repeat billing next month
```

Plans are configured only when a new offering is needed. Subscribers are registered once, while billing, payment collection, receivables review, reporting, and backup are recurring activities.

### Step 1 — Create or confirm the service plan

Use the Owner or Administrator account.

1. Select **Plans** from the left navigation.
2. Compare the Internet, Cable, and Combo cards. Search by name, code, or type; filter status or sort price. Select **View register** when a compact table is easier to compare. Reuse an active plan when it already represents the offer.
3. To add a plan, select **Add service plan**. Enter the service type, unique code, and name. Continue to monthly price and the relevant speed or channel fields, then review the offer and select **Create plan**.
4. Confirm that the new card appears with an `Active` status and the correct monthly price.

Select **View plan** to see its full details. For an approved price change, select **Change price**, enter a new monthly price and reason, review the old and new prices, then select **Save new price**. The reason is retained in audit history. The new catalogue price applies to services added afterward; existing service rates and finalized invoices stay fixed. Use **Deactivate** when the plan must no longer be offered to new service accounts.

### Step 2 — Register the subscriber

1. Select **Subscribers**.
2. Select **Register subscriber**.
3. Complete the registration form:
   - **Subscriber number:** a unique account number such as `SUB-00070`.
   - **Full name:** the subscriber's complete name.
   - **Primary contact type** and **Primary contact**.
   - **Primary address**.
   - **Collection area:** the route or geographic area used for field collection.
   - **Collector:** the person normally assigned to the subscriber.
   - **Default billing day:** usually day `1`.
   - **Default due day:** usually day `15`.
   - **Notes:** optional operational information only.
4. Select **Save subscriber**.
5. Confirm that the subscriber profile opens with the correct account number, name, address, and `ACTIVE` status. The **Activity** view is the chronological summary; use **Services**, **Billing**, and **Ledger** for their detailed workspaces when your role allows them.

The subscriber identity panel stays visible while you move between profile tabs. It shows the account number, status, address, contact, area, collector, and connected-service count. Staff with receivables permission also see a current balance snapshot. **Contacts**, **Addresses**, and **Service history** remain separate; **Billing** and **Ledger** appear only when the role has billing access. Use the left and right arrow keys to move through profile tabs, or `Home` and `End` to select the first or last tab. Opening a permitted workspace from Activity preserves the selected subscriber when you return to Subscribers.

Do not create a second subscriber record to correct a typing error, and do not delete historical subscribers. Use the available lifecycle statuses when an account becomes inactive or archived.

### Step 3 — Add the subscriber's service account

A subscriber must have at least one service account before monthly billing can charge them. One subscriber may have multiple Internet, Cable, or Combo services.

1. In the subscriber profile, open the **services** tab.
2. Under **Add service account**, enter:
   - **Service number:** a unique number such as `SVC-00070-1`.
   - **Plan:** the active plan subscribed to by the customer.
   - **Installation address:** the address where the service is installed.
   - **Collector:** the assigned field collector, or `Unassigned` when not applicable.
   - **Billing day** and **Due day**.
   - **Billing start:** the first date from which the service is eligible for billing.
3. Select **Add service**.
4. Confirm that the service appears under **Connected services** with the correct plan, current monthly rate, billing day, due day, and `ACTIVE` status.

The rate copied to the service account is used by future billing. Finalized invoices preserve the rate that was applicable when they were created.

### Step 4 — Generate and finalize monthly billing

Perform this once per billing period after subscriber and service changes for that month are complete.

1. Select **Billing**.
2. Under **Generate draft cycle**, select the required **Billing month**.
3. Select **Generate drafts**.
4. Review the new row under **Monthly runs**:
   - billing period;
   - number of invoices;
   - total amount; and
   - `DRAFT` status.
5. Review the invoice list and open individual invoice numbers when necessary.
6. When the draft totals are correct and at least one invoice was generated, select **Review and finalize**.
7. Review the invoice count and total in the confirmation dialog, then select **Confirm finalization**. If the cycle has no eligible services, it cannot be finalized.
8. Confirm that the cycle becomes `FINALIZED` and that its invoices are posted to subscriber ledgers.

Generating the same month again safely skips service-period invoices that already exist. Do not change data merely to bypass the duplicate-billing protection. A finalized invoice should be corrected only through an authorized adjustment or void with a recorded reason.

### Step 5 — Receive an office payment

Use the Cashier, Administrator, or Owner account.

1. Select **Payments**, then open **Receive Payment**.
2. Enter an account number or subscriber name in **Find subscriber**, then select **Find**.
3. Choose the subscriber from the **Subscriber** list.
4. Enter the **Amount (PHP)**.
5. Select the payment **Method**: Cash, GCash, Bank Transfer, Cheque, or Other.
6. Enter a reference number when required by office policy. GCash requires a reference, sender details, and proof image.
7. Enter useful **Notes** when necessary.
8. For Cash, Bank Transfer, Cheque, or Other, select **Preview allocation** and review how the amount will be applied. A fresh preview is required before posting and is cleared if the amount or subscriber changes.
9. Confirm that older unpaid invoices are allocated first and that any excess is shown as subscriber credit.
10. Select **Post payment**. On success, the new receipt opens automatically; close it to return to Payment History. GCash instead uses **Submit for verification** and does not create a receipt at this step.
11. Confirm the receipt amount, allocated amount, subscriber credit, payment method, and `POSTED` status. Use **Payment History** to find older receipts.
12. Select **Print receipt** when a customer copy is required.

The amount must always equal the allocated amount plus any retained subscriber credit. A posted payment is never silently edited or deleted.

### Step 6 — Submit and verify a GCash payment

GCash has two stages: cashier submission and authorized verification.

1. In **Payments → Receive Payment**, find and select the subscriber.
2. Enter the amount and select `GCASH` as the method.
3. Enter the GCash transaction reference and sender details.
4. Attach a JPEG, PNG, or WebP proof image.
5. Select **Submit for verification**. The transaction enters `PENDING VERIFICATION`; the proof image alone does not pay the invoice.
6. An authorized user opens **GCash Verification**.
7. Select the pending transaction and compare its reference, sender, amount, and proof.
8. Select **Approve and post** when the proof is valid, or **Reject** when it is not.
9. For approval, review the subscriber, reference, and amount in the confirmation dialog, then select **Approve payment**. Confirm that a receipt is created and the payment appears as `POSTED` in **Payment History**.
10. Confirm that a rejected submission does not reduce the subscriber's balance.

The system blocks reuse of an existing GCash reference. When a duplicate warning appears, locate the original transaction instead of changing the reference to bypass the protection.

### Step 7 — Check the invoice, ledger, and Statement of Account

1. Select **Subscribers** and search for the subscriber.
2. Open the subscriber profile.
3. Open the **billing** tab to confirm invoice status and remaining balance.
4. Open the **ledger** tab.
5. Set the **From** and **To** dates, then select **Apply range**.
6. Confirm that invoice charges appear as debits and posted payments appear as credits in chronological order.
7. Confirm that the running balance agrees with the subscriber's outstanding balance.
8. Select **Print SOA** when a Statement of Account is required.

### Step 8 — Process a house-to-house collection batch

Use the Collection Supervisor or Owner account. Subscribers must already have a compatible collection area and collector assignment.

1. Select **Collections**.
2. Under **Generate collection batch**, choose the **Collector**, **Collection area**, and **Route date**.
3. Select **Generate route sheet**.
4. In **Collection batches**, review the collector, area, assigned account count, expected amount, current status, and **Next step**. Select the batch date or press Enter to open its route. An empty route means no assigned active services matched that collector and area.
5. Follow the highlighted lifecycle step. Only the permitted next action is shown to staff with collection permissions; read-only staff can still review and print the route.
6. Select **Start batch**. Its status becomes `IN PROGRESS`.
7. For each collected account, select **Record**, enter the amount and method, and select **Post collection**. A submitted GCash proof remains pending and is not a posted receipt; an authorized verifier must approve or reject it before the batch can be submitted.
8. After recording the route results and resolving pending proofs, select **Submit batch**.
9. Under **Record Cash remittance**, enter the Cash actually turned over by the collector and select **Record remittance**.
10. Review **Cash collected**, **Cash remitted**, and **Difference**:

- zero means balanced;
- a smaller remittance produces a shortage; and
- a larger remittance produces an overage.

11. Select **Confirm reconciliation** and confirm the displayed signed difference in the review dialog.
12. Select **Confirm and close batch**, then confirm the close dialog to finish the batch.

The required lifecycle is `OPEN → IN PROGRESS → SUBMITTED → REMITTED → RECONCILED → CLOSED`. Shortages and overages remain recorded and are never silently forced to zero.

### Step 9 — Monitor receivables and service status

1. Select **Receivables**.
2. Choose the **Balance date** and select **Refresh**. The displayed snapshot date changes only after the matching summary and account list load.
3. Review the priority measures: overdue balance, follow-up accounts, suspension candidates, and total receivables. Current balance and overdue subscriber count are shown as supporting measures.
4. The account queue sorts eligible follow-up accounts first, then oldest due date, then arrears. Use the aging buttons or filters for collector, area, plan, service, and age to narrow it.
5. Select **Review [subscriber] receivable details** to open **Service control**.
6. Review the subscriber and service identifiers, plan, area/collector, oldest unpaid invoice and due date, months overdue, arrears, last payment, and service status timeline.
7. If an active account qualifies under the configured policy, enter the effective date, reason, and notes, then select **Approve suspension**.
8. After the qualifying balance is paid, use the reconnection workflow and complete the request when service has been restored.

Only authorized personnel should change delinquency settings or approve suspension and reconnection. Every service-state change remains in history.

### Step 10 — Produce operational and management reports

1. Select **Reports**.
2. Choose a report from **Revenue & collection**, **Subscriber accounts**, or, when authorized, **Controls & audit**. Audit reports appear only for users with audit permission; subscriber statements appear only when the role can search subscriber records.
3. Enter the applicable From, To, As-of, grouping, dimension, subscriber, and search filters.
4. Select **Preview report**.
5. Review the title, filter summary, totals, and rows.
6. The preview is paginated. **Export PDF** and **Export XLSX** include all authorized rows matching the selected date, grouping, subscriber, and search filters, regardless of the preview page. **Print** prints the current preview.
7. Open the saved file and confirm that its filter summary and row count match the requested full result.

### Step 11 — Perform end-of-day review and backup

1. Confirm that all office payments appear in **Payment History**.
2. Confirm that pending GCash submissions have been reviewed or intentionally carried forward.
3. Confirm that submitted collection batches have a recorded remittance and reviewed difference.
4. Review dashboard collection and receivable totals.
5. As Owner, select **Backup & recovery**.
6. Confirm that Database, Attachments, Backup storage, and PostgreSQL tools show `Ready`.
7. Select **Create verified backup**.
8. Wait for the success message and confirm that the backup appears in **Backup history** as available and successful.

Restore is not a routine end-of-day action. Perform it only during a maintenance window using an approved backup and the exact displayed `RESTORE <backup name>` confirmation. Never interrupt an active restore.

### Step 12 — Continue or end the subscriber relationship

The subscription normally returns to Step 4 for the next monthly billing period. When the business relationship changes:

- Change plans or prices only through authorized plan/service workflows so historical invoices remain unchanged.
- Use suspension and reconnection for temporary service-control actions.
- Use **Inactivate** when the subscriber is temporarily inactive.
- Use **Archive** only when the subscriber record must be closed while retaining all invoices, payments, receipts, ledgers, and audit history.
- Never delete posted financial history to make a balance appear correct.

## 3. Correcting mistakes

### Reverse an incorrect payment

1. Open **Payments → Payment History**.
2. Select the applicable receipt.
3. If your role has payment-reversal permission, select **Reverse**. Accounting / Auditor is read-only and cannot perform this action.
4. Review the reversal amount and receipt effect, enter a clear reason, and select **Reverse payment**. Cancel or press `Esc` to leave the payment unchanged.
5. Verify that the original remains visible, its receipt is voided, its allocations are undone, the balance is restored, and the reason appears in financial/audit history.

### Correct an invoice

Open the invoice from **Billing**. Users with invoice-adjustment permission may create a reasoned adjustment or void the invoice when the business rule permits it. The adjustment dialog accepts a positive debit or a negative credit and records a linked ledger entry; the void dialog shows the balance being removed and requires a reason. Cancel or `Esc` leaves the invoice unchanged. Accounting / Auditor can review the resulting history but cannot perform the correction. Finalized invoice amounts must not be overwritten directly.

## 4. Troubleshooting

- **Cannot sign in:** verify credentials, account status, lockout wait, and API readiness.
- **Server unavailable:** confirm the API is running and `BCIS_API_BASE_URL` uses the correct server address and port.
- **Permission denied:** use a role authorized for the operation. The API may reject an operation even when a screen is manually reached.
- **Subscriber is not billed:** confirm that the subscriber and service are active and that the billing start date is eligible for the selected period.
- **Subscriber is missing from a route:** confirm the active service, collection area, and assigned collector.
- **Duplicate invoice or GCash reference:** open the existing record; do not alter data merely to bypass the guard.
- **GCash remains pending:** an authorized verifier must approve or reject it.
- **Proof unavailable:** verify that server attachment storage is ready and that the proof file was not manually changed.
- **Report export fails:** choose a writable destination and retry; no financial data is changed.
- **Backup or restore fails:** preserve the backup directories, review the API log, and follow `DEPLOYMENT.md`. Do not attempt a manual partial restore.
