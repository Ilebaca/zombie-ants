#!/usr/bin/env python3
"""Verify the generated APK and publish it beside the web game, never inside itself."""
import hashlib
import json
import os
import re
import urllib.request
import shutil
import sys
import subprocess
import zipfile
from pathlib import Path

source = Path("android/app/build/outputs/apk/debug/app-debug.apk")
if not source.is_file():
    raise RuntimeError("APK build did not produce app-debug.apk")
with zipfile.ZipFile(source) as archive:
    for name in ("AndroidManifest.xml", "classes.dex", "assets/public/index.html",
                 "assets/public/version.json", "assets/capacitor.config.json"):
        if name not in archive.namelist():
            raise RuntimeError("APK missing " + name)
    native = json.loads(archive.read("assets/capacitor.config.json"))
    if native["appId"] != "io.github.ilebaca.zombieants":
        raise RuntimeError("APK package mismatch")
    if native.get("server", {}).get("url"):
        raise RuntimeError("APK must bundle the game, not depend on a live server")
    build = json.loads(archive.read("assets/public/version.json"))["build"]

sdk = Path(os.environ["ANDROID_HOME"])
signer = sorted((sdk / "build-tools").glob("*/apksigner"))[-1]
verified = subprocess.run(
    [str(signer), "verify", "--verbose", "--print-certs", str(source)],
    check=True, text=True, capture_output=True,
)
print(verified.stdout)
certificates = set(re.findall(r"certificate SHA-256 digest:\s*([a-fA-F0-9]{64})", verified.stdout))
if len(certificates) != 1:
    raise RuntimeError("APK must have one verified signing identity")
certificate = certificates.pop().lower()
# An APK signed with another key cannot update the installed app without losing its save.
# The first delivered APK predates fingerprint metadata; pin that known public
# certificate during migration as well as checking every later published manifest.
url = "https://ilebaca.github.io/zombie-ants/downloads/zombie-ants.json?previous=" + build.split(" ")[0]
request = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
with urllib.request.urlopen(request, timeout=30) as response:
    previous = json.load(response)
old_certificate = previous.get("certificateSha256") or \
    "ae4360e1752501295f71b2f8f940b68a3ee3ce721838199d940f30eff0164c41"
if old_certificate and old_certificate != certificate:
    if "--retain-published" not in sys.argv:
        raise RuntimeError("Signing certificate changed: refusing to publish an incompatible APK update")
    # A web release must not replace the download with an incompatible APK.
    # Keep the previous, verified download and its exact metadata until signing is recovered.
    if (previous.get("package") != "io.github.ilebaca.zombieants"
            or not re.fullmatch(r"[a-f0-9]{64}", previous.get("sha256", ""))):
        raise RuntimeError("Cannot retain an unverified published APK")
    apk_url = "https://ilebaca.github.io/zombie-ants/downloads/zombie-ants.apk?retain=" + previous["sha256"]
    with urllib.request.urlopen(apk_url, timeout=60) as response:
        published_apk = response.read(64 * 1024 * 1024 + 1)
    if len(published_apk) > 64 * 1024 * 1024 or hashlib.sha256(published_apk).hexdigest() != previous["sha256"]:
        raise RuntimeError("Published APK checksum mismatch")
    folder = Path("dist/downloads")
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "zombie-ants.apk").write_bytes(published_apk)
    (folder / "zombie-ants.apk.sha256").write_text(previous["sha256"] + "  zombie-ants.apk\n")
    (folder / "zombie-ants.json").write_text(json.dumps(previous, indent=2) + "\n")
    print("::warning::The original APK signing key is unavailable. Retained the previous APK; native updates are blocked until signing migration.")
    raise SystemExit(0)


folder = Path("dist/downloads")
folder.mkdir(parents=True, exist_ok=True)
target = folder / "zombie-ants.apk"
shutil.copyfile(source, target)
digest = hashlib.sha256(target.read_bytes()).hexdigest()
(target.with_suffix(".apk.sha256")).write_text(digest + "  zombie-ants.apk\n")
metadata = dict(build=build, versionCode=int(os.environ["GITHUB_RUN_NUMBER"]),
                certificateSha256=certificate, package="io.github.ilebaca.zombieants", variant="debug",
                minAndroid="7.0", bytes=target.stat().st_size, sha256=digest)
(folder / "zombie-ants.json").write_text(json.dumps(metadata, indent=2) + "\n")
print(json.dumps(metadata, indent=2))
