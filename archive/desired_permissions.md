# Action-Level Read / Write Matrix

This section answers the practical questions: who can create, edit, delete, and manage work owned by other users. Where the current MVP does not fully enforce the intended behavior yet, that is called out explicitly.

| ACTION                                            | SYSTEM_ADMIN | WORKSPACE_ADMIN               | BOARD_ADMIN                | MEMBER                    | OBSERVER                  | GUEST |
| ------------------------------------------------- | ------------ | ----------------------------- | -------------------------- | ------------------------- | ------------------------- | ----- |
| View all workspaces and boards                    | Yes          | Only assigned workspace scope | Only assigned board scope  | Only assigned board scope | Only assigned board scope |       |
| Create users / reset passwords / manage memberships | Yes        | No                            | No                         | No                        | No                        |       |
| Create workspace                                  | Yes          | No                            | No                         | No                        | No                        |       |
| Edit workspace settings                           | Yes          | Assigned workspace            | No                         | No                        | No                        |       |
| Delete workspace                                  | Yes          | Assigned workspace            | No                         | No                        | No                        |       |
| Create board                                      | Yes          | In assigned workspace         | No                         | No                        | No                        |       |
| Edit board settings                               | Yes          | In assigned workspace         | Assigned board             | No                        | No                        |       |
| Delete board                                      | Yes          | Yes                           | Yes                        | No                        | No                        |       |
| Create cards and lists                            | Yes          | Yes                           | Yes                        | Yes                       | No                        |       |
| Edit cards, comments, checklists, attachments     | Yes          | Yes                           | Yes                        | Yes                       | No                        |       |
| Delete cards                                      | Yes          | Yes                           | Yes                        | No                        | No                        |       |
| Edit another user's card                          | Yes          | Yes                           | Yes                        | No                        | No                        |       |
