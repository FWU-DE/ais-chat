### Adding chat tools

Chat tools are defined in `apps/chat-bot/src/app/api/chat/tools/` and registered in
`apps/chat-bot/src/app/api/chat/build-tools.ts`. To add a tool:

1. Create a tool builder that returns a `ToolRegistration` with its `definition` and `handler`.
2. Register the builder in `buildTools` under the tool definition name.
3. Add an `activity` descriptor when the tool should appear in the AI Activity panel and stream.
   `createStep` builds the step from the call's arguments, `applyResult` adds the values to display
   from the tool result.
4. Add the tool name to `AI_ACTIVITY_TOOL_NAMES` in
   `apps/chat-bot/src/types/ai-activity.ts` so the persisted and streamed activity step passes
   schema validation.
5. Add the corresponding icon and translation key in
   `apps/chat-bot/src/components/chat/activity/ai-activity.tsx` and the AI Activity messages.

Tools without an `activity` descriptor still run normally, but their calls are omitted from AI
Activity. `createStep` only uses the call's arguments as the model sent them; anything the tool
computes or decides comes from the result via `applyResult`, so add a field to the tool result if
the step needs one. Send only what the frontend displays, never the complete tool result.

Tool arguments and results are persisted and never migrated: keep old shapes parseable (transform
them in `parsePersistedResult`, keep `createStep` tolerant of old arguments). See
[ai-activity.md](ai-activity.md) for the data flow and the rules.
