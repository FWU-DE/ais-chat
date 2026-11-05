# Popularity

## Definition

Popularity of assistants, characters and learning scenarios is the number of usage-tracking rows
within `USAGE_WINDOW_DAYS` (`packages/shared/src/db/functions/popularity.ts`). Each row is one model
or tool call, so user, assistant and tool activity all count. It is identical for teacher chats and shared chats, global across all users, and only used
for ordering. 0 means no usage.

| Entity type        | Sources                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `assistant`        | `conversation_usage_tracking` joined to `conversation.assistant_id`                                                         |
| `character`        | `conversation_usage_tracking` joined to `conversation.character_id`, plus `shared_character_chat_usage_tracking`            |
| `learningScenario` | `conversation_usage_tracking` joined to `conversation.learning_scenario_id`, plus `shared_learning_scenario_usage_tracking` |

Counts of several sources add up. Soft-deleted conversations still count. Usage of template copies
does not add to the original.

## Storage and refresh

The value is stored in the `popularity` column of the three entity tables, not computed per request,
because computing it live takes tens of seconds on production data. `refreshEntityPopularity()`
counts the usage and writes only the rows whose value changed, without touching `updated_at`.
Entities that dropped out of the window are reset to 0. Soft-deleted entities are not updated.

Code that writes to these tables must not set `popularity`, and copies of an entity start at 0. Any new bulk update must keep
`updated_at`, otherwise the "newest first" order breaks.

## Scheduling

The application schedules nothing itself. The scheduled jobs must be triggered externally:

- cleanup via `DELETE /api/v1/admin/delete-conversation` and `DELETE /api/v1/admin/cleanup`
- popularity refresh via `POST /api/v1/admin/refresh-popularity`

All routes are protected by the API key.
