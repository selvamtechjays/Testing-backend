---
doc_type: endpoint-index
schema_version: 1.1
produced_by: tl
status: Emerging
generated_at: 2026-11-06
---

# Endpoint Index

Endpoints: 8

| Endpoint ID | Method + Path           | Domain | Called by    | Reads/Writes Entities    | Used by Features           | File                                         |
| ----------- | ----------------------- | ------ | ------------ | ------------------------ | -------------------------- | -------------------------------------------- |
| EP-AUTH-01  | POST /api/auth/register | Auth   | PAGE-AUTH-01 | ENT-AUTH-01, ENT-AUTH-02 | FEAT-AUTH-01               | ./domains/auth/endpoints/register.md         |
| EP-AUTH-02  | POST /api/auth/login    | Auth   | PAGE-AUTH-02 | ENT-AUTH-01, ENT-AUTH-02 | FEAT-AUTH-02               | ./domains/auth/endpoints/login.md            |
| EP-AUTH-03  | POST /api/auth/logout   | Auth   | PAGE-TASK-01 | ENT-AUTH-02              | FEAT-AUTH-02               | ./domains/auth/endpoints/logout.md           |
| EP-AUTH-04  | GET /api/auth/me        | Auth   | PAGE-TASK-01 | ENT-AUTH-01, ENT-AUTH-02 | FEAT-AUTH-02               | ./domains/auth/endpoints/get-current-user.md |
| EP-TASK-01  | GET /api/tasks          | Task   | PAGE-TASK-01 | ENT-TASK-01, ENT-AUTH-02 | FEAT-TASK-01               | ./domains/task/endpoints/list-tasks.md       |
| EP-TASK-02  | POST /api/tasks         | Task   | PAGE-TASK-01 | ENT-TASK-01, ENT-AUTH-02 | FEAT-TASK-01, FEAT-PLAT-01 | ./domains/task/endpoints/create-task.md      |
| EP-TASK-03  | PATCH /api/tasks/:id    | Task   | PAGE-TASK-01 | ENT-TASK-01, ENT-AUTH-02 | FEAT-TASK-02, FEAT-PLAT-01 | ./domains/task/endpoints/update-task.md      |
| EP-TASK-04  | DELETE /api/tasks/:id   | Task   | PAGE-TASK-01 | ENT-TASK-01, ENT-AUTH-02 | FEAT-TASK-03, FEAT-PLAT-01 | ./domains/task/endpoints/delete-task.md      |
