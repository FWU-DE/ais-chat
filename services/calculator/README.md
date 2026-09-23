# Calculator arithmetic service

A libqalculate HTTP service used by the chatbot as a calculator tool.

- `GET /healthz` returns `{"status":"success","result":"ok"}`.
- `POST /v1/calculate` accepts `Content-Type: application/json` and a body such as
  `{"expression":"2 + 2"}`. Successful responses contain `status: "success"` and the calculated string in `result`.
- Requests are limited to an 8 KiB body, a 4096-character expression, 16 KiB worker output, and
  a 2-second worker wall time. The pool runs up to 4 workers concurrently and queues up to 32
  additional requests in FIFO order. Invalid requests return structured HTTP 400 JSON; a full
  worker pool returns HTTP 429.
