// VRC Nexus – Welt-Baustein (UdonSharp). Schreibt Befehle ins VRChat-Log, die VRC Nexus beim Spieler liest.
// Nur der lokale Spieler löst aus; VRC Nexus reagiert nur, wenn der Spieler die Welt-Brücke selbst eingeschaltet hat
// (mit eigener Obergrenze, Consent-Ampel und Panik-Knopf). Ohne VRC Nexus passiert einfach nichts.
//
// Log-Format (eine Zeile):  [NexusToy] pulse <stärke 0–1> <sekunden>  |  [NexusToy] set <stärke> [sekunden]  |  [NexusToy] stop
//
// Verwendung: auf ein Objekt mit Collider (Is Trigger) legen. Betreten → Puls, Verlassen → Stopp. Oder Pulse()/Stop()
// aus eigenen Udon-Skripten aufrufen (SendCustomEvent oder direkt).
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;

namespace GhostNode.VrcNexus.World
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class NexusToyBridge : UdonSharpBehaviour
    {
        [Tooltip("Stärke 0–1")] [Range(0f, 1f)] public float strength = 0.5f;
        [Tooltip("Dauer in Sekunden (0,2–30)")] [Range(0.2f, 30f)] public float seconds = 2f;
        [Tooltip("Beim Betreten des Triggers auslösen")] public bool onEnter = true;
        [Tooltip("Solange im Trigger: alle paar Sekunden erneuern (statt einmal)")] public bool holdWhileInside = false;
        [Tooltip("Beim Verlassen stoppen")] public bool stopOnExit = true;
        [Tooltip("Mindestabstand zwischen zwei Befehlen (Sekunden) – schont das Log")] public float cooldown = 0.5f;

        float lastSent = -100f;
        bool inside;

        public override void OnPlayerTriggerEnter(VRCPlayerApi player)
        {
            if (player == null || !player.isLocal) return;
            inside = true;
            if (onEnter) Pulse();
            if (holdWhileInside) SendCustomEventDelayedSeconds(nameof(_Refresh), Mathf.Max(0.5f, seconds * 0.8f));
        }

        public override void OnPlayerTriggerExit(VRCPlayerApi player)
        {
            if (player == null || !player.isLocal) return;
            inside = false;
            if (stopOnExit) Stop();
        }

        public void _Refresh()
        {
            if (!inside || !holdWhileInside) return;
            Pulse();
            SendCustomEventDelayedSeconds(nameof(_Refresh), Mathf.Max(0.5f, seconds * 0.8f));
        }

        /// <summary>Kurzer Impuls mit strength/seconds.</summary>
        public void Pulse() { Send("pulse " + F(strength) + " " + F(seconds)); }

        /// <summary>Stärke halten (bis zu 30 s oder bis Stop).</summary>
        public void Hold() { Send("set " + F(strength) + " 30"); }

        public void Stop() { lastSent = -100f; Send("stop"); }

        /// <summary>Stärke von außen setzen und gleich auslösen (z. B. aus einem Spiel-Skript).</summary>
        public void PulseWith(float lv, float secs) { strength = Mathf.Clamp01(lv); seconds = Mathf.Clamp(secs, 0.2f, 30f); Pulse(); }

        void Send(string cmd)
        {
            if (cmd != "stop" && Time.time - lastSent < cooldown) return;
            lastSent = Time.time;
            Debug.Log("[NexusToy] " + cmd);
        }

        static string F(float v) { return (Mathf.Round(v * 100f) / 100f).ToString().Replace(',', '.'); }
    }
}

