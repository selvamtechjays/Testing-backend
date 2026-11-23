---
doc_type: endpoint-index
schema_version: 1.1
produced_by: tl
status: Emerging
generated_at: 2026-11-20
---

# Endpoint Index

Endpoints: 12

| Endpoint ID | Method + Path           | Domain | Called by    | Reads/Writes Entities                | Used by Features                                   | File                                         |
| ----------- | ----------------------- | ------ | ------------ | ------------------------------------ | -------------------------------------------------- | -------------------------------------------- |
| EP-AUTH-01  | POST /api/auth/register | Auth   | PAGE-AUTH-01 | ENT-AUTH-01, ENT-AUTH-02             | FEAT-AUTH-01                                       | ./domains/auth/endpoints/register.md         |
| EP-AUTH-02  | POST /api/auth/login    | Auth   | PAGE-AUTH-02 | ENT-AUTH-01, ENT-AUTH-02             | FEAT-AUTH-02                                       | ./domains/auth/endpoints/login.md            |
| EP-AUTH-03  | POST /api/auth/logout   | Auth   | PAGE-TASK-01 | ENT-AUTH-02                          | FEAT-AUTH-02                                       | ./domains/auth/endpoints/logout.md           |
| EP-AUTH-04  | GET /api/auth/me        | Auth   | PAGE-TASK-01 | ENT-AUTH-01, ENT-AUTH-02             | FEAT-AUTH-02                                       | ./domains/auth/endpoints/get-current-user.md |
| EP-TASK-01  | GET /api/tasks          | Task   | PAGE-TASK-01 | ENT-TASK-01, ENT-TAG-01, ENT-AUTH-02 | FEAT-TASK-01, FEAT-TAG-03, FEAT-TAG-04             | ./domains/task/endpoints/list-tasks.md       |
| EP-TASK-02  | POST /api/tasks         | Task   | PAGE-TASK-01 | ENT-TASK-01, ENT-TAG-01, ENT-AUTH-02 | FEAT-TASK-01, FEAT-PLAT-01, FEAT-TAG-03            | ./domains/task/endpoints/create-task.md      |
| EP-TASK-03  | PATCH /api/tasks/:id    | Task   | PAGE-TASK-01 | ENT-TASK-01, ENT-TAG-01, ENT-AUTH-02 | FEAT-TASK-02, FEAT-PLAT-01, FEAT-TAG-03            | ./domains/task/endpoints/update-task.md      |
| EP-TASK-04  | DELETE /api/tasks/:id   | Task   | PAGE-TASK-01 | ENT-TASK-01, ENT-AUTH-02             | FEAT-TASK-03, FEAT-PLAT-01, FEAT-TAG-03            | ./domains/task/endpoints/delete-task.md      |
| EP-TAG-01   | GET /api/tags           | Tag    | PAGE-TASK-01 | ENT-TAG-01, ENT-TASK-01, ENT-AUTH-02 | FEAT-TAG-01, FEAT-TAG-02, FEAT-TAG-03, FEAT-TAG-04 | ./domains/tag/endpoints/list-tags.md         |
| EP-TAG-02   | POST /api/tags          | Tag    | PAGE-TASK-01 | ENT-TAG-01, ENT-AUTH-02              | FEAT-TAG-01, FEAT-TAG-03                           | ./domains/tag/endpoints/create-tag.md        |
| EP-TAG-03   | PATCH /api/tags/:id     | Tag    | PAGE-TASK-01 | ENT-TAG-01, ENT-TASK-01, ENT-AUTH-02 | FEAT-TAG-02                                        | ./domains/tag/endpoints/update-tag.md        |
| EP-TAG-04   | DELETE /api/tags/:id    | Tag    | PAGE-TASK-01 | ENT-TAG-01, ENT-TASK-01, ENT-AUTH-02 | FEAT-TAG-02                                        | ./domains/tag/endpoints/delete-tag.md        |
