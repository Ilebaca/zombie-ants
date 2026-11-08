# Maintenance review — November 2026

## Scope and method

Repository-wide inventory and static scans covered 265 maintained text files across game
rules, AI, renderer, platform services, UI, tools, tests and configuration. The archived
single-file build was checked separately. Manual review focused on replay consistency,
account lookup, reward claims, storage ordering, rendering lifecycle and typography.

This review does not prove the absence of every bug. It preserves combat formulas,
economy values, save keys, product IDs, asset filenames and gameplay identifiers.
Renaming persistent identifiers requires a separate migration.

## Corrections

| Area | Issue | Change |
| --- | --- | --- |
| Replays | Combat defaulted to neutral modifiers even when research/traits were supplied. | Derive the default combat context from those modifiers. |
| Rendering | Reset retained the previous options, including faction identities and ground. | Replace options along with state. |
| Accounts | Input was uppercased but compared with a lowercase account ID. | Normalize both sides. |
| Road claims | Alternate numeric spellings were separate claim keys for the same checkpoint. | Accept canonical positive integer keys only. |
| Native saves | Independent bridge writes could complete in the wrong order. | Serialize writes and removals while retaining immediate memory reads. |
| Typography | Canvas setters used unresolved CSS variables. | Share resolved font strings using the display face's real weight. |
| Documentation | Setup described an early prototype and instructed a force push. | Replace it with current development and validation steps. |
| Naming | The project guide and references used an assistant-specific filename. | Use `PROJECT_GUIDE.md` consistently. |

## Typography

Nunito remains the reading and form face. Poetsen is the display face for headings,
prominent figures and board labels; it uses weight 400 rather than synthetic bold.
Backup codes retain monospace. Standalone legal documents and the emergency crash panel
retain system fonts so they remain readable without the game's font assets.

## Verification

Focused regression cases cover modifier-aware combat, account-ID sign-in, duplicate
checkpoint aliases, slow/failed native writes, renderer resets and resolved canvas fonts.
The deployment workflow runs strict type checking, lint, the full regression suite and
the production build before publishing. Browser checks cover navigation, typography and
layout. Real Android system-bar gestures still require device validation.

## Remaining boundaries

Web purchases and social services remain local demos, as documented in the README.
The archived build remains a compatibility reference. Its CSS parity contract is preserved.
Git history and historical branch names are not rewritten.
