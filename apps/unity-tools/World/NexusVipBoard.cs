// GhostNode – VIP-Tafel für VRChat-Welten (UdonSharp, Unity 2022.3 + VRChat Worlds SDK mit integriertem UdonSharp).
// Eigene Umsetzung. Lädt eine Textliste per VRChat String Loading (VRCStringDownloader.LoadUrl), zeigt die Namen auf
// beliebig vielen Textfeldern (mit Blättern), meldet „lokaler Spieler steht auf der Liste“ an eigene Skripte und kann die
// Namen an ein anderes UdonBehaviour weitergeben (z. B. die Rolle „VIP“ eines Zugangs-/Keypad-Systems).
//
// Listenformat (UTF-8, eine Zeile je Eintrag):
//   # Kommentar                    → ignoriert (auch Zeilen mit //)
//   VIP|Anzeigename                → Gruppe VIP
//   KOFI|Anzeigename               → Gruppe KOFI
//   Anzeigename                    → Gruppe „defaultGroup“ (Standard VIP)
// Leere Zeilen werden ignoriert. Beim Vergleich sind Groß/Klein und Leerzeichen am Rand egal.
// Erkannt wird über VRCPlayerApi.displayName (Udon kennt keine Benutzer-ID) – Anzeigenamen können sich ändern.
//
// VRChat-Regeln (creators.vrchat.com → Udon → String Loading / External URLs):
//  - VRCUrl kann zur Laufzeit NICHT gebaut werden → alle Adressen stehen im Inspector (Feld „urls“).
//  - Höchstens ein Download alle 5 Sekunden je Welt, weitere werden eingereiht → Neuladen frühestens jede Minute.
//  - Nicht vertrauenswürdige Domains laden nur, wenn der Spieler „Allow Untrusted URLs“ an hat. gist.githubusercontent.com
//    steht auf der Liste der vertrauenswürdigen Adressen → URL 1 = Gist-Raw-Adresse, URL 2 = GhostNode direkt (Rückfall).
//  - Alles hier ist LOKAL je Client: jeder Spieler lädt die Liste selbst. Schutz ist so stark wie das Ziel-System.
#if UDONSHARP   // nur in Welt-Projekten mit UdonSharp
using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using VRC.SDKBase;
using VRC.SDK3.StringLoading;
using VRC.Udon;
using VRC.Udon.Common.Interfaces;

namespace GhostNode.VipBoard
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class NexusVipBoard : UdonSharpBehaviour
    {
        // ------------------------------------------------------------------ Quelle
        [Header("Quelle (Adressen nur hier im Inspector – VRChat erlaubt keine Laufzeit-URLs)")]
        [Tooltip("Der Reihe nach versucht: 1. Gist-Raw-Adresse (vertrauenswürdig), 2. GhostNode direkt (nur mit „Untrusted URLs“).")]
        public VRCUrl[] urls;
        [Tooltip("Alle … Minuten neu laden (0 = nur beim Betreten). Mindestens 1 Minute.")]
        public int reloadMinutes = 10;
        [Tooltip("Sekunden nach dem Start bis zum ersten Laden (verteilt Downloads, wenn mehrere Tafeln in der Welt sind).")]
        public float startDelay = 2f;
        [Tooltip("Gruppe für Zeilen ohne „GRUPPE|“")]
        public string defaultGroup = "VIP";
        [Tooltip("Höchstens so viele Einträge übernehmen")]
        public int maxEntries = 500;

        // ------------------------------------------------------------------ Anzeige
        [Header("Anzeige – Bereich 1 (z. B. VIP)")]
        [Tooltip("Namensfelder (TextMeshPro UI). Bei mehr Namen als Feldern wird geblättert.")]
        public TextMeshProUGUI[] mainFields;
        [Tooltip("Zusätzlich/alternativ: alte UI-Text-Felder (kommen nach den TMP-Feldern).")]
        public Text[] mainFieldsLegacy;
        [Tooltip("Gruppen für Bereich 1, mit Komma getrennt (leer = alle, die nicht in Bereich 2 stehen).")]
        public string mainGroups = "";
        public TextMeshProUGUI mainHeader;
        public string mainTitle = "VIP";
        [Tooltip("Optional: zeigt „Seite 1/3“")]
        public TextMeshProUGUI mainPageText;

        [Header("Anzeige – Bereich 2 (optional, z. B. Ko-fi)")]
        public TextMeshProUGUI[] secondFields;
        public Text[] secondFieldsLegacy;
        [Tooltip("Gruppen für Bereich 2, mit Komma getrennt. Ohne Felder in Bereich 2 landen diese Namen in Bereich 1.")]
        public string secondGroups = "KOFI";
        public TextMeshProUGUI secondHeader;
        public string secondTitle = "Ko-fi";
        public TextMeshProUGUI secondPageText;

        [Header("Anzeige – allgemein")]
        [Tooltip("Sekunden bis zur nächsten Seite, wenn mehr Namen als Felder da sind")]
        public float pageSeconds = 8f;
        [Tooltip("Text in leeren Feldern")]
        public string emptyFieldText = "";
        [Tooltip("Zustand (Lade … / Fehler / leer) – optional")]
        public TextMeshProUGUI statusText;
        public string loadingText = "Lade …";
        public string errorText = "Liste gerade nicht erreichbar";
        public string emptyListText = "Noch niemand auf der Liste";
        [Tooltip("Spieler, die gerade in der Instanz sind, markieren")]
        public bool markPresent = true;
        public string presentPrefix = "★ ";

        // ------------------------------------------------------------------ lokaler Spieler
        [Header("Lokaler Spieler steht auf der Liste")]
        [Tooltip("Welche Gruppen zählen (Komma, leer = alle)")]
        public string localVipGroups = "";
        [Tooltip("Bekommen die Events OnLocalPlayerIsVip / OnLocalPlayerIsNotVip (SendCustomEvent)")]
        public UdonBehaviour[] eventReceivers;
        [Tooltip("Nur für Spieler auf der Liste einschalten (z. B. Tür-Collider aus, Leuchten an)")]
        public GameObject[] showForVip;
        [Tooltip("Für Spieler auf der Liste ausschalten (z. B. Sperr-Collider vor dem VIP-Bereich)")]
        public GameObject[] hideForVip;

        // ------------------------------------------------------------------ Brücke zu einem anderen System
        [Header("Brücke (z. B. Rolle „VIP“ im Security Keypad) – siehe README")]
        [Tooltip("Ziel-UdonBehaviours, z. B. die Rollen-Objekte des Keypads")]
        public UdonBehaviour[] bridgeTargets;
        [Tooltip("Je Ziel die Gruppen (Komma). Fehlt ein Eintrag, gilt bridgeGroups.")]
        public string[] bridgeTargetGroups;
        public string bridgeGroups = "VIP";
        [Tooltip("Modus 1: Namen als string[] in diese Variable des Ziels schreiben (leer = aus)")]
        public string bridgeVariable = "";
        [Tooltip("Namen, die schon im Inspector des Ziels stehen, behalten")]
        public bool bridgeKeepInspectorNames = true;
        [Tooltip("Nach dem Schreiben dieses Event am Ziel auslösen (leer = keins)")]
        public string bridgeAfterSetEvent = "";
        [Tooltip("Modus 2: steht der LOKALE Spieler auf der Liste, dieses Event am Ziel auslösen (leer = aus)")]
        public string bridgeLocalEvent = "";

        // ------------------------------------------------------------------ Zustand
        string[] _names = new string[0];
        string[] _groups = new string[0];
        string[] _keys = new string[0];
        int _count;
        int[] _sec0 = new int[0]; int _sec0Count; int _page0;
        int[] _sec1 = new int[0]; int _sec1Count; int _page1;
        int _urlIndex;
        bool _loading;
        bool _hasData;
        bool _reloadPending;
        bool _pageLoop;
        int _localState = -1;   // -1 unbekannt, 0 nein, 1 ja
        float _lastManual = -100f;
        object[] _bridgeOriginal;
        string _mainG = "";
        string _secondG = "";
        string _localG = "";
        string _bridgeG = "";
        string[] _presentKeys = new string[0];

        void Start()
        {
            _mainG = NormCsv(mainGroups);
            _secondG = NormCsv(secondGroups);
            _localG = NormCsv(localVipGroups);
            _bridgeG = NormCsv(bridgeGroups);
            if (mainHeader != null) mainHeader.text = mainTitle;
            if (secondHeader != null) secondHeader.text = secondTitle;
            SetStatus(loadingText);
            RenderAll();
            SendCustomEventDelayedSeconds(nameof(_Load), Mathf.Max(0.1f, startDelay));
        }

        // ================================================================== Laden

        /// <summary>Von außen (Knopf): sofort neu laden – höchstens alle 10 Sekunden.</summary>
        public void Reload()
        {
            if (_loading || Time.time - _lastManual < 10f) return;
            _lastManual = Time.time;
            _urlIndex = 0;
            _Load();
        }

        public void _Load()
        {
            if (_loading) return;
            if (urls == null || urls.Length == 0) { SetStatus(errorText); Debug.LogWarning("[GhostNode VIP] Keine URL im Inspector eingetragen."); return; }
            int guard = 0;
            while (guard < urls.Length && (urls[_urlIndex % urls.Length] == null || string.IsNullOrEmpty(urls[_urlIndex % urls.Length].Get()))) { _urlIndex++; guard++; }
            if (guard >= urls.Length) { SetStatus(errorText); Debug.LogWarning("[GhostNode VIP] Alle URLs sind leer."); return; }
            _urlIndex = _urlIndex % urls.Length;
            _loading = true;
            if (!_hasData) SetStatus(loadingText);
            VRCStringDownloader.LoadUrl(urls[_urlIndex], (IUdonEventReceiver)this);
        }

        public override void OnStringLoadSuccess(IVRCStringDownload result)
        {
            _loading = false;
            ApplyText(result.Result);
            _hasData = true;
            _urlIndex = 0;
            SetStatus(_count == 0 ? emptyListText : "");
            ScheduleReload();
        }

        public override void OnStringLoadError(IVRCStringDownload result)
        {
            _loading = false;
            Debug.LogWarning("[GhostNode VIP] Laden fehlgeschlagen (URL " + (_urlIndex + 1) + "): " + result.ErrorCode + " " + result.Error);
            _urlIndex++;
            if (urls != null && _urlIndex < urls.Length)
            {
                // nächste Adresse – VRChat lädt ohnehin höchstens alle 5 s, also nicht drängeln
                SendCustomEventDelayedSeconds(nameof(_Load), 5.5f);
                return;
            }
            _urlIndex = 0;
            if (!_hasData) SetStatus(errorText);   // alte Liste bleibt sonst stehen
            ScheduleReload();
        }

        void ScheduleReload()
        {
            if (reloadMinutes <= 0 || _reloadPending) return;
            _reloadPending = true;
            SendCustomEventDelayedSeconds(nameof(_ReloadTick), Mathf.Max(60f, reloadMinutes * 60f));
        }

        public void _ReloadTick()
        {
            _reloadPending = false;
            _Load();
        }

        // ================================================================== Liste lesen

        void ApplyText(string text)
        {
            if (text == null) text = "";
            if (text.Length > 0 && text[0] == '﻿') text = text.Substring(1);
            int lines = 1;
            for (int i = 0; i < text.Length; i++) if (text[i] == '\n') lines++;
            int cap = Mathf.Min(lines, Mathf.Max(1, maxEntries));
            string[] names = new string[cap];
            string[] groups = new string[cap];
            string[] keys = new string[cap];
            int n = 0;
            string defGroup = NormGroup(defaultGroup);
            if (defGroup.Length == 0) defGroup = "VIP";
            int start = 0;
            while (start <= text.Length && n < cap)
            {
                int end = text.IndexOf('\n', start);
                if (end < 0) end = text.Length;
                string line = text.Substring(start, end - start).Trim();
                start = end + 1;
                if (line.Length == 0 || line[0] == '#' || line.StartsWith("//")) continue;
                string grp = defGroup;
                string name = line;
                int bar = line.IndexOf('|');
                if (bar >= 0)
                {
                    grp = NormGroup(line.Substring(0, bar));
                    if (grp.Length == 0) grp = defGroup;
                    name = line.Substring(bar + 1).Trim();
                }
                if (name.Length == 0) continue;
                string key = Key(name);
                bool dup = false;
                for (int j = 0; j < n; j++) { if (keys[j] == key && groups[j] == grp) { dup = true; break; } }
                if (dup) continue;
                names[n] = name; groups[n] = grp; keys[n] = key;
                n++;
            }
            _names = names; _groups = groups; _keys = keys; _count = n;
            Distribute();
            RenderAll();
            UpdateLocal();
            ApplyBridge();
        }

        void Distribute()
        {
            int c0 = FieldCount(0);
            int c1 = FieldCount(1);
            int[] s0 = new int[_count];
            int[] s1 = new int[_count];
            int n0 = 0;
            int n1 = 0;
            for (int i = 0; i < _count; i++)
            {
                string g = _groups[i];
                if (c1 > 0 && _secondG.Length > 0 && InCsv(g, _secondG)) { s1[n1] = i; n1++; }
                else if (_mainG.Length == 0 || InCsv(g, _mainG)) { s0[n0] = i; n0++; }
            }
            _sec0 = s0; _sec0Count = n0; _sec1 = s1; _sec1Count = n1;
            if (c0 == 0 || _page0 * c0 >= n0) _page0 = 0;
            if (c1 == 0 || _page1 * c1 >= n1) _page1 = 0;
        }

        // ================================================================== Anzeige

        int FieldCount(int sec)
        {
            int a = 0;
            int b = 0;
            if (sec == 0) { if (mainFields != null) a = mainFields.Length; if (mainFieldsLegacy != null) b = mainFieldsLegacy.Length; }
            else { if (secondFields != null) a = secondFields.Length; if (secondFieldsLegacy != null) b = secondFieldsLegacy.Length; }
            return a + b;
        }

        void SetField(int sec, int i, string s)
        {
            TextMeshProUGUI[] tmp = sec == 0 ? mainFields : secondFields;
            Text[] leg = sec == 0 ? mainFieldsLegacy : secondFieldsLegacy;
            int nt = tmp != null ? tmp.Length : 0;
            if (i < nt) { if (tmp[i] != null) tmp[i].text = s; return; }
            i -= nt;
            if (leg != null && i < leg.Length && leg[i] != null) leg[i].text = s;
        }

        void RenderAll()
        {
            RenderSection(0);
            RenderSection(1);
            bool needLoop = (FieldCount(0) > 0 && _sec0Count > FieldCount(0)) || (FieldCount(1) > 0 && _sec1Count > FieldCount(1));
            if (needLoop && !_pageLoop)
            {
                _pageLoop = true;
                SendCustomEventDelayedSeconds(nameof(_NextPage), Mathf.Max(2f, pageSeconds));
            }
        }

        void RenderSection(int sec)
        {
            int fields = FieldCount(sec);
            if (fields == 0) return;
            int[] idx = sec == 0 ? _sec0 : _sec1;
            int count = sec == 0 ? _sec0Count : _sec1Count;
            int page = sec == 0 ? _page0 : _page1;
            for (int f = 0; f < fields; f++)
            {
                int k = page * fields + f;
                if (k < count)
                {
                    int e = idx[k];
                    SetField(sec, f, (markPresent && IsPresent(_keys[e]) ? presentPrefix : "") + _names[e]);
                }
                else SetField(sec, f, emptyFieldText);
            }
            int pages = count == 0 ? 1 : (count + fields - 1) / fields;
            TextMeshProUGUI pt = sec == 0 ? mainPageText : secondPageText;
            if (pt != null) pt.text = pages > 1 ? (page + 1) + "/" + pages : "";
        }

        public void _NextPage()
        {
            int c0 = FieldCount(0);
            int c1 = FieldCount(1);
            bool any = false;
            if (c0 > 0 && _sec0Count > c0) { _page0++; if (_page0 * c0 >= _sec0Count) _page0 = 0; any = true; }
            if (c1 > 0 && _sec1Count > c1) { _page1++; if (_page1 * c1 >= _sec1Count) _page1 = 0; any = true; }
            if (!any) { _pageLoop = false; _page0 = 0; _page1 = 0; RenderSection(0); RenderSection(1); return; }
            RenderSection(0);
            RenderSection(1);
            SendCustomEventDelayedSeconds(nameof(_NextPage), Mathf.Max(2f, pageSeconds));
        }

        void SetStatus(string s)
        {
            if (statusText == null) return;
            statusText.text = s;
            statusText.gameObject.SetActive(!string.IsNullOrEmpty(s));
        }

        // ================================================================== Spieler in der Instanz

        public override void OnPlayerJoined(VRCPlayerApi player) { if (markPresent) SendCustomEventDelayedSeconds(nameof(_RefreshPresent), 1f); }
        public override void OnPlayerLeft(VRCPlayerApi player) { if (markPresent) SendCustomEventDelayedSeconds(nameof(_RefreshPresent), 1f); }

        public void _RefreshPresent()
        {
            int n = VRCPlayerApi.GetPlayerCount();
            VRCPlayerApi[] players = new VRCPlayerApi[n];
            VRCPlayerApi.GetPlayers(players);
            string[] k = new string[n];
            int m = 0;
            for (int i = 0; i < n; i++) { if (Utilities.IsValid(players[i])) { k[m] = Key(players[i].displayName); m++; } }
            string[] keys = new string[m];
            for (int i = 0; i < m; i++) keys[i] = k[i];
            _presentKeys = keys;
            RenderSection(0);
            RenderSection(1);
        }

        bool IsPresent(string key)
        {
            for (int i = 0; i < _presentKeys.Length; i++) if (_presentKeys[i] == key) return true;
            return false;
        }

        // ================================================================== lokaler Spieler

        /// <summary>true, wenn der lokale Spieler (Gruppen aus localVipGroups) auf der Liste steht.</summary>
        public bool IsLocalPlayerVip() { return _localState == 1; }

        /// <summary>Steht ein beliebiger Spieler (Gruppen aus localVipGroups) auf der Liste?</summary>
        public bool IsPlayerOnList(VRCPlayerApi player)
        {
            if (!Utilities.IsValid(player)) return false;
            return FindKey(Key(player.displayName), _localG) >= 0;
        }

        void UpdateLocal()
        {
            VRCPlayerApi me = Networking.LocalPlayer;
            if (!Utilities.IsValid(me)) return;
            int state = FindKey(Key(me.displayName), _localG) >= 0 ? 1 : 0;
            if (state == _localState) return;
            _localState = state;
            bool vip = state == 1;
            if (showForVip != null) for (int i = 0; i < showForVip.Length; i++) if (showForVip[i] != null) showForVip[i].SetActive(vip);
            if (hideForVip != null) for (int i = 0; i < hideForVip.Length; i++) if (hideForVip[i] != null) hideForVip[i].SetActive(!vip);
            if (eventReceivers != null)
                for (int i = 0; i < eventReceivers.Length; i++)
                    if (eventReceivers[i] != null) eventReceivers[i].SendCustomEvent(vip ? "OnLocalPlayerIsVip" : "OnLocalPlayerIsNotVip");
        }

        int FindKey(string key, string csv)
        {
            for (int i = 0; i < _count; i++) if (_keys[i] == key && (csv.Length == 0 || InCsv(_groups[i], csv))) return i;
            return -1;
        }

        // ================================================================== Brücke

        void ApplyBridge()
        {
            if (bridgeTargets == null || bridgeTargets.Length == 0) return;
            if (_bridgeOriginal == null || _bridgeOriginal.Length != bridgeTargets.Length) _bridgeOriginal = new object[bridgeTargets.Length];
            VRCPlayerApi me = Networking.LocalPlayer;
            string myKey = Utilities.IsValid(me) ? Key(me.displayName) : "";
            for (int t = 0; t < bridgeTargets.Length; t++)
            {
                UdonBehaviour target = bridgeTargets[t];
                if (target == null) continue;
                string csv = _bridgeG;
                if (bridgeTargetGroups != null && t < bridgeTargetGroups.Length && !string.IsNullOrEmpty(bridgeTargetGroups[t])) csv = NormCsv(bridgeTargetGroups[t]);

                if (!string.IsNullOrEmpty(bridgeVariable))
                {
                    string[] keep = new string[0];
                    if (bridgeKeepInspectorNames)
                    {
                        if (_bridgeOriginal[t] == null)
                        {
                            object o = target.GetProgramVariable(bridgeVariable);
                            _bridgeOriginal[t] = o != null ? o : new string[0];
                        }
                        keep = (string[])_bridgeOriginal[t];
                    }
                    int n = 0;
                    for (int i = 0; i < _count; i++) if (csv.Length == 0 || InCsv(_groups[i], csv)) n++;
                    string[] list = new string[keep.Length + n];
                    for (int i = 0; i < keep.Length; i++) list[i] = keep[i];
                    int p = keep.Length;
                    for (int i = 0; i < _count; i++) if (csv.Length == 0 || InCsv(_groups[i], csv)) { list[p] = _names[i]; p++; }
                    target.SetProgramVariable(bridgeVariable, list);
                    if (!string.IsNullOrEmpty(bridgeAfterSetEvent)) target.SendCustomEvent(bridgeAfterSetEvent);
                }

                if (!string.IsNullOrEmpty(bridgeLocalEvent) && myKey.Length > 0 && FindKey(myKey, csv) >= 0)
                    target.SendCustomEvent(bridgeLocalEvent);
            }
        }

        // ================================================================== Hilfen

        /// <summary>Vergleichsschlüssel: Leerzeichen am Rand weg, Kleinbuchstaben.</summary>
        string Key(string s)
        {
            if (s == null) return "";
            return s.Trim().ToLowerInvariant();
        }

        string NormGroup(string s)
        {
            if (s == null) return "";
            return s.Trim().ToUpperInvariant();
        }

        /// <summary>„vip, Kofi“ → „,VIP,KOFI,“ (leer bleibt leer)</summary>
        string NormCsv(string s)
        {
            if (s == null) return "";
            string t = s.Replace(" ", "").ToUpperInvariant();
            if (t.Replace(",", "").Length == 0) return "";
            return "," + t + ",";
        }

        bool InCsv(string grp, string csv) { return csv.IndexOf("," + grp + ",") >= 0; }
    }
}
#endif
