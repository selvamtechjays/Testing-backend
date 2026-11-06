---
doc_type: test-map
feature_id: FEAT-PLAT-01
produced_by: dev
generated_at: 2026-11-06
---

# Test map — Instant update with rollback (backend)

Every row is runnable on its own. Copy the command. Backend owns the error envelope only; the UI behaviours (AC-1, AC-2, AC-7, BR-1, BR-2) are carried by the frontend sub-task.

| Kind | ID   | Scenario                                                                 | Tier        | Test                                                                                                                                               | Run it                                                                                                                                                                             | Needs     | Fixtures                                |
| ---- | ---- | ------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------- |
| AC   | AC-3 | Add refusal arrives as a VALIDATION envelope with a fields map           | unit        | `tests/parseBody.test.ts::throws ApiError 400 VALIDATION with a fields map`                                                                        | `npm run test:unit -- tests/parseBody.test.ts -t "throws ApiError 400 VALIDATION with a fields map"`                                                                               | —         | —                                       |
| AC   | AC-3 | Add refusal matches the envelope schema                                  | contract    | `tests/contracts/error-envelope.contract.test.ts::ApiError with fields matches the envelope schema`                                                | `npm run test:unit -- tests/contracts/error-envelope.contract.test.ts -t "ApiError with fields matches the envelope schema"`                                                       | —         | `createErrorApp`, `expectMatchesSchema` |
| AC   | AC-4 | Tick/untick refusal (401) arrives as an envelope                         | contract    | `tests/contracts/error-envelope.contract.test.ts::401 from a session guard matches the envelope schema`                                            | `npm run test:unit -- tests/contracts/error-envelope.contract.test.ts -t "401 from a session guard matches the envelope schema"`                                                   | —         | `createErrorApp`, `expectMatchesSchema` |
| AC   | AC-5 | Title-edit refusal carries per-field messages                            | unit        | `tests/parseBody.test.ts::reports every failing field`                                                                                             | `npm run test:unit -- tests/parseBody.test.ts -t "reports every failing field"`                                                                                                    | —         | —                                       |
| AC   | AC-6 | Delete refusal (404/401) arrives as an envelope                          | unit        | `tests/errorHandler.test.ts::writes an ApiError with its own status, code and message`                                                             | `npm run test:unit -- tests/errorHandler.test.ts -t "writes an ApiError with its own status, code and message"`                                                                    | —         | `createErrorApp`                        |
| AC   | AC-8 | Malformed JSON is a 400 BAD_REQUEST                                      | unit        | `tests/errorHandler.test.ts::maps unparseable JSON to 400 BAD_REQUEST`                                                                             | `npm run test:unit -- tests/errorHandler.test.ts -t "maps unparseable JSON to 400 BAD_REQUEST"`                                                                                    | —         | `createErrorApp`                        |
| AC   | AC-8 | Oversized body is a 400 BAD_REQUEST                                      | unit        | `tests/errorHandler.test.ts::maps an oversized body to 400 BAD_REQUEST`                                                                            | `npm run test:unit -- tests/errorHandler.test.ts -t "maps an oversized body to 400 BAD_REQUEST"`                                                                                   | —         | `createErrorApp`                        |
| AC   | AC-8 | Connectivity failure maps to 503 SERVICE_UNAVAILABLE (all error classes) | unit        | `tests/errorHandler.test.ts::maps MongoNetworkError to 503 SERVICE_UNAVAILABLE`                                                                    | `npm run test:unit -- tests/errorHandler.test.ts -t "to 503 SERVICE_UNAVAILABLE"`                                                                                                  | —         | `createErrorApp`                        |
| AC   | AC-8 | A real unreachable Mongo yields the 503 envelope                         | integration | `tests/integration/error-envelope.integration.test.ts::a real server-selection failure returns the 503 envelope`                                   | `npm run test:integration -- tests/integration/error-envelope.integration.test.ts -t "a real server-selection failure returns the 503 envelope"`                                   | `real-db` | `createErrorApp`                        |
| AC   | AC-8 | A failed real DB write yields a generic 500 with no driver details       | integration | `tests/integration/error-envelope.integration.test.ts::a handler that fails a real database write returns the 500 envelope without driver details` | `npm run test:integration -- tests/integration/error-envelope.integration.test.ts -t "a handler that fails a real database write returns the 500 envelope without driver details"` | `real-db` | `createErrorApp`                        |
| BR   | BR-3 | Every failure is the envelope; unknown errors never leak internals       | unit        | `tests/errorHandler.test.ts::maps any other error to a generic 500 and logs the original`                                                          | `npm run test:unit -- tests/errorHandler.test.ts -t "maps any other error to a generic 500 and logs the original"`                                                                 | —         | `createErrorApp`                        |
| BR   | BR-3 | Unmatched route uses the envelope (scaffold assertion updated)           | contract    | `tests/contracts/health.contract.test.ts::returns the error schema with 404`                                                                       | `npm run test:unit -- tests/contracts/health.contract.test.ts -t "returns the error schema with 404"`                                                                              | —         | `createTestApp`, `expectMatchesSchema`  |
| BR   | BR-3 | Unmatched route envelope body is exact (scaffold assertion updated)      | unit        | `tests/app.test.ts::returns 404 JSON for unknown routes`                                                                                           | `npm run test:unit -- tests/app.test.ts -t "returns 404 JSON for unknown routes"`                                                                                                  | —         | —                                       |
| TS   | TS-4 | Failed add save yields a refusal the screen can roll back on             | contract    | `tests/contracts/error-envelope.contract.test.ts::ApiError with fields matches the envelope schema`                                                | `npm run test:unit -- tests/contracts/error-envelope.contract.test.ts -t "ApiError with fields matches the envelope schema"`                                                       | —         | `createErrorApp`                        |
| TS   | TS-5 | Weak-connection failure is treated as any other failed save              | integration | `tests/integration/error-envelope.integration.test.ts::a real server-selection failure returns the 503 envelope`                                   | `npm run test:integration -- tests/integration/error-envelope.integration.test.ts -t "a real server-selection failure returns the 503 envelope"`                                   | `real-db` | `createErrorApp`                        |
| TS   | TS-6 | Failed title edit yields a per-field refusal                             | unit        | `tests/parseBody.test.ts::joins nested paths with a dot`                                                                                           | `npm run test:unit -- tests/parseBody.test.ts -t "joins nested paths with a dot"`                                                                                                  | —         | —                                       |
| TS   | TS-7 | Failed deletion yields a refusal the screen can roll back on             | unit        | `tests/errorHandler.test.ts::writes an ApiError with its own status, code and message`                                                             | `npm run test:unit -- tests/errorHandler.test.ts -t "writes an ApiError with its own status, code and message"`                                                                    | —         | `createErrorApp`                        |

## Sources covered

Every source file this task changes, and the map rows that exercise it.

| Source                           | Covered by rows                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `src/lib/apiError.ts`            | AC-3 (contract), AC-4, AC-6, TS-4, TS-7 (ApiError status, code, message, fields) |
| `src/lib/parseBody.ts`           | AC-3 (unit), AC-5, TS-6                                                          |
| `src/middleware/errorHandler.ts` | AC-6, AC-8 (all rows), BR-3 (all rows), TS-5, TS-7                               |

## Run everything for this feature

```bash
npm run test:unit          # unit + contract
npm run test:integration   # in-memory Mongo
npm run test:coverage      # floor: lines/statements 79, branches 80, functions 87
```

## Mock data and fixtures

| Fixture                           | Lives                            | Gives you                                                                                                         |
| --------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `createErrorApp(handler, limit?)` | `tests/support/errorApp.ts`      | an Express app with real JSON parsing, the real error middleware and one POST `/api/boom` route running `handler` |
| `createTestApp`                   | `tests/support/createTestApp.ts` | the real app with an injectable DB-connected flag                                                                 |
| `expectMatchesSchema`             | `tests/support/contract.ts`      | zod schema assertion for response bodies                                                                          |

## Not automated

| ID                                                         | Scenario                                                | Why                                              | How to check by hand              |
| ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ | --------------------------------- |
| AC-1, AC-2, AC-7, BR-1, BR-2, TS-1, TS-2, TS-3, TS-8, TS-9 | Instant apply, background save, reload truth            | client behaviour, owned by the frontend sub-task | see the frontend unit's test map  |
| TS-10, TS-11                                               | Rapid sequence with one failure; close browser mid-save | no defined behaviour (OQ-PLAT-01)                | none until OQ-PLAT-01 is answered |
