#!/usr/bin/env python3
"""Apply our small native-host configuration to Capacitor's generated Android project."""
import json
import os
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image

ANDROID = "http://schemas.android.com/apk/res/android"
ET.register_namespace("android", ANDROID)
root = Path("android/app/src/main")
manifest = root / "AndroidManifest.xml"
tree = ET.parse(manifest)
activity = tree.find("./application/activity")
if activity is None:
    raise RuntimeError("Generated Android activity missing")
activity.set(f"{{{ANDROID}}}screenOrientation", "portrait")
activity.set(f"{{{ANDROID}}}windowSoftInputMode", "adjustNothing")
tree.write(manifest, encoding="utf-8", xml_declaration=True)

target = root / "java/io/github/ilebaca/zombieants/MainActivity.java"
target.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile("tools/android/MainActivity.java", target)
version = json.loads(Path("dist/version.json").read_text())["build"].split(" ")[0]
gradle = Path("android/app/build.gradle")
text = gradle.read_text()
text = re.sub(r"versionCode\s+\d+", "versionCode " + str(int(os.environ.get("GITHUB_RUN_NUMBER", "1"))), text)
text = re.sub(r'versionName\s+"[^"]+"', 'versionName "2.0.0-' + version + '"', text)
gradle.write_text(text)

# The app's artwork, including proper padding for Android's adaptive mask.
for density, icon_size, foreground_size in [
    ("mdpi", 48, 108), ("hdpi", 72, 162), ("xhdpi", 96, 216),
    ("xxhdpi", 144, 324), ("xxxhdpi", 192, 432),
]:
    folder = root / ("res/mipmap-" + density)
    folder.mkdir(parents=True, exist_ok=True)
    with Image.open("public/icon-512.png") as image:
        icon = image.convert("RGBA").resize((icon_size, icon_size), Image.Resampling.LANCZOS)
        for name in ("ic_launcher.png", "ic_launcher_round.png"):
            icon.save(folder / name, optimize=True)
    with Image.open("public/icon-maskable-512.png") as image:
        image.convert("RGBA").resize((foreground_size, foreground_size),
                                     Image.Resampling.LANCZOS).save(folder / "ic_launcher_foreground.png", optimize=True)

# Replace the template's native branding before the HTML splash takes over.
styles_path = root / "res/values/styles.xml"
styles = ET.parse(styles_path)
for name in ("AppTheme.NoActionBar", "AppTheme.NoActionBarLaunch"):
    style = styles.find(f"./style[@name='{name}']")
    if style is None:
        raise RuntimeError("Missing native theme " + name)
    if name.endswith("Launch"):
        for item in list(style):
            style.remove(item)
        values = {
            "android:background": "#1c1e25",
            "windowSplashScreenBackground": "#1c1e25",
            "windowSplashScreenAnimatedIcon": "@mipmap/ic_launcher",
            "postSplashScreenTheme": "@style/AppTheme.NoActionBar",
        }
    else:
        values = {"android:windowBackground": "#1c1e25"}
    for key, value in values.items():
        ET.SubElement(style, "item", name=key).text = value
styles.write(styles_path, encoding="utf-8", xml_declaration=True)
for path in (root / "res").glob("drawable*/splash.png"):
    path.unlink()
colours = root / "res/values/ic_launcher_background.xml"
if colours.exists():
    colours.write_text('<resources><color name="ic_launcher_background">#1c1e25</color></resources>\n')
