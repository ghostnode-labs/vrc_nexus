// VRC Nexus – SteamVR-Overlay-Helfer.
// Wird von der Electron-App gestartet. Protokoll:
//   stdin  (binär): [1 Byte Typ][uint32 Länge LE][Daten]
//                   Typ 1 = Bild: uint32 Breite, uint32 Höhe, Pixel BGRA (von Electron)  → SetOverlayRaw (RGBA)
//                   Typ 3 = Bild für das HUD (Infos & Untertitel), gleiches Format wie Typ 1
//                   Typ 2 = Befehl als JSON-Text, z. B. {"cmd":"show"} {"cmd":"hide"} {"cmd":"toggle"} {"cmd":"mode","mode":"wrist","hand":"left","width":0.28,"alpha":0.95}
//   stdout (Text):  eine JSON-Zeile pro Ereignis: ready, error, mouse (move/down/up, x, y in Pixeln), scroll, visible, quit
using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Valve.VR;

namespace NexusOverlay
{
    internal static class Program
    {
        static readonly object Lock = new object();
        static byte[] frame; static uint fw, fh; static bool frameNew;
        static byte[] infoFrame; static uint iw, ih; static bool infoNew;
        static ulong info; static bool infoOn; static string infoPlace = "wrist"; static float infoWidth = 0.28f, infoAlpha = 0.9f;
        // 3.8.4: HUD im Headset frei (Abstand/X/Y/Neigung) und am Arm verschiebbar
        static float infoX = 0f, infoY = -0.32f, infoZ = 1.1f, infoTilt = 0f, infoArm = 0.27f;
        static string pendingCmd;
        static ulong dash, thumb, hud;
        static bool hudVisible;
        static string mode = "wrist", hand = "left";
        static float width = 0.30f, alpha = 0.96f, distance = 1.2f;
        // 3.8.4: Lage des Arm-Fensters (Neigung, Versatz) und Höhe „frei vor mir“
        static float tilt = 60f, offX = 0.02f, offY = 0.03f, offZ = 0.12f, frontY = -0.1f;
        static uint curW = 1024, curH = 640;
        static bool gaze = true, interactive = true;
        static ulong actSet, actToggle;
        static long lastGaze, lastFps;
        static readonly Compositor_FrameTiming[] timings = new Compositor_FrameTiming[90];
        static volatile bool running = true;

        static void Out(string json) { lock (Console.Out) { Console.Out.WriteLine(json); Console.Out.Flush(); } }
        static string Q(string s) => "\"" + (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", " ") + "\"";

        static int Main(string[] args)
        {
            Console.OutputEncoding = new UTF8Encoding(false);
            string icon = args.Length > 0 ? args[0] : "";
            bool noDash = args.Length > 1 && args[1] == "nodash";   // 3.3: nur VR-Bewegung, ohne Dashboard-Reiter
            var err = EVRInitError.None;
            OpenVR.Init(ref err, EVRApplicationType.VRApplication_Overlay);
            if (err != EVRInitError.None) { Out("{\"ev\":\"error\",\"msg\":" + Q("SteamVR nicht erreichbar: " + err) + "}"); return 2; }
            var ov = OpenVR.Overlay;
            if (!noDash && ov.CreateDashboardOverlay("de.ghostnode.vrcnexus.dash", "VRC Nexus", ref dash, ref thumb) != EVROverlayError.None) { Out("{\"ev\":\"error\",\"msg\":\"Dashboard-Overlay konnte nicht angelegt werden (läuft VRC Nexus doppelt?)\"}"); return 3; }
            ov.CreateOverlay("de.ghostnode.vrcnexus.hud", "VRC Nexus (Handgelenk)", ref hud);
            ov.CreateOverlay("de.ghostnode.vrcnexus.info", "VRC Nexus (Infos & Untertitel)", ref info);
            ov.SetOverlaySortOrder(info, 9);
            if (icon != "" && File.Exists(icon)) ov.SetOverlayFromFile(thumb, icon);
            foreach (var h in new[] { dash, hud })
            {
                ov.SetOverlayInputMethod(h, VROverlayInputMethod.Mouse);
                ov.SetOverlayFlag(h, VROverlayFlags.SendVRSmoothScrollEvents, true);
                ov.SetOverlayFlag(h, VROverlayFlags.EnableClickStabilization, true);
            }
            // Laser-Koordinaten in Pixeln der Seite melden (Standard wäre 0…1 → jeder Klick landet links oben)
            SetMouseScale(curW, curH);
            ov.SetOverlayWidthInMeters(dash, 2.4f);
            ov.SetOverlayFlag(hud, VROverlayFlags.MakeOverlaysInteractiveIfVisible, true);
            ov.SetOverlaySortOrder(hud, 10);
            ApplyLayout();
            SetupInput();
            new Thread(ReadInput) { IsBackground = true }.Start();
            Out("{\"ev\":\"ready\"}");

            var ev = new VREvent_t();
            uint evSize = (uint)Marshal.SizeOf(typeof(VREvent_t));
            while (running)
            {
                byte[] f = null, fi = null; uint w = 0, hgt = 0, wi = 0, hi = 0; string cmd = null;
                lock (Lock)
                {
                    if (frameNew) { f = frame; w = fw; hgt = fh; frameNew = false; }
                    if (infoNew) { fi = infoFrame; wi = iw; hi = ih; infoNew = false; }
                    cmd = pendingCmd; pendingCmd = null;
                }
                if (cmd != null) foreach (var c in cmd.Split('\n')) if (c.Trim() != "") Command(c);
                if (f != null) Upload(f, w, hgt);
                if (fi != null && infoOn) UploadInfo(fi, wi, hi);
                foreach (var h in new[] { dash, hud })
                    while (ov.PollNextOverlayEvent(h, ref ev, evSize)) HandleEvent(ev);
                while (OpenVR.System.PollNextEvent(ref ev, evSize))
                    if (ev.eventType == (uint)EVREventType.VREvent_Quit) { Out("{\"ev\":\"quit\"}"); OpenVR.System.AcknowledgeQuit_Exiting(); running = false; }
                PollInput();
                try { SpaceTick(); } catch (Exception e) { Out("{\"ev\":\"space_error\",\"msg\":" + Q(e.Message) + "}"); spOn = false; }
                if (hudVisible && gaze && Environment.TickCount - lastGaze > 100) { lastGaze = Environment.TickCount; GazeCheck(); }
                if (Environment.TickCount - lastFps > 1000) { lastFps = Environment.TickCount; ReportFps(); }
                Thread.Sleep(11);
            }
            if (spMoved) { try { SpaceReset(); } catch (Exception) { } }   // beim Beenden den ursprünglichen Spielbereich wiederherstellen
            OpenVR.Shutdown();
            return 0;
        }

        // ---------- Controller: SteamVR-Eingabeaktion „Overlay ein/aus“ (in SteamVR → Controller-Belegung änderbar) ----------
        static void SetupInput()
        {
            try
            {
                string manifest = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "input", "actions.json");
                if (!File.Exists(manifest)) { Out("{\"ev\":\"input\",\"ok\":false,\"msg\":\"actions.json fehlt\"}"); return; }
                var e1 = OpenVR.Input.SetActionManifestPath(manifest);
                var e2 = OpenVR.Input.GetActionSetHandle("/actions/nexus", ref actSet);
                var e3 = OpenVR.Input.GetActionHandle("/actions/nexus/in/toggle", ref actToggle);
                SetupSpaceInput();
                Out("{\"ev\":\"input\",\"ok\":" + (e1 == EVRInputError.None && e2 == EVRInputError.None && e3 == EVRInputError.None ? "true" : "false") + ",\"msg\":" + Q(e1 + "/" + e2 + "/" + e3) + "}");
            }
            catch (Exception e) { Out("{\"ev\":\"input\",\"ok\":false,\"msg\":" + Q(e.Message) + "}"); }
        }
        static readonly VRActiveActionSet_t[] sets = new VRActiveActionSet_t[1];
        static void PollInput()
        {
            if (actSet == 0) return;
            sets[0].ulActionSet = actSet;
            if (OpenVR.Input.UpdateActionState(sets, (uint)Marshal.SizeOf(typeof(VRActiveActionSet_t))) != EVRInputError.None) return;
            if (actToggle == 0) return;
            var d = new InputDigitalActionData_t();
            if (OpenVR.Input.GetDigitalActionData(actToggle, ref d, (uint)Marshal.SizeOf(typeof(InputDigitalActionData_t)), OpenVR.k_ulInvalidInputValueHandle) != EVRInputError.None) return;
            if (d.bActive && d.bChanged && d.bState)
            {
                if (mode == "off") mode = "wrist";
                Command("{\"cmd\":\"toggle\"}");
                Out("{\"ev\":\"toggled\",\"v\":" + (hudVisible ? "true" : "false") + "}");
            }
        }

        // ---------- Nur bedienbar, wenn man draufschaut: sonst bekommt VRChat den Laser ----------
        static void GazeCheck()
        {
            var poses = new TrackedDevicePose_t[1];
            OpenVR.System.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
            var p = poses[0].mDeviceToAbsoluteTracking;
            var prm = new VROverlayIntersectionParams_t
            {
                vSource = new HmdVector3_t { v0 = p.m3, v1 = p.m7, v2 = p.m11 },
                vDirection = new HmdVector3_t { v0 = -p.m2, v1 = -p.m6, v2 = -p.m10 },
                eOrigin = ETrackingUniverseOrigin.TrackingUniverseStanding,
            };
            var res = new VROverlayIntersectionResults_t();
            bool look = OpenVR.Overlay.ComputeOverlayIntersection(hud, ref prm, ref res);
            SetInteractive(look);
        }
        static void SetInteractive(bool on)
        {
            if (on == interactive) return;
            interactive = on;
            OpenVR.Overlay.SetOverlayFlag(hud, VROverlayFlags.MakeOverlaysInteractiveIfVisible, on);
            OpenVR.Overlay.SetOverlayAlpha(hud, Math.Max(0.1f, Math.Min(1f, alpha)) * (on ? 1f : 0.55f));
        }

        static void HandleEvent(VREvent_t ev)
        {
            switch ((EVREventType)ev.eventType)
            {
                case EVREventType.VREvent_MouseMove:
                case EVREventType.VREvent_MouseButtonDown:
                case EVREventType.VREvent_MouseButtonUp:
                {
                    string t = ev.eventType == (uint)EVREventType.VREvent_MouseMove ? "move" : ev.eventType == (uint)EVREventType.VREvent_MouseButtonDown ? "down" : "up";
                    // OpenVR zählt y von unten
                    int x = (int)ev.data.mouse.x, y = (int)(curH - ev.data.mouse.y);
                    Out("{\"ev\":\"mouse\",\"t\":\"" + t + "\",\"x\":" + x + ",\"y\":" + y + ",\"b\":" + ev.data.mouse.button + "}");
                    break;
                }
                case EVREventType.VREvent_ScrollSmooth:
                case EVREventType.VREvent_ScrollDiscrete:
                    Out("{\"ev\":\"scroll\",\"dx\":" + ev.data.scroll.xdelta.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",\"dy\":" + ev.data.scroll.ydelta.ToString(System.Globalization.CultureInfo.InvariantCulture) + "}");
                    break;
                case EVREventType.VREvent_DashboardActivated: Out("{\"ev\":\"dashboard\",\"v\":true}"); break;
                case EVREventType.VREvent_DashboardDeactivated: Out("{\"ev\":\"dashboard\",\"v\":false}"); break;
            }
        }

        static void Upload(byte[] bgra, uint w, uint h)
        {
            for (int i = 0; i + 3 < bgra.Length; i += 4) { byte b = bgra[i]; bgra[i] = bgra[i + 2]; bgra[i + 2] = b; }
            var ov = OpenVR.Overlay;
            if (w != curW || h != curH) SetMouseScale(w, h);
            var handle = GCHandle.Alloc(bgra, GCHandleType.Pinned);
            try
            {
                ov.SetOverlayRaw(dash, handle.AddrOfPinnedObject(), w, h, 4);
                if (hudVisible) ov.SetOverlayRaw(hud, handle.AddrOfPinnedObject(), w, h, 4);
            }
            finally { handle.Free(); }
        }

        // Bildrate der VR-Anwendung (VRChat): Abstand zwischen den Bildern, die die App beim Compositor abliefert
        static void ReportFps()
        {
            try
            {
                if (OpenVR.Compositor == null) return;
                uint size = (uint)Marshal.SizeOf(typeof(Compositor_FrameTiming));
                for (int i = 0; i < timings.Length; i++) timings[i].m_nSize = size;
                uint n = OpenVR.Compositor.GetFrameTimings(timings);
                double sum = 0, worst = 0; int cnt = 0;
                for (int i = 0; i < n && i < timings.Length; i++)
                {
                    float ms = timings[i].m_flClientFrameIntervalMs;
                    if (ms > 0.5f && ms < 1000f) { sum += ms; cnt++; if (ms > worst) worst = ms; }
                }
                if (cnt < 5) return;
                double fps = 1000.0 / (sum / cnt), min = 1000.0 / worst;
                var ci = System.Globalization.CultureInfo.InvariantCulture;
                Out("{\"ev\":\"fps\",\"app\":" + fps.ToString("0.0", ci) + ",\"min\":" + min.ToString("0.0", ci) + "}");
            }
            catch (Exception) { }
        }
        static void UploadInfo(byte[] bgra, uint w, uint h)
        {
            for (int i = 0; i + 3 < bgra.Length; i += 4) { byte b = bgra[i]; bgra[i] = bgra[i + 2]; bgra[i + 2] = b; }
            var handle = GCHandle.Alloc(bgra, GCHandleType.Pinned);
            try { OpenVR.Overlay.SetOverlayRaw(info, handle.AddrOfPinnedObject(), w, h, 4); }
            finally { handle.Free(); }
        }
        // HUD: neben dem Arm-Fenster (gleiche Hand, weiter Richtung Ellbogen) oder unten im Blickfeld (am Kopf)
        static void ApplyInfo()
        {
            var ov = OpenVR.Overlay;
            if (!infoOn) { ov.HideOverlay(info); return; }
            ov.SetOverlayWidthInMeters(info, Math.Max(0.1f, Math.Min(1.5f, infoWidth)));
            ov.SetOverlayAlpha(info, Math.Max(0.1f, Math.Min(1f, infoAlpha)));
            if (infoPlace == "head")
            {
                // fest am Headset: X/Y-Versatz, Abstand nach vorn (−Z) und Neigung um die X-Achse
                double t = infoTilt * Math.PI / 180; float c = (float)Math.Cos(t), s = (float)Math.Sin(t);
                float dz = Math.Max(0.2f, Math.Min(4f, infoZ));
                var m = M(1, 0, 0, infoX, 0, c, -s, infoY, 0, s, c, -dz);
                ov.SetOverlayTransformTrackedDeviceRelative(info, 0, ref m);
            }
            else
            {
                uint dev = OpenVR.System.GetTrackedDeviceIndexForControllerRole(hand == "right" ? ETrackedControllerRole.RightHand : ETrackedControllerRole.LeftHand);
                if (dev == OpenVR.k_unTrackedDeviceIndexInvalid) dev = 0;
                double a = -tilt * Math.PI / 180; float c = (float)Math.Cos(a), s = (float)Math.Sin(a);
                float side = hand == "right" ? -offX : offX;
                var m = M(1, 0, 0, side, 0, c, -s, offY + 0.05f, 0, s, c, Math.Max(0f, infoArm));
                ov.SetOverlayTransformTrackedDeviceRelative(info, dev, ref m);
            }
            ov.ShowOverlay(info);
        }

        static void SetMouseScale(uint w, uint h)
        {
            curW = w; curH = h;
            var scale = new HmdVector2_t { v0 = w, v1 = h };
            OpenVR.Overlay.SetOverlayMouseScale(dash, ref scale);
            OpenVR.Overlay.SetOverlayMouseScale(hud, ref scale);
        }

        static string Str(string json, string key) { var m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"([^\"]*)\""); return m.Success ? m.Groups[1].Value : null; }
        static float? Num(string json, string key) { var m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(-?[0-9.]+)"); return m.Success ? float.Parse(m.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture) : (float?)null; }

        static void Command(string json)
        {
            var ov = OpenVR.Overlay;
            string cmd = Str(json, "cmd");
            if (cmd == "mode")
            {
                mode = Str(json, "mode") ?? mode;
                hand = Str(json, "hand") ?? hand;
                width = Num(json, "width") ?? width;
                alpha = Num(json, "alpha") ?? alpha;
                distance = Num(json, "distance") ?? distance;
                tilt = Num(json, "tilt") ?? tilt;
                offX = Num(json, "ox") ?? offX; offY = Num(json, "oy") ?? offY; offZ = Num(json, "oz") ?? offZ;
                frontY = Num(json, "fy") ?? frontY;
                var g = Num(json, "gaze");
                if (g.HasValue) { gaze = g.Value > 0; if (!gaze) SetInteractive(true); }   // 3.8.4: aus = immer bedienbar (vorher wechselte es bei jedem Befehl)
                ApplyLayout();
                if (infoOn) ApplyInfo();
            }
            else if (cmd == "show" || (cmd == "toggle" && !hudVisible)) { hudVisible = mode != "off"; ApplyLayout(); if (hudVisible) ov.ShowOverlay(hud); }
            else if (cmd == "hide" || cmd == "toggle") { hudVisible = false; ov.HideOverlay(hud); }
            else if (cmd == "quit") running = false;
            else if (cmd == "space") { SpaceCommand(json); return; }
            else if (cmd == "space_reset") { SpaceReset(); return; }
            else if (cmd == "info")
            {
                var on = Num(json, "show"); if (on.HasValue) infoOn = on.Value > 0;
                infoPlace = Str(json, "place") ?? infoPlace;
                hand = Str(json, "hand") ?? hand;
                infoWidth = Num(json, "width") ?? infoWidth;
                infoAlpha = Num(json, "alpha") ?? infoAlpha;
                infoX = Num(json, "hx") ?? infoX; infoY = Num(json, "hy") ?? infoY; infoZ = Num(json, "hz") ?? infoZ;
                infoTilt = Num(json, "htilt") ?? infoTilt; infoArm = Num(json, "harm") ?? infoArm;
                ApplyInfo();
                return;
            }
            Out("{\"ev\":\"visible\",\"v\":" + (hudVisible ? "true" : "false") + ",\"mode\":" + Q(mode) + "}");
        }

        // =====================================================================================================
        // 3.3 VR-Bewegung (eigene Umsetzung): Space Flight (verschieben), Space Turn (drehen), Space Walk (Pitch/Roll/Yaw)
        // Prinzip: Die „Standing Zero Pose“ von SteamVR (Nullpunkt des Spielbereichs im Roh-Tracking) wird verändert
        // und als Live-Konfiguration übernommen. Alle Bewegungen „greifen die Welt“: der gegriffene Punkt bleibt an der Hand.
        // Der Ursprungs-Nullpunkt wird gemerkt (und an die App gemeldet) – Zurücksetzen und Beenden stellen ihn wieder her.
        // =====================================================================================================
        static bool spOn, spLegacy, flyOn = true, turnOn, walkOn, grav, lockX, lockY, lockZ, turnInv, walkInv, walkMom, lockP, lockR, lockYw;
        static string flyHand = "both";
        static float flyMul = 1f, gAcc = 9.8f, turnMul = 1f, turnSmooth = 0.5f, turnStep = 0f, walkMul = 1f, walkSmooth = 0.5f;
        static HmdMatrix34_t zOrig, zCur; static bool haveOrig, spDirty, spMoved;
        static ulong aFlyL, aFlyR, aTurnL, aTurnR, aWalkL, aWalkR, aReset, aGrav;
        static int flyDev = -1, turnDev = -1, walkDev = -1;
        static float[] flyPrev = new float[3], vel = new float[3], walkPrevR = new float[9], walkVel = new float[3];
        static float turnPrevAng, turnPending, walkPend0, walkPend1, walkPend2;
        static bool prevReset, prevGrav;
        static long spLast, spReport;
        static string spLastJson = "";
        static readonly TrackedDevicePose_t[] rawPoses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];

        static void SetupSpaceInput()
        {
            OpenVR.Input.GetActionHandle("/actions/nexus/in/fly_left", ref aFlyL);
            OpenVR.Input.GetActionHandle("/actions/nexus/in/fly_right", ref aFlyR);
            OpenVR.Input.GetActionHandle("/actions/nexus/in/turn_left", ref aTurnL);
            OpenVR.Input.GetActionHandle("/actions/nexus/in/turn_right", ref aTurnR);
            OpenVR.Input.GetActionHandle("/actions/nexus/in/walk_left", ref aWalkL);
            OpenVR.Input.GetActionHandle("/actions/nexus/in/walk_right", ref aWalkR);
            OpenVR.Input.GetActionHandle("/actions/nexus/in/space_reset", ref aReset);
            OpenVR.Input.GetActionHandle("/actions/nexus/in/gravity", ref aGrav);
        }
        static bool Dig(ulong h)
        {
            if (h == 0) return false;
            var d = new InputDigitalActionData_t();
            return OpenVR.Input.GetDigitalActionData(h, ref d, (uint)Marshal.SizeOf(typeof(InputDigitalActionData_t)), OpenVR.k_ulInvalidInputValueHandle) == EVRInputError.None && d.bActive && d.bState;
        }
        static ulong Buttons(uint dev)
        {
            if (dev == OpenVR.k_unTrackedDeviceIndexInvalid) return 0;
            var st = new VRControllerState_t();
            return OpenVR.System.GetControllerState(dev, ref st, (uint)Marshal.SizeOf(typeof(VRControllerState_t))) ? st.ulButtonPressed : 0;
        }
        const int BtnMenu = 1, BtnGrip = 2, BtnA = 7, BtnPad = 32;
        static bool Has(ulong mask, int bit) => (mask & (1UL << bit)) != 0;

        static float[] Pos(HmdMatrix34_t m) => new[] { m.m3, m.m7, m.m11 };
        static float[] Rot(HmdMatrix34_t m) => new[] { m.m0, m.m1, m.m2, m.m4, m.m5, m.m6, m.m8, m.m9, m.m10 };
        /** Drehung r (3×3, Zeilen) um den Punkt p auf die Pose z anwenden: z' = [r | p − r·p] · z */
        static HmdMatrix34_t RotateAbout(HmdMatrix34_t z, float[] r, float[] p)
        {
            float[] zr = Rot(z), zt = Pos(z), o = new float[12];
            for (int i = 0; i < 3; i++)
            {
                for (int j = 0; j < 3; j++) o[i * 4 + j] = r[i * 3] * zr[j] + r[i * 3 + 1] * zr[3 + j] + r[i * 3 + 2] * zr[6 + j];
                float rp = r[i * 3] * p[0] + r[i * 3 + 1] * p[1] + r[i * 3 + 2] * p[2];
                float rt = r[i * 3] * zt[0] + r[i * 3 + 1] * zt[1] + r[i * 3 + 2] * zt[2];
                o[i * 4 + 3] = rt + p[i] - rp;
            }
            return M(o[0], o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[8], o[9], o[10], o[11]);
        }
        /** Drehung um die Achse a (Einheitsvektor) mit Winkel w – Rodrigues */
        static float[] AxisRot(float[] a, float w)
        {
            float c = (float)Math.Cos(w), s = (float)Math.Sin(w), t = 1 - c, x = a[0], y = a[1], z = a[2];
            return new[] { t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c };
        }
        static float[] Mul3(float[] a, float[] b)
        {
            var o = new float[9];
            for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
            return o;
        }
        static float[] T3(float[] a) => new[] { a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8] };
        static float Dot(float[] a, float[] b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        static float Wrap(float a) { while (a > Math.PI) a -= (float)(2 * Math.PI); while (a < -Math.PI) a += (float)(2 * Math.PI); return a; }

        static bool SpaceCapture()
        {
            if (haveOrig) return true;
            var cs = OpenVR.ChaperoneSetup;
            if (cs == null) return false;
            cs.RevertWorkingCopy();
            if (!cs.GetWorkingStandingZeroPoseToRawTrackingPose(ref zOrig)) return false;
            haveOrig = true; zCur = zOrig;
            return true;
        }
        /** erste Bewegung: Ursprung an die App melden (wird dort gespeichert, falls der Helfer abstürzt) */
        static void MarkMoved()
        {
            if (spMoved) return;
            spMoved = true;
            var ci = System.Globalization.CultureInfo.InvariantCulture;
            var o = Rot(zOrig); var t = Pos(zOrig);
            Out("{\"ev\":\"space_orig\",\"m\":\"" + string.Join(",", new[] { o[0], o[1], o[2], t[0], o[3], o[4], o[5], t[1], o[6], o[7], o[8], t[2] }.Select(v => v.ToString("R", ci))) + "\"}");
        }
        static void SpaceApply()
        {
            if (!spDirty) return;
            spDirty = false;
            var cs = OpenVR.ChaperoneSetup;
            if (cs == null) return;
            cs.SetWorkingStandingZeroPoseToRawTrackingPose(ref zCur);
            cs.CommitWorkingCopy(EChaperoneConfigFile.Live);
        }
        static void SpaceReset()
        {
            if (!haveOrig) return;
            zCur = zOrig; spDirty = true; spMoved = false;
            vel[0] = vel[1] = vel[2] = 0; walkVel[0] = walkVel[1] = walkVel[2] = 0; turnPending = 0;
            SpaceApply();
            Out("{\"ev\":\"space_reset\"}");
        }

        static void SpaceTick()
        {
            long now = Environment.TickCount;
            float dt = spLast == 0 ? 0.011f : Math.Max(0.001f, Math.Min(0.1f, (now - spLast) / 1000f));
            spLast = now;
            if (!spOn || !(flyOn || turnOn || walkOn)) { flyDev = turnDev = walkDev = -1; return; }
            if (!SpaceCapture()) return;
            uint left = OpenVR.System.GetTrackedDeviceIndexForControllerRole(ETrackedControllerRole.LeftHand);
            uint right = OpenVR.System.GetTrackedDeviceIndexForControllerRole(ETrackedControllerRole.RightHand);
            bool fL, fR, tL, tR, wL, wR, rs, gv;
            if (spLegacy)
            {
                ulong bl = Buttons(left), br = Buttons(right);
                fL = Has(bl, BtnGrip); fR = Has(br, BtnGrip);
                tL = Has(bl, BtnA); tR = false; wL = false; wR = Has(br, BtnA);
                rs = Has(bl, BtnPad) && Has(bl, BtnMenu); gv = Has(br, BtnPad) && Has(br, BtnMenu);
            }
            else
            {
                fL = Dig(aFlyL); fR = Dig(aFlyR); tL = Dig(aTurnL); tR = Dig(aTurnR); wL = Dig(aWalkL); wR = Dig(aWalkR); rs = Dig(aReset); gv = Dig(aGrav);
            }
            if (flyHand == "left") fR = false; else if (flyHand == "right") fL = false;
            if (rs && !prevReset) SpaceReset();
            if (gv && !prevGrav && flyOn) { grav = !grav; Out("{\"ev\":\"gravity\",\"v\":" + (grav ? "true" : "false") + "}"); }
            prevReset = rs; prevGrav = gv;

            OpenVR.System.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseRawAndUncalibrated, 0, rawPoses);
            float[] hmd = Pos(rawPoses[0].mDeviceToAbsoluteTracking);
            float[] zr = Rot(zCur);
            float[] ax = { zr[0], zr[3], zr[6] }, up = { zr[1], zr[4], zr[7] }, fw = { zr[2], zr[5], zr[8] };   // Achsen des Spielbereichs im Roh-Tracking

            // ---------- 🚀 Space Flight ----------
            int fd = !flyOn ? -1 : fL && left != OpenVR.k_unTrackedDeviceIndexInvalid ? (int)left : fR && right != OpenVR.k_unTrackedDeviceIndexInvalid ? (int)right : -1;
            if (fd >= 0 && rawPoses[fd].bPoseIsValid)
            {
                float[] p = Pos(rawPoses[fd].mDeviceToAbsoluteTracking);
                if (flyDev == fd)
                {
                    float[] d = { p[0] - flyPrev[0], p[1] - flyPrev[1], p[2] - flyPrev[2] };
                    // Achsensperre im Spielbereich (X/Y/Z wie in VRChat), nicht im Roh-Tracking
                    float dx = lockX ? 0 : Dot(d, ax), dy = lockY ? 0 : Dot(d, up), dz = lockZ ? 0 : Dot(d, fw);
                    for (int i = 0; i < 3; i++) { d[i] = (ax[i] * dx + up[i] * dy + fw[i] * dz) * flyMul; vel[i] = vel[i] * 0.6f + d[i] / dt * 0.4f; }
                    zCur.m3 += d[0]; zCur.m7 += d[1]; zCur.m11 += d[2];
                    if (d[0] != 0 || d[1] != 0 || d[2] != 0) { spDirty = true; MarkMoved(); }
                }
                flyPrev = p; flyDev = fd;
            }
            else
            {
                flyDev = -1;
                if (flyOn && grav && spMoved)
                {
                    // Höhe gegenüber dem Ursprung entlang „oben“: < 0 heißt „ich schwebe“ → zurück zum Boden fallen
                    float[] off = { zCur.m3 - zOrig.m3, zCur.m7 - zOrig.m7, zCur.m11 - zOrig.m11 };
                    float h = Dot(off, up), vu = Dot(vel, up);
                    float fric = (float)Math.Exp(-1.5 * dt);
                    for (int i = 0; i < 3; i++) vel[i] = (vel[i] - up[i] * vu) * fric;   // waagerecht ausrollen
                    if (h < -0.001f) vu += gAcc * dt; else vu = 0;
                    float step = vu * dt;
                    if (h + step > 0) step = -h;   // landen, nicht durch den Boden
                    bool any = false;
                    for (int i = 0; i < 3; i++) { float m = vel[i] * dt + up[i] * step; if (Math.Abs(m) > 1e-6f) any = true; }
                    if (any)
                    {
                        zCur.m3 += vel[0] * dt + up[0] * step; zCur.m7 += vel[1] * dt + up[1] * step; zCur.m11 += vel[2] * dt + up[2] * step;
                        for (int i = 0; i < 3; i++) vel[i] += up[i] * (h + step >= 0 ? 0 : vu);
                        spDirty = true;
                    }
                }
                else { vel[0] = vel[1] = vel[2] = 0; }
            }

            // ---------- 🔄 Space Turn (Gieren um die Kopfposition) ----------
            int td = !turnOn ? -1 : tL && left != OpenVR.k_unTrackedDeviceIndexInvalid ? (int)left : tR && right != OpenVR.k_unTrackedDeviceIndexInvalid ? (int)right : -1;
            if (td >= 0 && rawPoses[td].bPoseIsValid)
            {
                float[] p = Pos(rawPoses[td].mDeviceToAbsoluteTracking), v = { p[0] - hmd[0], p[1] - hmd[1], p[2] - hmd[2] };
                float ang = (float)Math.Atan2(Dot(v, ax), Dot(v, fw));
                if (turnDev == td) turnPending += Wrap(ang - turnPrevAng) * turnMul * (turnInv ? -1 : 1);   // „Welt greifen“: die Welt dreht mit der Hand
                turnPrevAng = ang; turnDev = td;
            }
            else turnDev = -1;
            if (Math.Abs(turnPending) > 1e-5f)
            {
                float apply;
                if (turnStep > 0.5f) { float st = turnStep * (float)Math.PI / 180f; apply = Math.Abs(turnPending) >= st ? Math.Sign(turnPending) * st : 0; }
                else { apply = turnPending * (1 - Math.Min(0.95f, turnSmooth)); if (Math.Abs(turnPending) < 1e-4f) apply = turnPending; }
                if (apply != 0) { zCur = RotateAbout(zCur, AxisRot(up, apply), hmd); turnPending -= apply; spDirty = true; MarkMoved(); }
                if (turnDev < 0 && turnStep > 0.5f && Math.Abs(turnPending) < turnStep * Math.PI / 180f) turnPending = 0;   // Rest unter einer Stufe verwerfen
            }

            // ---------- 🧭 Space Walk (Pitch / Roll / Yaw nach der Handdrehung) ----------
            int wd = !walkOn ? -1 : wR && right != OpenVR.k_unTrackedDeviceIndexInvalid ? (int)right : wL && left != OpenVR.k_unTrackedDeviceIndexInvalid ? (int)left : -1;
            float pp = 0, yy = 0, rr = 0;
            if (wd >= 0 && rawPoses[wd].bPoseIsValid)
            {
                float[] hr = Rot(rawPoses[wd].mDeviceToAbsoluteTracking);
                if (walkDev == wd)
                {
                    // Änderung der Handdrehung, ausgedrückt in den Achsen des Spielbereichs
                    float[] dR = Mul3(T3(zr), Mul3(Mul3(hr, T3(walkPrevR)), zr));
                    pp = (dR[7] - dR[5]) / 2; yy = (dR[2] - dR[6]) / 2; rr = (dR[3] - dR[1]) / 2;
                    float k = walkMul * (walkInv ? -1 : 1);   // „Welt greifen“: die Welt folgt der Handdrehung
                    pp *= k; yy *= k; rr *= k;
                    if (lockP) pp = 0; if (lockR) rr = 0; if (lockYw) yy = 0;
                    walkVel[0] = pp / dt; walkVel[1] = yy / dt; walkVel[2] = rr / dt;
                }
                walkPrevR = hr; walkDev = wd;
            }
            else
            {
                walkDev = -1;
                if (walkMom && (Math.Abs(walkVel[0]) + Math.Abs(walkVel[1]) + Math.Abs(walkVel[2]) > 0.01f))
                {
                    float f = (float)Math.Exp(-1.2 * dt);
                    for (int i = 0; i < 3; i++) walkVel[i] *= f;
                    pp = walkVel[0] * dt; yy = walkVel[1] * dt; rr = walkVel[2] * dt;
                }
                else walkVel[0] = walkVel[1] = walkVel[2] = 0;
            }
            walkPend0 += pp; walkPend1 += yy; walkPend2 += rr;
            float sm = 1 - Math.Min(0.95f, walkSmooth);
            float ap = walkPend0 * sm, ay = walkPend1 * sm, ar = walkPend2 * sm;
            if (Math.Abs(ap) + Math.Abs(ay) + Math.Abs(ar) > 1e-6f)
            {
                walkPend0 -= ap; walkPend1 -= ay; walkPend2 -= ar;
                float[] r = Mul3(Mul3(AxisRot(ax, ap), AxisRot(up, ay)), AxisRot(fw, ar));
                zCur = RotateAbout(zCur, r, hmd);
                spDirty = true; MarkMoved();
            }

            SpaceApply();
            if (now - spReport > 250) { spReport = now; SpaceReport(); }
        }
        /** Versatz und Drehung gegenüber dem Ursprung an die App melden (nur bei Änderung) */
        static void SpaceReport()
        {
            if (!haveOrig) return;
            float[] o = Rot(zOrig), c = Rot(zCur), d = { zCur.m3 - zOrig.m3, zCur.m7 - zOrig.m7, zCur.m11 - zOrig.m11 };
            float[] ax = { o[0], o[3], o[6] }, up = { o[1], o[4], o[7] }, fw = { o[2], o[5], o[8] };
            float[] rel = Mul3(T3(o), c);   // Drehung relativ zum Ursprung (in seinen Achsen)
            double yaw = Math.Atan2(rel[2], rel[8]) * 180 / Math.PI, pitch = Math.Asin(Math.Max(-1, Math.Min(1, -rel[5]))) * 180 / Math.PI, roll = Math.Atan2(rel[3], rel[4]) * 180 / Math.PI;
            var ci = System.Globalization.CultureInfo.InvariantCulture;
            string j = "{\"ev\":\"space\",\"x\":" + (-Dot(d, ax)).ToString("0.00", ci) + ",\"y\":" + (-Dot(d, up)).ToString("0.00", ci) + ",\"z\":" + (-Dot(d, fw)).ToString("0.00", ci)
                + ",\"yaw\":" + yaw.ToString("0", ci) + ",\"pitch\":" + pitch.ToString("0", ci) + ",\"roll\":" + roll.ToString("0", ci) + ",\"grav\":" + (grav ? "true" : "false")
                + ",\"drag\":" + (flyDev >= 0 || turnDev >= 0 || walkDev >= 0 ? "true" : "false") + "}";
            if (j != spLastJson) { spLastJson = j; Out(j); }
        }
        static void SpaceCommand(string json)
        {
            bool B(string k, bool d) { var v = Num(json, k); return v.HasValue ? v.Value > 0 : d; }
            spOn = B("on", spOn); spLegacy = B("legacy", spLegacy);
            flyOn = B("fly", flyOn); flyHand = Str(json, "hand") ?? flyHand; flyMul = Math.Max(0.1f, Math.Min(5f, Num(json, "flymul") ?? flyMul));
            grav = B("grav", grav); gAcc = Math.Max(1f, Math.Min(30f, Num(json, "g") ?? gAcc)); lockX = B("lx", lockX); lockY = B("ly", lockY); lockZ = B("lz", lockZ);
            turnOn = B("turn", turnOn); turnMul = Math.Max(0.1f, Math.Min(4f, Num(json, "tmul") ?? turnMul)); turnSmooth = Math.Max(0f, Math.Min(0.95f, Num(json, "tsmooth") ?? turnSmooth));
            turnStep = Math.Max(0f, Math.Min(90f, Num(json, "tstep") ?? turnStep)); turnInv = B("tinv", turnInv);
            walkOn = B("walk", walkOn); walkMul = Math.Max(0.1f, Math.Min(4f, Num(json, "wmul") ?? walkMul)); walkSmooth = Math.Max(0f, Math.Min(0.95f, Num(json, "wsmooth") ?? walkSmooth));
            walkMom = B("wmom", walkMom); walkInv = B("winv", walkInv); lockP = B("lp", lockP); lockR = B("lr", lockR); lockYw = B("lyaw", lockYw);
            // gemerkter Ursprung aus der App (überlebt Abstürze): nur übernehmen, solange hier noch nichts bewegt wurde
            string orig = Str(json, "orig");
            if (!string.IsNullOrEmpty(orig) && !spMoved)
            {
                var p = orig.Split(',');
                if (p.Length == 12)
                {
                    var f = new float[12]; bool ok = true;
                    for (int i = 0; i < 12; i++) ok &= float.TryParse(p[i], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out f[i]);
                    if (ok) { zOrig = M(f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8], f[9], f[10], f[11]); haveOrig = true; var cs = OpenVR.ChaperoneSetup; if (cs != null) { cs.RevertWorkingCopy(); cs.GetWorkingStandingZeroPoseToRawTrackingPose(ref zCur); } spMoved = true; }
                }
            }
            if (!spOn && spMoved) SpaceReset();
            Out("{\"ev\":\"space_cfg\",\"on\":" + (spOn ? "true" : "false") + "}");
        }

        static HmdMatrix34_t M(float m0, float m1, float m2, float m3, float m4, float m5, float m6, float m7, float m8, float m9, float m10, float m11) =>
            new HmdMatrix34_t { m0 = m0, m1 = m1, m2 = m2, m3 = m3, m4 = m4, m5 = m5, m6 = m6, m7 = m7, m8 = m8, m9 = m9, m10 = m10, m11 = m11 };

        static void ApplyLayout()
        {
            var ov = OpenVR.Overlay;
            ov.SetOverlayWidthInMeters(hud, Math.Max(0.1f, Math.Min(3f, width)));
            ov.SetOverlayAlpha(hud, Math.Max(0.1f, Math.Min(1f, alpha)) * (interactive ? 1f : 0.55f));
            ov.SetOverlayAlpha(dash, 1f);
            if (mode == "wrist")
            {
                uint dev = OpenVR.System.GetTrackedDeviceIndexForControllerRole(hand == "right" ? ETrackedControllerRole.RightHand : ETrackedControllerRole.LeftHand);
                if (dev == OpenVR.k_unTrackedDeviceIndexInvalid) dev = 0;
                // leicht über dem Handgelenk, zum Gesicht geneigt (Drehung um X)
                double a = -tilt * Math.PI / 180; float c = (float)Math.Cos(a), s = (float)Math.Sin(a);
                float side = hand == "right" ? -offX : offX;
                var m = M(1, 0, 0, side, 0, c, -s, offY, 0, s, c, offZ);
                ov.SetOverlayTransformTrackedDeviceRelative(hud, dev, ref m);
            }
            else if (mode == "front")
            {
                var poses = new TrackedDevicePose_t[1];
                OpenVR.System.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
                var p = poses[0].mDeviceToAbsoluteTracking;
                float fx = -p.m2, fz = -p.m10, len = (float)Math.Sqrt(fx * fx + fz * fz);
                if (len < 0.001f) { fx = 0; fz = -1; len = 1; }
                fx /= len; fz /= len;
                // Overlay-Vorderseite (+Z) zeigt zum Kopf
                float sn = -fx, cs = -fz;
                var m = M(cs, 0, sn, p.m3 + fx * distance, 0, 1, 0, p.m7 + frontY, -sn, 0, cs, p.m11 + fz * distance);
                ov.SetOverlayTransformAbsolute(hud, ETrackingUniverseOrigin.TrackingUniverseStanding, ref m);
            }
            if (mode == "off" || !hudVisible) ov.HideOverlay(hud);
        }

        static void ReadInput()
        {
            var s = Console.OpenStandardInput();
            var head = new byte[5];
            try
            {
                while (running)
                {
                    if (!ReadAll(s, head, 5)) break;
                    int len = BitConverter.ToInt32(head, 1);
                    if (len < 0 || len > 64 * 1024 * 1024) break;
                    var data = new byte[len];
                    if (!ReadAll(s, data, len)) break;
                    if (head[0] == 1 && len >= 8)
                    {
                        uint w = BitConverter.ToUInt32(data, 0), h = BitConverter.ToUInt32(data, 4);
                        if (w * h * 4 != len - 8) continue;
                        var px = new byte[len - 8];
                        Buffer.BlockCopy(data, 8, px, 0, px.Length);
                        lock (Lock) { frame = px; fw = w; fh = h; frameNew = true; }
                    }
                    else if (head[0] == 3 && len >= 8)
                    {
                        uint w = BitConverter.ToUInt32(data, 0), h = BitConverter.ToUInt32(data, 4);
                        if (w * h * 4 != len - 8) continue;
                        var px = new byte[len - 8];
                        Buffer.BlockCopy(data, 8, px, 0, px.Length);
                        lock (Lock) { infoFrame = px; iw = w; ih = h; infoNew = true; }
                    }
                    else if (head[0] == 2)
                    {
                        string txt = Encoding.UTF8.GetString(data);
                        lock (Lock) { pendingCmd = pendingCmd == null ? txt : pendingCmd + "\n" + txt; }
                    }
                }
            }
            catch (Exception) { }
            running = false;    // App beendet → Overlay schließen
        }

        static bool ReadAll(Stream s, byte[] buf, int n)
        {
            int got = 0;
            while (got < n) { int r = s.Read(buf, got, n - got); if (r <= 0) return false; got += r; }
            return true;
        }
    }
}
