# Snyk connector troubleshooting

The Snyk Security connector is the Claude extension `ant.dir.gh.snyk.studio-mcp`. Everything below was verified on macOS against the extension as of 2026-07; re-verify paths if the extension has since been updated.

## Authentication failures (`SNYK-0005`, "User not authenticated")

**Root cause to check first: the connector's "Snyk API Token" field.** The manifest calls the field optional and suggests interactive `snyk_auth`, but it maps `"SNYK_TOKEN": "${user_config.snyk_token}"` and the substitution never degrades to "unset":

- Field left blank → the CLI receives the leftover marker `__encrypted__:`
- `snyk_token` key deleted from the settings JSON → the CLI receives the literal 25-char string `${user_config.snyk_token}`

Both are non-empty garbage tokens, so every scan fails auth. The fix is to put a **real Snyk token** in the field (Settings → Extensions → Snyk Security). Some orgs issue PATs only, not legacy 36-char UUID API tokens — PATs work fine here.

**Misleading symptom:** `snyk_auth` reports "Successfully logged in" while scans still say "User not authenticated". The two code paths disagree about whether an empty token counts as set — never treat `snyk_auth` success as proof that scans will work. A successful *scan* is the only real auth test.

## After changing connector settings

MCP servers read environment variables **only at process start**. After editing the token or any connector setting, fully quit and restart the Claude app — stale server processes linger and keep the old value. If scans still fail after a settings change, an un-restarted server is the first suspect.

## Settings file (read-only diagnosis)

Settings live at `~/Library/Application Support/Claude/Claude Extensions Settings/ant.dir.gh.snyk.studio-mcp.json`.

- Don't edit it while the app is running — the app overwrites it from memory.
- Sensitive fields are stored encrypted (`__encrypted__:<payload>`). Never extract that value and test it as a credential: it's ciphertext, and a rejection proves nothing about the real token.

## Untrusted folder errors

A first scan of a folder fails until `snyk_trust` has been run on that folder's absolute path. Run it once and retry the scan.

## Fallback: the standalone Snyk CLI

A separately installed `snyk` CLI on PATH is authenticated via OAuth (token store: `INTERNAL_OAUTH_TOKEN_STORAGE` in `~/.config/configstore/snyk.json`) and keeps working even when the connector is broken. If the connector can't be fixed in-session (e.g. it needs an app restart the user must perform), run the equivalent scan through Bash and note the workaround in the report:

```bash
snyk code test /abs/path --json
snyk test /abs/path --json          # SCA
snyk iac test /abs/path --json
```

The JSON shape differs slightly from the MCP tools' output, but severity/CWE/file/line triage works the same way.
