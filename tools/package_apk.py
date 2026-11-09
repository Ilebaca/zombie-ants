#!/usr/bin/env python3
"""Verify the generated APK and publish it beside the web game, never inside itself."""
import hashlib
import json
import os
import re
import urllib.request
import shutil
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
match = re.search(r"Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9]{64})", verified.stdout)
if not match:
    raise RuntimeError("APK signing certificate missing")
certificate = match.group(1).lower()
# An APK signed with another key cannot update the installed app without losing its save.
# Pin the development certificate after the first manifest carrying this field.
url = "https://ilebaca.github.io/zombie-ants/downloads/zombie-ants.json?previous=" + build.split(" ")[0]
request = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
with urllib.request.urlopen(request, timeout=30) as response:
    previous = json.load(response)
old_certificate = previous.get("certificateSha256")
if old_certificate and old_certificate != certificate:
    raise RuntimeError("Signing certificate changed: refusing to publish an incompatible APK update")


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
