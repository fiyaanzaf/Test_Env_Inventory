import os
import json

SCAN_DIR = r"c:\inventory_apk"
COMPROMISED = ["1.14.1", "0.30.4"]
OUTPUT_FILE = r"c:\inventory_apk\scan_result.txt"

lines = []
lines.append("=" * 50)
lines.append("  AXIOS SECURITY SCAN")
lines.append("=" * 50)
lines.append(f"Scanning: {SCAN_DIR}")
lines.append(f"Looking for compromised versions: {COMPROMISED}")
lines.append("")

danger_found = False

for root, dirs, files in os.walk(SCAN_DIR):
    for fname in files:
        if fname not in ["package.json", "package-lock.json"]:
            continue

        filepath = os.path.join(root, fname)

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except:
            continue

        # Check direct dependencies
        for dep_key in ["dependencies", "devDependencies"]:
            deps = data.get(dep_key, {})
            if "axios" in deps:
                ver = deps["axios"]
                clean_ver = ver.lstrip("^~>=<")
                lines.append(f"[CHECKING] {filepath}")
                lines.append(f"  axios version declared: {ver}")
                if clean_ver in COMPROMISED:
                    lines.append(f"  *** [DANGER] COMPROMISED VERSION {clean_ver} ***")
                    danger_found = True
                else:
                    lines.append(f"  [OK] Safe version")
                lines.append("")

        # Check lockfile resolved versions
        packages = data.get("packages", {})
        for pkg_path, pkg_info in packages.items():
            if "axios" in pkg_path and "node_modules/axios" in pkg_path:
                resolved_ver = pkg_info.get("version", "unknown")
                lines.append(f"[CHECKING] {filepath}")
                lines.append(f"  axios INSTALLED version: {resolved_ver}")
                if resolved_ver in COMPROMISED:
                    lines.append(f"  *** [DANGER] COMPROMISED VERSION {resolved_ver} INSTALLED! ***")
                    danger_found = True
                else:
                    lines.append(f"  [OK] Safe version")
                lines.append("")

        # Also check name field (for node_modules/axios/package.json)
        if data.get("name") == "axios":
            actual_ver = data.get("version", "unknown")
            lines.append(f"[CHECKING] {filepath}")
            lines.append(f"  axios ACTUAL installed version: {actual_ver}")
            if actual_ver in COMPROMISED:
                lines.append(f"  *** [DANGER] COMPROMISED VERSION {actual_ver} INSTALLED! ***")
                danger_found = True
            else:
                lines.append(f"  [OK] Safe version")
            lines.append("")

lines.append("=" * 50)
if danger_found:
    lines.append("[ACTION REQUIRED] Compromised axios versions detected!")
    lines.append("Run 'npm audit fix' in affected folders immediately.")
else:
    lines.append("[SAFE] No compromised axios versions (1.14.1 or 0.30.4) found!")
    lines.append("Your axios installations are clean.")
lines.append("=" * 50)

result = "\n".join(lines)
print(result)

with open(OUTPUT_FILE, "w") as f:
    f.write(result)

print(f"\nReport saved to: {OUTPUT_FILE}")
