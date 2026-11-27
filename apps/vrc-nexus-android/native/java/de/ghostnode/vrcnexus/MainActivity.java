package de.ghostnode.vrcnexus;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** Startet die WebView-App und meldet die Plugins an (Homescreen-Widgets, OSC über UDP). */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridge.class);
        registerPlugin(OscBridge.class);
        super.onCreate(savedInstanceState);
    }

    /** 7.0.1: Tippen auf ein Widget (nexus://open/… oder nexus://act/…) – Capacitor ruft das auch beim ersten Start mit getIntent() auf */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        WidgetKit.stash(this, intent);
    }
}
