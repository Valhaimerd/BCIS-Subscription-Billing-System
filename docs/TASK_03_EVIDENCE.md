# Task 3 Evidence

Task 3 implements the laboratory's plans, subscribers, service accounts, assignments, lifecycle history, and current master-data search scope.

## Implemented

- Migration `0001_loose_spacker_dave.sql` adds service types/plans, collection areas, collectors/assignments, subscribers, addresses, contacts, subscriber events, service accounts, and service events.
- PostgreSQL unique indexes protect subscriber and service-account numbers.
- Existing service accounts retain their captured centavo rate when a plan's future price changes.
- Authenticated `/api/v1` routes enforce `subscriber.view`, `subscriber.manage`, or `service.manage` as appropriate.
- Desktop views provide plan creation/price/status management, paginated subscriber search, registration, profile tabs, multiple services, and subscriber lifecycle controls.
- Search covers the identifiers and text available in Task 3: subscriber/service account number, name, contact, and address. Receipt, invoice, and GCash-reference fields are added by Tasks 4 and 5 when those records exist.

## Verified results

- `npm run db:migrate` — passed.
- `npm run db:seed` — passed repeatedly.
- `npm run verify:task3 --workspace @bcis/api` — passed with at least 50 subscribers, 60 service accounts, 7 plans (3 Internet, 2 Cable, 2 Combo), 2 collectors, and 3 areas; historical rate preservation passed.
- Electron journey — passed subscriber creation, two service assignments, profile display, archive behavior, and plan display.
- Repository checks — format, lint, typecheck, tests, and build passed.

## Visual evidence

- [Paginated subscriber master](../output/playwright/bcis-task-03-subscribers.png)
- [Profile with multiple services](../output/playwright/bcis-task-03-profile-services.png)
- [Archived subscriber](../output/playwright/bcis-task-03-archived.png)
- [Internet, Cable, and Combo plans](../output/playwright/bcis-task-03-plans.png)
