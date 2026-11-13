# API upload and cloud-credential safety boundaries

The image extraction API validates coordinates, palette count and width before storing uploaded media. Image and mask uploads have a 20 MB stream limit each, but the extension check alone does **not** prove that image content is safe to decode.

The in-process pipeline fallback previously overwrote a shared Celery task's progress-reporting callback while multiple threads could run. Fallback jobs are now serialized around that callback. This is a containment measure, **not** a replacement for a durable, independently isolated worker queue.

## Credentials

The `POST /api/v1/designs/cloud-ai/configure` endpoint previously accepted arbitrary provider keys from unauthenticated callers and mutated server environment variables. It now returns 403 by default. Set credentials in the process's secure server environment instead. The explicit `ALLOW_UNSAFE_RUNTIME_CREDENTIAL_CONFIG=1` override is only for isolated, trusted local experiments and **must never be enabled on a public deployment**. Remove the endpoint entirely when replacing it with a managed secrets workflow.

## Still required before public SaaS release

- Authentication, authorization, job ownership and private per-tenant file storage.
- Strict image signature and pixel/decompression bounds, worker limits, cleanup and retention.
- Durable job state, queue retries, cancellation, process isolation, and cancellation cleanup.
- Rate limiting and provider budget controls.
- Remove public unauthenticated access to exported files and AI responses.
- Verify high-fidelity restoration, repeat alignment, indexed eight-bit output and factory-controller compatibility with approved sample sets.

A green CI build is not evidence of pixel-accurate reconstruction or loom-ready hardware validation.
