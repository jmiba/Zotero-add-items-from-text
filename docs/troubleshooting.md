# Troubleshooting

## No references extracted

Try pasting only the references without surrounding prose. One reference per line improves results.

## Provider errors or timeouts

Check your API key, base URL, and model name. For Ollama, confirm the server is running and the model is pulled locally.

## Index validation is slow or failing

Disable index validation to confirm the issue. Some sources may rate-limit requests; adding a `mailto` can help.

## Fields look overwritten

High-confidence matches can overwrite fields to align with authoritative records. Review the preview and adjust source priorities if needed.

## Missing Library of Congress results

The `loc.gov` JSON API focuses on digitized and online content and may miss print-only books.
