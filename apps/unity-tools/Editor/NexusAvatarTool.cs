// VRC Nexus – Avatar-Werkzeug für den Unity-Editor (VRChat SDK 3 Avatars).
// Menü: Tools ▸ VRC Nexus ▸ Avatar-Setup
//  - prüft das Parameter-Budget (Synced-Bits) des Avatars
//  - erkennt SPS (VRCFury), OGB/OscGB-Komponenten und PCS-Parameter nur anhand von Namen – keine Fremd-Abhängigkeit
//  - legt die VRC-Nexus-Parameter NX/Toy, NX/Lust, NX/Consent an (Expression-Parameter + FX-Controller), mit Undo
//  - optional eine kleine FX-Ebene „NX Consent“, die einen eigenen Ampel-Anzeiger (Objekte) schaltet
// Eigene Umsetzung, keine Abhängigkeiten außer Unity und dem VRChat-SDK.
#if VRC_SDK_VRCSDK3 && !UDON
#define NX_AVATARS   // nur im Avatar-Projekt (Welt-SDK definiert UDON)
#endif
#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
#if NX_AVATARS
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Avatars.ScriptableObjects;
using VRC.SDKBase;
#endif

namespace GhostNode.VrcNexus.EditorTools
{
    public class NexusAvatarTool : EditorWindow
    {
        const int BudgetBits = 256;

        struct NxParam
        {
            public string Name; public string Label; public string Help;
#if NX_AVATARS
            public VRCExpressionParameters.ValueType Type;
#endif
            public AnimatorControllerParameterType AnimType;
            public bool DefaultSynced;
        }

        static readonly NxParam[] NxParams =
        {
#if NX_AVATARS
            new NxParam { Name = "NX/Toy", Label = "NX/Toy (Float)", Help = "aktuelle Gerätestärke 0–1, von VRC Nexus gesendet", Type = VRCExpressionParameters.ValueType.Float, AnimType = AnimatorControllerParameterType.Float, DefaultSynced = false },
            new NxParam { Name = "NX/Lust", Label = "NX/Lust (Float)", Help = "Erregungswert 0–1 (Erröten, Atmung, Partikel …)", Type = VRCExpressionParameters.ValueType.Float, AnimType = AnimatorControllerParameterType.Float, DefaultSynced = false },
            new NxParam { Name = "NX/Consent", Label = "NX/Consent (Int)", Help = "Ampel: 0 = grün, 1 = gelb, 2 = rot – synchron, damit andere sie sehen", Type = VRCExpressionParameters.ValueType.Int, AnimType = AnimatorControllerParameterType.Int, DefaultSynced = true },
#endif
        };

        GameObject avatarRoot;
        readonly Dictionary<string, bool> want = new Dictionary<string, bool>();
        readonly Dictionary<string, bool> synced = new Dictionary<string, bool>();
        bool addToFx = true, addConsentLayer;
        GameObject green, yellow, red;
        Vector2 scroll;
        Report report;

        class Report
        {
            public int usedBits, paramCount;
            public List<string> sps = new List<string>(), ogb = new List<string>(), pcs = new List<string>(), nx = new List<string>(), layers = new List<string>();
            public List<string> warnings = new List<string>();
        }

        [MenuItem("Tools/VRC Nexus/Avatar-Setup")]
        public static void Open() { GetWindow<NexusAvatarTool>("VRC Nexus").minSize = new Vector2(420, 460); }

        void OnEnable()
        {
            foreach (var p in NxParams) { want[p.Name] = true; synced[p.Name] = p.DefaultSynced; }
            if (Selection.activeGameObject) Pick(Selection.activeGameObject);
        }

        void OnSelectionChange() { if (Selection.activeGameObject && Selection.activeGameObject != avatarRoot) { Pick(Selection.activeGameObject); Repaint(); } }

        void Pick(GameObject go)
        {
#if NX_AVATARS
            var d = go ? go.GetComponentInParent<VRCAvatarDescriptor>() : null;
            if (d) { avatarRoot = d.gameObject; report = Analyze(d); }
#endif
        }

        void OnGUI()
        {
            scroll = EditorGUILayout.BeginScrollView(scroll);
            EditorGUILayout.LabelField("VRC Nexus – Avatar-Setup", EditorStyles.boldLabel);
#if !NX_AVATARS
            EditorGUILayout.HelpBox("Das VRChat Avatars SDK 3 ist in diesem Projekt nicht installiert.", MessageType.Error);
            EditorGUILayout.EndScrollView();
            return;
#else
            var picked = (GameObject)EditorGUILayout.ObjectField("Avatar", avatarRoot, typeof(GameObject), true);
            if (picked != avatarRoot) { avatarRoot = picked; report = null; Pick(picked); }
            var desc = avatarRoot ? avatarRoot.GetComponent<VRCAvatarDescriptor>() : null;
            if (!desc) { EditorGUILayout.HelpBox("Avatar mit VRC Avatar Descriptor in der Szene auswählen.", MessageType.Info); EditorGUILayout.EndScrollView(); return; }
            if (report == null || GUILayout.Button("Neu prüfen")) report = Analyze(desc);

            // ---------- Prüfung ----------
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Prüfung", EditorStyles.boldLabel);
            var r = report;
            var ratio = Mathf.Clamp01(r.usedBits / (float)BudgetBits);
            var rect = GUILayoutUtility.GetRect(18, 18, "TextField");
            EditorGUI.ProgressBar(rect, ratio, "Parameter-Budget: " + r.usedBits + " / " + BudgetBits + " Bits (" + r.paramCount + " Parameter)");
            Line("SPS (VRCFury Plug/Socket)", r.sps);
            Line("OGB / OscGB", r.ogb);
            Line("PCS-Parameter", r.pcs);
            Line("Vorhandene NX-Parameter", r.nx);
            Line("FX-Ebenen", r.layers);
            foreach (var w in r.warnings) EditorGUILayout.HelpBox(w, MessageType.Warning);

            // ---------- Parameter anlegen ----------
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("VRC-Nexus-Parameter anlegen", EditorStyles.boldLabel);
            int extra = 0;
            foreach (var p in NxParams)
            {
                bool exists = r.nx.Contains(p.Name);
                using (new EditorGUI.DisabledScope(exists))
                using (new EditorGUILayout.HorizontalScope())
                {
                    want[p.Name] = EditorGUILayout.ToggleLeft(new GUIContent(p.Label + (exists ? "  ✔ vorhanden" : ""), p.Help), want[p.Name] && !exists, GUILayout.Width(240));
                    synced[p.Name] = EditorGUILayout.ToggleLeft("synchron", synced[p.Name], GUILayout.Width(90));
                }
                if (want[p.Name] && !exists && synced[p.Name]) extra += Bits(p.Type);
            }
            EditorGUILayout.HelpBox("Nicht synchrone Parameter kosten kein Budget – VRC Nexus setzt sie lokal per OSC. Synchron nur, wenn andere die Wirkung sehen sollen (z. B. die Consent-Ampel).", MessageType.None);
            if (r.usedBits + extra > BudgetBits) EditorGUILayout.HelpBox("Zu wenig Budget: " + (r.usedBits + extra) + " / " + BudgetBits + " Bits.", MessageType.Error);
            addToFx = EditorGUILayout.ToggleLeft("auch im FX-Controller anlegen (für eigene Animationen)", addToFx);
            addConsentLayer = EditorGUILayout.ToggleLeft("FX-Ebene „NX Consent“ für einen eigenen Ampel-Anzeiger", addConsentLayer);
            if (addConsentLayer)
            {
                EditorGUI.indentLevel++;
                green = (GameObject)EditorGUILayout.ObjectField("Grün-Objekt", green, typeof(GameObject), true);
                yellow = (GameObject)EditorGUILayout.ObjectField("Gelb-Objekt", yellow, typeof(GameObject), true);
                red = (GameObject)EditorGUILayout.ObjectField("Rot-Objekt", red, typeof(GameObject), true);
                EditorGUI.indentLevel--;
            }
            using (new EditorGUI.DisabledScope(r.usedBits + extra > BudgetBits))
                if (GUILayout.Button("Anlegen", GUILayout.Height(28))) { Apply(desc); report = Analyze(desc); }
            EditorGUILayout.EndScrollView();
#endif
        }

        static void Line(string label, List<string> items)
        {
            EditorGUILayout.LabelField(label, items.Count == 0 ? "–" : items.Count + "×", EditorStyles.label);
            if (items.Count > 0) EditorGUILayout.LabelField(string.Join(", ", items.Take(12)) + (items.Count > 12 ? " …" : ""), EditorStyles.wordWrappedMiniLabel);
        }

#if NX_AVATARS
        static int Bits(VRCExpressionParameters.ValueType t) => t == VRCExpressionParameters.ValueType.Bool ? 1 : 8;

        static AnimatorController Fx(VRCAvatarDescriptor d)
        {
            if (d.baseAnimationLayers == null) return null;
            foreach (var l in d.baseAnimationLayers)
                if (l.type == VRCAvatarDescriptor.AnimLayerType.FX && !l.isDefault && l.animatorController) return l.animatorController as AnimatorController;
            return null;
        }

        static Report Analyze(VRCAvatarDescriptor d)
        {
            var r = new Report();
            var ps = d.expressionParameters;
            if (ps && ps.parameters != null)
            {
                foreach (var p in ps.parameters.Where(p => p != null && !string.IsNullOrEmpty(p.name)))
                {
                    r.paramCount++;
                    if (p.networkSynced) r.usedBits += Bits(p.valueType);
                    if (p.name.StartsWith("NX/")) r.nx.Add(p.name);
                    if (p.name.IndexOf("PCS", StringComparison.OrdinalIgnoreCase) >= 0) r.pcs.Add(p.name);
                    if (p.name.StartsWith("OGB/")) r.ogb.Add(p.name);
                }
            }
            else r.warnings.Add("Keine Expression-Parameter zugewiesen – beim Anlegen wird eine neue Datei erstellt.");
            // Komponenten nur am Typnamen erkennen (keine Abhängigkeit auf VRCFury/OGB)
            foreach (var c in d.GetComponentsInChildren<Component>(true))
            {
                if (!c) continue;
                var n = c.GetType().Name;
                if (n.Contains("HapticPlug") || n.Contains("HapticSocket")) r.sps.Add(c.gameObject.name + (n.Contains("Plug") ? " (Plug)" : " (Socket)"));
                else if (n.StartsWith("OGB") || n.Contains("OscGB") || n.Contains("Orifice") || n.Contains("Penetrator")) r.ogb.Add(c.gameObject.name);
            }
            var fx = Fx(d);
            if (fx)
            {
                r.layers.AddRange(fx.layers.Select(l => l.name));
                foreach (var p in fx.parameters) { if (p.name.StartsWith("NX/") && !r.nx.Contains(p.name)) r.warnings.Add(p.name + " ist im FX-Controller, aber nicht in den Expression-Parametern – VRC Nexus kann ihn so nicht setzen."); }
                if (fx.layers.Length > 0 && fx.layers.Any(l => l.stateMachine && l.stateMachine.states.Any(s => s.state && s.state.writeDefaultValues)) && fx.layers.Any(l => l.stateMachine && l.stateMachine.states.Any(s => s.state && !s.state.writeDefaultValues)))
                    r.warnings.Add("Write Defaults ist im FX-Controller gemischt – das kann Animationen stören.");
            }
            else r.warnings.Add("Kein eigener FX-Controller – Parameter werden nur als Expression-Parameter angelegt.");
            if (r.usedBits > BudgetBits) r.warnings.Add("Budget überschritten: " + r.usedBits + " / " + BudgetBits + " Bits.");
            r.sps = r.sps.Distinct().ToList(); r.ogb = r.ogb.Distinct().ToList();
            return r;
        }

        void Apply(VRCAvatarDescriptor d)
        {
            Undo.RecordObject(d, "VRC Nexus Parameter");
            var ps = d.expressionParameters;
            if (!ps)
            {
                ps = CreateInstance<VRCExpressionParameters>();
                ps.parameters = new VRCExpressionParameters.Parameter[0];
                var path = AssetDatabase.GenerateUniqueAssetPath("Assets/" + d.gameObject.name + "_Parameters.asset");
                AssetDatabase.CreateAsset(ps, path);
                d.customExpressions = true; d.expressionParameters = ps;
            }
            Undo.RecordObject(ps, "VRC Nexus Parameter");
            var list = (ps.parameters ?? new VRCExpressionParameters.Parameter[0]).ToList();
            var fx = addToFx ? Fx(d) : null;
            if (fx) Undo.RecordObject(fx, "VRC Nexus Parameter");
            int added = 0;
            foreach (var p in NxParams)
            {
                if (!want[p.Name]) continue;
                if (!list.Any(x => x != null && x.name == p.Name))
                {
                    list.Add(new VRCExpressionParameters.Parameter { name = p.Name, valueType = p.Type, defaultValue = 0, saved = false, networkSynced = synced[p.Name] });
                    added++;
                }
                if (fx && fx.parameters.All(x => x.name != p.Name)) fx.AddParameter(p.Name, p.AnimType);
            }
            ps.parameters = list.ToArray();
            EditorUtility.SetDirty(ps);
            if (fx && addConsentLayer) AddConsentLayer(fx);
            if (fx) EditorUtility.SetDirty(fx);
            AssetDatabase.SaveAssets();
            Debug.Log("[VRC Nexus] " + added + " Parameter angelegt" + (fx ? " (auch im FX-Controller)" : "") + ".");
        }

        /// <summary>Ebene „NX Consent“: drei Zustände, die je ein Objekt einschalten (WD aus, eigene Clips im Ordner des Controllers).</summary>
        void AddConsentLayer(AnimatorController fx)
        {
            if (fx.layers.Any(l => l.name == "NX Consent")) { Debug.Log("[VRC Nexus] Ebene „NX Consent“ gibt es schon."); return; }
            if (fx.parameters.All(x => x.name != "NX/Consent")) fx.AddParameter("NX/Consent", AnimatorControllerParameterType.Int);
            var dir = System.IO.Path.GetDirectoryName(AssetDatabase.GetAssetPath(fx));
            var objs = new[] { green, yellow, red };
            var names = new[] { "Grün", "Gelb", "Rot" };
            var sm = new AnimatorStateMachine { name = "NX Consent", hideFlags = HideFlags.HideInHierarchy };
            AssetDatabase.AddObjectToAsset(sm, fx);
            for (int i = 0; i < 3; i++)
            {
                var clip = new AnimationClip { name = "NX Consent " + names[i] };
                for (int j = 0; j < 3; j++)
                {
                    if (!objs[j]) continue;
                    var rel = AnimationUtility.CalculateTransformPath(objs[j].transform, avatarRoot.transform);
                    clip.SetCurve(rel, typeof(GameObject), "m_IsActive", AnimationCurve.Constant(0, 1f / 60f, i == j ? 1 : 0));
                }
                AssetDatabase.CreateAsset(clip, AssetDatabase.GenerateUniqueAssetPath(dir + "/NX Consent " + names[i] + ".anim"));
                var st = sm.AddState(names[i], new Vector3(260, 60 + i * 70));
                st.motion = clip; st.writeDefaultValues = false;
                var tr = sm.AddAnyStateTransition(st);
                tr.hasExitTime = false; tr.duration = 0; tr.canTransitionToSelf = false;
                tr.AddCondition(AnimatorConditionMode.Equals, i, "NX/Consent");
                if (i == 0) sm.defaultState = st;
            }
            fx.AddLayer(new AnimatorControllerLayer { name = "NX Consent", defaultWeight = 1, stateMachine = sm });
        }
#endif
    }
}
#endif
