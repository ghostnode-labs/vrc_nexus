package de.ghostnode.vrcnexus;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/** Brücke zur App: Homescreen-Widgets aktualisieren, Widget-Tippen an die App melden und heruntergeladene Updates (APK) installieren. */
@CapacitorPlugin(name = "NexusWidget")
public class WidgetBridge extends Plugin {
    private static WidgetBridge self;

    @Override
    public void load() { self = this; }

    @PluginMethod
    public void update(PluginCall call) {
        String data = call.getString("data", "{}");
        if (data.length() > 32768) { call.reject("zu groß"); return; }
        getContext().getSharedPreferences(WidgetKit.PREFS, Context.MODE_PRIVATE).edit().putString("data", data).apply();
        WidgetKit.refreshAll(getContext());
        call.resolve();
    }

    /** 7.0.1: Ziel aus dem letzten Widget-Tippen abholen (einmalig; älter als 2 Minuten = verfallen) */
    @PluginMethod
    public void takePending(PluginCall call) {
        android.content.SharedPreferences p = getContext().getSharedPreferences(WidgetKit.PREFS, Context.MODE_PRIVATE);
        String v = p.getString("pending", "");
        long at = p.getLong("pending_at", 0);
        p.edit().remove("pending").remove("pending_at").apply();
        JSObject r = new JSObject();
        r.put("pending", System.currentTimeMillis() - at < 120000 ? v : "");
        call.resolve(r);
    }

    /** läuft die App schon, gleich Bescheid geben (sonst holt sie es beim Start ab) */
    static void ping() {
        WidgetBridge b = self;
        if (b != null) { try { b.notifyListeners("pending", new JSObject()); } catch (Exception e) { /* egal */ } }
    }

    /** Öffnet den Android-Installationsdialog für eine heruntergeladene APK (im Cache-Ordner der App). */
    @PluginMethod
    public void installApk(PluginCall call) {
        Context ctx = getContext();
        String p = call.getString("path", "");
        if (p.startsWith("file://")) p = Uri.parse(p).getPath();
        File f = new File(p);
        if (!f.exists()) { call.reject("APK nicht gefunden: " + p); return; }
        // Android 8+: „Unbekannte Apps installieren“ muss für VRC Nexus erlaubt sein
        if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(s);
            call.reject("Bitte „Unbekannte Apps installieren“ für VRC Nexus erlauben und dann erneut auf Update tippen.", "PERMISSION");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Installation konnte nicht geöffnet werden: " + e.getMessage());
        }
    }
}
