# BCIS Video Run Through

**Target length:** 34-36 minutes for the main story, plus an optional 3-5 minute GCash segment. **Audience:** a first-time viewer who needs to understand how BCIS handles a subscriber from plan setup through billing, payment, collection, and reporting.

Record the desktop application. Keep the cursor visible, pause after important actions, and hold each result long enough to read its status and amount. The script is a speaking guide, not a word-for-word voice-over.

## The story to show

Follow one synthetic customer through the normal service lifecycle:

1. Create a monthly service plan.
2. Register a subscriber.
3. Add a service account, which represents that subscriber's subscription.
4. Preview a billing cycle, generate an invoice draft, and finalize it.
5. Receive a partial office payment and review its receipt and ledger allocation.
6. Follow the remaining balance through collections and receivables.
7. Review the final operational and revenue reports.
8. Show backup readiness and role-based access.

This order explains how the records connect. A plan describes an offer. A service account subscribes one customer to that offer at a copied rate. Billing creates an invoice for an eligible service period. Payments and collections create traceable financial records against the invoice.

## Before recording

1. **Use a dedicated disposable lab database with synthetic data.** Do not use production, real customer details, or a shared database. Finalizing a billing run posts invoices to ledgers. Posting a payment or field collection creates financial history. Perform the complete recording once in this database and retain it afterward; do not reset, restore, or delete posted evidence to improve a take. Use a separate fresh lab database for another complete take.
2. Follow the repository's [Deployment Guide](manual/DEPLOYMENT.md) to prepare the separate lab database and start the API and desktop application. Confirm that the Owner can sign in before recording.
3. Prepare access for an Owner, Cashier, Collection Supervisor, and Auditor. Pause capture during password entry. Never show `.env`, database URLs, tokens, password managers, or terminal output that contains credentials.
4. Use fictional subscriber and contact details. Do not use actual customer names, account numbers, addresses, phone numbers, payment references, or proof images.
5. Reserve unique values for the new data, such as `VID-PLAN-<TAKE>`, `VID-SUB-<TAKE>`, and `VID-SVC-<TAKE>`. Replace `<TAKE>` with a short code before recording. Set the collection area and collector so the service can appear on a route.
6. Pick a billing month with no invoice already generated for the new service. Set the service billing start date on or before that month's final day. Check the invoice due date and the current delinquency policy before expecting the account to appear in receivables.
7. Use the example amounts below only in the synthetic lab database. Keep each amount consistent through the demo. If the app's current rules or lab data require a different amount, use the amount shown by the app and narrate that amount accurately.
8. Set the app window to a readable desktop size, close unrelated windows and notifications, keep the cursor visible, and place the application on Sign in. Rehearse the creation and billing path once before recording. For a full recording take, use a new database rather than repeating a finalized billing cycle.

### Example demonstration data

| Record           | Example value                                                          |
| ---------------- | ---------------------------------------------------------------------- |
| Plan             | Internet, `VID-PLAN-A`, Demo Fiber Plan, `PHP 1,500.00` per month      |
| Subscriber       | `VID-SUB-A`, Demo Subscriber                                           |
| Service account  | `VID-SVC-A`, linked to the plan, assigned to a demo area and collector |
| Office payment   | `PHP 500.00`, Cash; leaves `PHP 1,000.00` on a `PHP 1,500.00` invoice  |
| Field collection | `PHP 1,000.00`, Cash; matches the remaining balance                    |

Use your own unique suffix if these values already exist. The fictional account's balance should be zero after the route is reconciled.

## Timed recording script

### 1. Introduce the system and sign in (0:00-1:30)

**Show:** Start on the sign-in screen. Sign in as Owner with capture paused for credentials. Point out the role and grouped navigation in the top bar and sidebar. Collapse and expand the sidebar once, then leave it open.

**Say:** "BCIS is a desktop system for subscriber accounts, service plans, monthly billing, payment collection, receivables, and financial reporting. The desktop client sends requests to a separate API, and the server enforces access for each action."

**Pause on:** The signed-in Owner name and the main navigation. Do not show the password.

### 2. Start from Today (1:30-3:00)

**Show:** Open **Today**. Point to the recommended action and priority cards. Change the **To date** once. Show the payment-method mix, receivables aging, and billing-versus-collection chart updating. Open one card's detail panel, then close it.

**Say:** "Today gives staff a short view of work that needs attention. The date range changes activity totals. Receivables aging is a balance snapshot, while the chart compares billing with money collected."

**Pause on:** One current action card and the date range. Do not spend time reading every dashboard total.

### 3. Create the service plan (3:00-6:00)

**Show:** Open **Plans** and select **Add service plan**. In **Plan identity**, choose Internet and enter the unique demo code and name. Continue to **Offer and price**. Set the monthly price and the relevant speed fields. Review the offer, then select **Create plan**. Confirm that its card shows the expected price and **Active** status. Open **View plan** briefly, then close it.

**Say:** "The plan is the catalogue offer: service type, plan code, name, and monthly rate. It does not yet belong to a customer. Saving the plan makes it available when we create a service account. A later catalogue price change applies to new services; existing service rates and finalized invoices keep their recorded values."

**Pause on:** The new plan card and monthly price. Use a unique code so the app's duplicate protection does not block the demo.

### 4. Register the subscriber (6:00-9:00)

**Show:** Open **Subscribers** and select **Register subscriber**. Enter the synthetic account number, name, primary contact type and value, address, collection area, collector, default billing day, and default due day. Review the information and select **Save subscriber**. Point out the new subscriber profile and its **ACTIVE** status.

**Say:** "The subscriber is the customer record. BCIS keeps identity and contact details separate from each service subscription, so one subscriber can hold more than one service account. The area and collector connect the account to field collection."

**Pause on:** The profile header, account number, status, address, collector, and service count. Keep all details fictional.

### 5. Add the subscription as a service account (9:00-11:30)

**Show:** In the subscriber profile, open **Services** and use **Add service account**. Enter the unique service number, select the plan created a moment ago, set a fictional installation address, confirm the assigned collector and billing area, and set billing day, due day, and billing start date. Select **Add service**. Confirm it appears under **Connected services** with the chosen plan, copied monthly rate, and **ACTIVE** status.

**Say:** "This service account is the customer's subscription. It connects the subscriber to a plan and installation address. The service keeps the monthly rate that applies to it, even if the catalogue offer changes later. The billing start date determines which monthly periods can include it."

**Pause on:** The connected service's plan, monthly rate, billing dates, and status.

### 6. Preview and finalize billing (11:30-16:30)

**Show:** Open **Billing**. Choose the prepared billing month and select **Prepare billing**. Read the eligibility preview: eligible services, already invoiced services, expected drafts and amount, plus exclusions. Select **Generate drafts**. Review the draft count and total, then open **View invoice register**. Search for the synthetic subscriber and open the new invoice. Point out the billing period, due date, frozen line item, monthly price, total, and balance.

Before finalizing, pause on the confirmation details. In this disposable lab database, select **Review and finalize**, verify the period, invoice count, and total, then select **Confirm finalization** once. Confirm that the billing run changes to **Posted** or **Finalized** and that the invoice is posted to the subscriber ledger.

**Say:** "The preview shows which services qualify before any invoice is created. Drafts let staff inspect the result first. Finalization is the posting step: it creates the invoice as financial history and adds the charge to the subscriber ledger. We check the count and total before confirming."

**Pause on:** The invoice total, posted status, and billing run summary. Do not finalize the same period again for this service.

### 7. Receive a partial office payment (16:30-20:00)

**Show:** Open **Payments**, then **Receive Payment**. Find the synthetic subscriber and select the account. Enter `PHP 500.00` and choose **Cash**. Select **Preview allocation**. Point out how the app allocates money to the oldest unpaid invoice first and shows any remaining credit. Confirm the preview, then select **Post payment** once. In the receipt, show the receipt number, amount, allocated amount, remaining invoice balance, payment method, and **POSTED** status.

**Say:** "The cashier sees the allocation before posting. In this example, PHP 500 is applied to the new invoice, leaving PHP 1,000 open. Posting creates a receipt and ledger entry. A posted payment is not silently edited or deleted; a correction uses a linked reversal."

**Pause on:** The receipt and remaining invoice balance. Do not repeat the post action to improve a take.

### 8. Trace the invoice in the subscriber record (20:00-22:00)

**Show:** Return to **Subscribers**, open the same profile, and select **Billing**. Point to the invoice and remaining balance. Open **Ledger**, apply a date range that includes the invoice and receipt, and show the invoice debit and payment credit. Select **Print SOA** only if the preview is already available and readable; no need to send or print it.

**Say:** "The subscriber profile connects the service, invoice, receipt, and running balance. The ledger explains how the balance was formed. The Statement of Account gives staff a customer-facing summary from the same records."

**Pause on:** The invoice and payment entries in chronological order.

### 9. Process the remaining balance through a collection route (22:00-27:30)

**Show:** Sign in as Collection Supervisor if a separate role is available; pause capture during credentials. Open **Collections** and select **Prepare route**. Choose the demo collector, area, and route date. Select **Review accounts**. Confirm the synthetic subscriber is eligible, then select **Review route** and **Issue collection route**. Open the batch and select **Start batch**. On the subscriber account card, select **Record collection**, enter the remaining `PHP 1,000.00`, choose **Cash**, and select **Post collection**. Submit the batch. Under **Record Cash remittance**, enter `PHP 1,000.00`; confirm collected cash, remitted cash, and zero difference. Review the reconciliation and close the batch.

**Say:** "The route assigns eligible open accounts to a collector and area. The batch records what was collected and what cash was turned in as separate facts. Here the remaining invoice balance is collected in full, and the remittance matches. BCIS keeps the route and reconciliation history instead of forcing a shortage or overage to zero."

**Pause on:** The account collection, batch totals, zero difference, and closed status. If the app does not list the synthetic subscriber, do not change eligibility rules to force it. Use a compatible synthetic account that appears in the preview, or show the route using an existing test case.

### 10. Review receivables (27:30-29:30)

**Show:** Open **Receivables**. Select a balance date and **Apply date**. Show the snapshot cards and aging ranges. Open **All cases** or the matching priority lane. If the demo subscriber is still eligible after the partial office payment, open **Review case** and point to the oldest invoice, current balance, last payment, service state, and policy basis. If the route has already cleared the example, show its updated zero balance in the subscriber profile, then use an existing eligible synthetic case for the receivables screen.

**Say:** "Receivables helps staff prioritize follow-up using the balance date, aging, due dates, and current service state. The case view links the summary back to the invoice and service history. Eligibility follows the configured policy; we do not invent a delinquent case for the demo."

**Pause on:** One real case and its policy reason. Do not suspend or reconnect a service during the recording.

### 11. Answer a business question with Reports (29:30-32:30)

**Show:** Open **Reports**. Under **Revenue & collection**, choose **How much did we collect?** or another populated question. Set a date range that includes the new receipt and route collection, then select **Preview answer**. Point to the filter snapshot, totals, chart, and record cards. Open **View detailed register**. Show the **Export PDF** and **Export XLSX** controls without saving a file unless the recording plan needs an example export.

**Say:** "Reports begin with a business question. The preview shows its date basis, filters, total, and source records. Staff can drill into the register or export the same authorized result. This links the work at the counter and in the field to management reporting."

**Pause on:** The selected date range, total, and at least one source record.

### 12. Show recovery readiness and access boundaries (32:30-34:30)

**Show:** As Owner, open **Backup & recovery**. Point to Database connection, Attachment storage, Backup storage, PostgreSQL tools, the latest verified backup, and **Backup register**. In the disposable lab database, select **Create verified backup** once only if you want to demonstrate backup creation. Confirm its verified status. Do not restore a backup during this video.

Sign out, pause capture, and sign in as Auditor. Show that financial reports and permitted billing or payment evidence remain available while management workspaces, plans, services, and backup actions are absent. Open one report or receipt, then sign out.

**Say:** "Recovery readiness checks the database, file storage, backup storage, and required tools. Backup history records the result. Auditor access is narrower: it supports review of permitted evidence without giving the role control over account setup or recovery."

**Pause on:** The readiness indicators, verified backup status if created, and the Auditor's available navigation.

### 13. Close the story (34:30-35:30)

**Show:** Return to **Today** or a clean report result. Hold the final screen for a few seconds.

**Say:** "We created the offer, connected a subscriber to it, billed the service, recorded a payment, followed the remaining balance through collection, and reviewed the resulting reports. Each step leaves a traceable record, with access controlled by role."

## Optional 3-5 minute GCash segment

Use this only when a synthetic pending GCash submission is available. Open **Payments** and **GCash Verification**. Compare the transaction reference, sender details, amount, and proof image. Explain that a submitted proof is pending and does not pay an invoice by itself. Show **Approve and post** or **Reject** without confirming the action. If an approval must be demonstrated, use a separate disposable lab database and post only once; then show the created receipt in Payment History.

## Recording rules and fallbacks

- Finalizing billing, posting a payment, posting field collection, reconciling a batch, and creating a backup all change the lab system. Use synthetic data and a dedicated database. Keep posted financial history; do not reset or restore the database to erase the take.
- Never perform a restore in the video. Restore replaces current data and belongs in a separate, approved recovery exercise.
- If the selected month has no eligible service, check the service start date and billing month. If the service already has an invoice for that period, choose a different fresh service or a different unused period. Do not bypass duplicate-billing protection.
- If the new account is not overdue, it may not appear in the receivables queue. Show its current ledger balance and use a separate existing synthetic case for the receivables view. Do not alter delinquency policy to make the demo look overdue.
- If the account does not qualify for a collection route, show the eligibility preview and use a populated synthetic route for the batch lifecycle. Do not change collector or area rules solely to force the account into a route.
- If a report is empty, widen the date range and preview again. If the selected date range still has no result, choose a populated synthetic report and state which example you changed.
- If no compatible backup exists, show readiness and the register. If a required tool reports **Not ready**, explain the state and stop there; do not start a restore to make the demo look successful.
- If a click has no visible result, stop the take, verify the interaction, and record that segment again. Do not narrate an action as successful unless its result appears on screen.
- Hold each important status and amount on screen long enough to read. Avoid long register scrolling; open one representative record and return to the workflow.
- Pause capture during sign-in, role switching, and any sensitive operating-system prompt. Keep customer details, credentials, account tokens, database URLs, and real payment evidence off-screen.

For exact operating steps and permission rules, see the [User Manual](manual/USER_MANUAL.md), [Deployment Guide](manual/DEPLOYMENT.md), and [Authorization Rules](AUTHORIZATION_RULES.md).

## Before publishing the recording

- Watch the exported video once. Confirm that narration, cursor movement, and on-screen results are easy to follow. Each posted invoice, receipt, and collection must have a matching on-screen confirmation.
- Add chapter titles for the plan, subscriber, service, billing, payment, collection, receivables, reports, and recovery segments. Update chapter times after editing.
- Confirm that all visible records are synthetic. Remove or re-record any shot that reveals a real name, account number, address, contact detail, payment reference, proof image, password, token, or database URL. Check that captions match the final edit and that the opening identifies this as a synthetic lab demonstration. Do not narrate an action that was not completed.
