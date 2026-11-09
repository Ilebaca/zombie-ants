# Publishing live announcements and updates

## Player inbox
Edit `public/live/mail.json` on main. The inbox reads this public file directly from
GitHub, independently of Pages and the APK. Mail-only changes do not trigger a game
release or an installation prompt. GitHub's CDN may take a few minutes to refresh.
Each message needs an immutable ID, title, plain-text body, and an ISO UTC sentAt.
Use a new ID for a new announcement. Leave messages in the list while they should
remain in players' inboxes. Optional expiresAt hides an expired announcement.

Example (do not publish this sample as a real message):
```json
{
  "schema": 1,
  "messages": [{
    "id": "maintenance-2026-11-15",
    "title": "Scheduled maintenance",
    "body": "The game will be unavailable from 10:00 to 10:30 UTC.\n\nThank you for your patience.",
    "sentAt": "2026-11-14T12:00:00Z",
    "expiresAt": "2026-11-16T00:00:00Z"
  }]
}
```

This is a public broadcast feed, not private mail. Never include email addresses,
player codes, personal information, private targeting, secret promotions, or gift
credentials in it. Future-dated content is already publicly downloadable; dates
only control its display. Read state is saved independently for each local colony.
A true account mailbox and reward claims need a backend with server authorisation.

## Updates
The app checks when launched and resumed, throttled to once per minute, with a
five-second network deadline. It never interrupts a match, tutorial or existing popup.
Updates appear over Home and can be postponed. Offline play remains available.

The Android manifest `downloads/zombie-ants.json` is generated only after build,
lint and signature verification, and includes the integer Android versionCode.
An installed APK compares that number with App.getInfo().build. Same/older builds
do not trigger a notification. Update opens the trusted APK download; Android
still asks the player to approve installation. It does not silently install code.
The APK publisher pins the prior published signing certificate and refuses to
advertise an incompatible replacement key. The signing key must be kept securely
and permanently before production; the current cached debug key is for testing.

The web update button reloads the latest build with a fresh URL. Update and mail
requests bypass service-worker caches; inbox content has its own offline cache.
Existing APKs without this feature must be updated manually once.

## Production services still required
Google Play distribution needs release signing and a configured Play Console
listing/update channel. Real email needs a verified sender domain/provider,
consented private email records and unsubscribe handling on a backend.
Background push needs FCM/APNs registration and a backend. None of those services
is provisioned by this GitHub-only broadcast implementation.

## Existing test APK signing incident
The first APK (f050669) used certificate
`ae4360e1752501295f71b2f8f940b68a3ee3ce721838199d940f30eff0164c41`.
Its Actions job logged "Path Validation Error" for the keystore cache; no key was saved.
Android/AGP can use XDG_CONFIG_HOME instead of ~/.android. The build now sets an
explicit ANDROID_USER_HOME matching the cache path.

The first APK cannot be updated in place without its original private key. The APK
does not contain that key and none of the retained artifacts contains a key backup.
The publisher refuses an incompatible replacement. During web releases, the explicit
`--retain-published` option copies the existing APK only after verifying its SHA-256
and preserves its exact metadata; it never advertises the rejected new APK.

Before native rollout, establish permanent private signing storage, then agree a
one-time pre-release migration with save backup/restore (or a separate package).
Never ask players to uninstall without a verified backup. Do not describe this test
channel as production-ready or disable the certificate guard.
