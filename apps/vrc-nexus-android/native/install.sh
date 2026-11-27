#!/bin/sh
# Kopiert die nativen Teile (Homescreen-Widget, MainActivity mit Plugin) in das von „npx cap add android“ erzeugte Projekt.
set -e
cd "$(dirname "$0")/.."
SRC=android/app/src/main
cp native/java/de/ghostnode/vrcnexus/*.java "$SRC/java/de/ghostnode/vrcnexus/"
cp -r native/res/* "$SRC/res/"
grep -q 'NexusWidget' "$SRC/AndroidManifest.xml" || sed -i 's#</application>#    <receiver android:name=".NexusWidget" android:exported="true" android:label="@string/nexus_w_friends">\n            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>\n            <meta-data android:name="android.appwidget.provider" android:resource="@xml/nexus_widget_info" />\n        </receiver>\n    </application>#' "$SRC/AndroidManifest.xml"
# 7.0.1: weitere Widgets (Puls & PC, Nächste Events, Benachrichtigungen, Schnellzugriff & Panik)
for W in PulseWidget:nexus_widget_pulse_info:nexus_w_pulse EventWidget:nexus_widget_events_info:nexus_w_events NotifWidget:nexus_widget_notifs_info:nexus_w_notifs QuickWidget:nexus_widget_quick_info:nexus_w_quick; do
    C=${W%%:*}; R=${W#*:}; I=${R%%:*}; L=${R#*:}
    grep -q "\.$C\"" "$SRC/AndroidManifest.xml" || sed -i "s#</application>#    <receiver android:name=\".$C\" android:exported=\"true\" android:label=\"@string/$L\">\n            <intent-filter><action android:name=\"android.appwidget.action.APPWIDGET_UPDATE\" /></intent-filter>\n            <meta-data android:name=\"android.appwidget.provider\" android:resource=\"@xml/$I\" />\n        </receiver>\n    </application>#" "$SRC/AndroidManifest.xml"
done
# 7.3.3: Einstellungen je Widget (Activity mit APPWIDGET_CONFIGURE)
grep -q 'WidgetConfigActivity' "$SRC/AndroidManifest.xml" || sed -i 's#</application>#    <activity android:name=".WidgetConfigActivity" android:exported="true" android:label="@string/nexus_w_cfg" android:excludeFromRecents="true" android:taskAffinity="de.ghostnode.vrcnexus.widgetcfg" android:theme="@android:style/Theme.Material.NoActionBar">\n            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_CONFIGURE" /></intent-filter>\n        </activity>\n    </application>#' "$SRC/AndroidManifest.xml"
# Updates selbst installieren dürfen (Android fragt den Nutzer trotzdem)
grep -q 'REQUEST_INSTALL_PACKAGES' "$SRC/AndroidManifest.xml" || sed -i 's#<application#<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n    <application#' "$SRC/AndroidManifest.xml"
# 5.2.3: Handy ↔ PC im Heimnetz läuft über http://PC:17874 – Klartext-Verbindungen erlauben (Kopplung mit eigenem Schlüssel je Gerät)
grep -q 'usesCleartextTraffic' "$SRC/AndroidManifest.xml" || sed -i 's#<application#<application android:usesCleartextTraffic="true"#' "$SRC/AndroidManifest.xml"
# FileProvider von Capacitor muss den Cache-Ordner freigeben (dort landet die heruntergeladene APK)
FP="$SRC/res/xml/file_paths.xml"
if [ -f "$FP" ] && ! grep -q 'cache-path' "$FP"; then sed -i 's#</paths>#    <cache-path name="nexus_cache" path="." />\n</paths>#' "$FP"; fi
if [ ! -f "$FP" ]; then printf '<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n    <cache-path name="nexus_cache" path="." />\n</paths>\n' > "$FP"; fi
grep -n 'fileprovider\|REQUEST_INSTALL' "$SRC/AndroidManifest.xml" || true
cat "$FP"
echo "Native Teile installiert."
