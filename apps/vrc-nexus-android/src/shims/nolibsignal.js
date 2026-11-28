// 8.3: Die offizielle Signal-Bibliothek (@signalapp/libsignal-client) ist ein natives Node-API-Modul und läuft in der
// Android-WebView nicht. backend/signal.js lädt sie per import() – hier schlägt das Laden fehl, der Chat bleibt bei nexus-v1.
throw new Error('libsignal ist auf Android nicht verfügbar.');
