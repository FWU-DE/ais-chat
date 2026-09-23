### Adding chat tools

Chat tools are defined in `apps/chat-bot/src/app/api/chat/tools/` and registered in
`apps/chat-bot/src/app/api/chat/build-tools.ts`. To add a tool:

1. Create a tool builder that returns a `ToolRegistration` with its `definition` and `handler`.
2. Register the builder in `buildTools` under the tool definition name.
3. Add an `activity` descriptor when the tool should appear in the AI Activity panel and stream.
   The descriptor must create an `AiActivityToolStep` from the tool call. Add `applyResult` when
   the tool result contributes display data such as links or a calculated value.
4. Add the tool name to `AI_ACTIVITY_TOOL_NAMES` in
   `apps/chat-bot/src/types/ai-activity.ts` so the persisted and streamed activity step passes
   schema validation.
5. Add the corresponding icon and translation key in
   `apps/chat-bot/src/components/chat/activity/ai-activity.tsx` and the AI Activity messages.

Tools without an `activity` descriptor still run normally, but their calls are omitted from AI
Activity. Activity descriptors should return small, user-facing values only; do not send complete
tool results to the client.
