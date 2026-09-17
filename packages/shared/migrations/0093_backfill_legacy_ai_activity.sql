WITH legacy_activity AS (
	SELECT
		conversation_message.id,
		json_build_array(
			json_build_object('kind', 'analysis'),
			json_build_object(
				'kind', 'tool',
				'id', 'legacy-web-search-' || conversation_message.id,
				'tool', 'web_search',
				'links', json_agg(
					json_build_object(
						'title', COALESCE(NULLIF(BTRIM(result->>'name'), ''), BTRIM(result->>'url')),
						'url', BTRIM(result->>'url')
					)
					ORDER BY result_index
				)
			),
			json_build_object('kind', 'done')
		) AS activity
	FROM conversation_message
	CROSS JOIN LATERAL json_array_elements(
		CASE
			WHEN json_typeof(conversation_message.web_search_results) = 'array'
				THEN conversation_message.web_search_results
			ELSE '[]'::json
		END
	)
		WITH ORDINALITY AS result(result, result_index)
	WHERE conversation_message.role = 'assistant'
		AND (conversation_message.ai_activity IS NULL
			OR (
				json_typeof(conversation_message.ai_activity) = 'array'
				AND json_array_length(conversation_message.ai_activity) = 0
			))
		AND json_typeof(conversation_message.web_search_results) = 'array'
		AND BTRIM(result->>'url') ~ '^https?://[^[:space:]]+$'
	GROUP BY conversation_message.id
)
UPDATE conversation_message
SET ai_activity = legacy_activity.activity
FROM legacy_activity
WHERE conversation_message.id = legacy_activity.id;