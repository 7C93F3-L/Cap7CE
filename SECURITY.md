# Security Policy

## Supported versions

Cap7CE is currently Preview software. Security fixes are provided on a best-effort basis for the latest published Preview release and the current `main` branch only.

| Version | Supported |
| --- | --- |
| Latest Preview | Yes |
| Older Preview releases | No |
| Unreleased local modifications | No |

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public Issue.

Use the repository's **Security** tab and select **Report a vulnerability** to create a private GitHub Security Advisory. If private vulnerability reporting is temporarily unavailable, open a public Issue containing only a request for a private reporting channel—do not include exploit details.

Include:

- The affected Cap7CE version or commit.
- Windows version and relevant hardware/runtime information.
- A minimal reproduction.
- Expected and observed behavior.
- Security impact and realistic attack conditions.
- Sanitized logs, screenshots, or sample files when necessary.

Remove personal file paths, local file contents, model data, credentials, tokens, and other private information before submitting a report.

Reports will be acknowledged and investigated on a best-effort basis. No fixed response or remediation deadline is currently guaranteed.

## Security boundaries

- Cap7CE reads only directories explicitly added by the user.
- File deletion uses the Windows Recycle Bin and is limited to supported files inside configured directories.
- The Renderer does not receive direct Node.js or unrestricted file-system access; privileged operations cross the preload/IPC boundary.
- The managed `llama-server` listens on `127.0.0.1`, not on an external network interface.
- Models and `llama.cpp` builds are supplied by the user and remain outside the Cap7CE repository and release package.

Only download runtimes and models from official or otherwise trusted sources. Their security, licenses, and model behavior are outside the Cap7CE project's control.
