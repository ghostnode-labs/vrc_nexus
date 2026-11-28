// GhostNode – Editor-Werkzeug für die VIP-Tafel (Unity 2022.3, VRChat Worlds SDK mit integriertem UdonSharp, TextMeshPro 3.x).
// Menü „Tools ▸ GhostNode ▸ VIP-Tafel erstellen“: baut im geöffneten Projekt eine World-Space-Tafel im Neon-Stil
// (Überschrift, N Namensfelder mit TextMeshPro, optional Ko-fi-Bereich), hängt NexusVipBoard an (UdonSharpUndo.AddComponent),
// verknüpft alle Felder und speichert das Ganze als Prefab unter Assets/GhostNode/VipBoard/VipBoard.prefab.
// „Tools ▸ GhostNode ▸ VIP-Tafel in Szene einfügen“ setzt das Prefab (oder eine frisch gebaute Tafel) in die Szene.
// Bewusst ohne mitgeliefertes Prefab-YAML: so hängt nichts an fremden GUIDs (UdonBehaviour, TMP, UdonSharp-Programm),
// alles wird mit den Bausteinen DEINES Projekts erzeugt. Eigene Umsetzung.
#if UNITY_EDITOR
using System.IO;
using TMPro;
using UdonSharp;
using UdonSharpEditor;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDKBase;

namespace GhostNode.VipBoard.EditorTools
{
    public class NexusVipBoardBuilder : EditorWindow
    {
        const string Folder = "Assets/GhostNode/VipBoard";
        const string GenFolder = Folder + "/Generated";
        const string PrefabPath = Folder + "/VipBoard.prefab";

        string boardTitle = "VIP";
        int nameFields = 6;
        int columns = 6;
        bool kofiSection = false;
        string kofiTitle = "Ko-fi";
        int kofiFields = 6;
        string url1 = "";
        string url2 = "";
        int reloadMinutes = 10;
        Color neon = new Color(1f, 0.24f, 0.95f);      // Pink
        Color accent = new Color(0.22f, 0.84f, 0.9f);   // Cyan
        Color panel = new Color(0.03f, 0.02f, 0.08f, 0.88f);
        float metersWide = 4f;
        Vector2 scroll;

        [MenuItem("Tools/GhostNode/VIP-Tafel erstellen", false, 10)]
        static void Open()
        {
            NexusVipBoardBuilder w = GetWindow<NexusVipBoardBuilder>(true, "GhostNode VIP-Tafel", true);
            w.minSize = new Vector2(420, 520);
        }

        [MenuItem("Tools/GhostNode/VIP-Tafel in Szene einfügen", false, 11)]
        static void PlaceInScene()
        {
            GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            if (prefab == null)
            {
                NexusVipBoardBuilder tmp = CreateInstance<NexusVipBoardBuilder>();
                tmp.CreatePrefab(true);   // baut mit Standardwerten, speichert und lässt die Tafel in der Szene
                DestroyImmediate(tmp);
                return;
            }
            GameObject go = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            PlaceNearView(go);
            Undo.RegisterCreatedObjectUndo(go, "VIP-Tafel einfügen");
            Selection.activeGameObject = go;
        }

        void OnGUI()
        {
            scroll = EditorGUILayout.BeginScrollView(scroll);
            EditorGUILayout.LabelField("VIP-Tafel (Neon)", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox("Baut eine Tafel mit TextMeshPro-Feldern und dem UdonSharp-Verhalten NexusVipBoard und speichert sie als Prefab ("
                + PrefabPath + "). Alles lässt sich danach im Inspector ändern.", MessageType.Info);
            boardTitle = EditorGUILayout.TextField("Überschrift", boardTitle);
            nameFields = EditorGUILayout.IntSlider("Namensfelder", nameFields, 1, 40);
            columns = EditorGUILayout.IntSlider("Spalten", columns, 1, 10);
            kofiSection = EditorGUILayout.Toggle("Ko-fi-Bereich", kofiSection);
            if (kofiSection)
            {
                EditorGUI.indentLevel++;
                kofiTitle = EditorGUILayout.TextField("Überschrift", kofiTitle);
                kofiFields = EditorGUILayout.IntSlider("Felder", kofiFields, 1, 40);
                EditorGUI.indentLevel--;
            }
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Adressen (aus Admin → VIP-Listen kopieren)", EditorStyles.boldLabel);
            url1 = EditorGUILayout.TextField(new GUIContent("URL 1 (Gist)", "https://gist.githubusercontent.com/… – vertrauenswürdig, lädt für alle"), url1);
            url2 = EditorGUILayout.TextField(new GUIContent("URL 2 (direkt)", "https://…/vip.php?l=… – nur mit „Allow Untrusted URLs“"), url2);
            reloadMinutes = EditorGUILayout.IntSlider("Neu laden alle … min (0 = aus)", reloadMinutes, 0, 120);
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Aussehen", EditorStyles.boldLabel);
            neon = EditorGUILayout.ColorField("Neon (Überschrift/Rahmen)", neon);
            accent = EditorGUILayout.ColorField("Akzent (Namensfelder)", accent);
            panel = EditorGUILayout.ColorField("Hintergrund", panel);
            metersWide = EditorGUILayout.Slider("Breite in der Welt (m)", metersWide, 0.5f, 20f);
            EditorGUILayout.Space();
            if (GUILayout.Button("Prefab erstellen", GUILayout.Height(28))) CreatePrefab(false);
            if (GUILayout.Button("Prefab erstellen + in Szene einfügen", GUILayout.Height(28))) CreatePrefab(true);
            EditorGUILayout.EndScrollView();
        }

        /// <summary>Tafel bauen und als Prefab speichern; optional verbunden in der Szene lassen.</summary>
        bool CreatePrefab(bool keepInScene)
        {
            if (!EnsureProgramAsset()) return false;
            TMP_FontAsset font = TMP_Settings.defaultFontAsset;
            if (font == null)
            {
                EditorUtility.DisplayDialog("TextMeshPro fehlt", "Bitte zuerst „Window ▸ TextMeshPro ▸ Import TMP Essential Resources“ ausführen.", "OK");
                return false;
            }
            if (AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath) != null
                && !EditorUtility.DisplayDialog("Prefab ersetzen?", PrefabPath + " gibt es schon. Ersetzen? (Tafeln in Szenen, die das Prefab nutzen, übernehmen die Änderung.)", "Ersetzen", "Abbrechen"))
                return false;
            EnsureFolder(Folder);
            EnsureFolder(GenFolder);
            GameObject root = Build(font);
            bool ok;
            if (keepInScene)
            {
                PrefabUtility.SaveAsPrefabAssetAndConnect(root, PrefabPath, InteractionMode.UserAction, out ok);
                PlaceNearView(root);
                Undo.RegisterCreatedObjectUndo(root, "VIP-Tafel erstellen");
                Selection.activeGameObject = root;
            }
            else
            {
                PrefabUtility.SaveAsPrefabAsset(root, PrefabPath, out ok);
                DestroyImmediate(root);
                Selection.activeObject = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            }
            if (!ok) EditorUtility.DisplayDialog("Fehler", "Prefab konnte nicht gespeichert werden – siehe Konsole.", "OK");
            return ok;
        }

        // ------------------------------------------------------------------ Aufbau

        GameObject Build(TMP_FontAsset font)
        {
            const float pad = 40f, gap = 20f, boxW = 360f, boxH = 90f, titleH = 150f, subH = 100f, statusH = 60f;
            int cols = Mathf.Clamp(columns, 1, 10);
            int rows = Mathf.CeilToInt(nameFields / (float)cols);
            int krows = kofiSection ? Mathf.CeilToInt(kofiFields / (float)cols) : 0;
            float width = pad * 2 + cols * boxW + (cols - 1) * gap;
            float height = pad + titleH + rows * (boxH + gap) + (kofiSection ? subH + krows * (boxH + gap) : 0f) + statusH + pad;

            Material titleMat = GlowMaterial(font, neon, "VipNeonTitle");
            Material nameMat = GlowMaterial(font, accent, "VipNeonName");

            GameObject root = new GameObject("GhostNode VIP-Tafel", typeof(RectTransform));
            Canvas canvas = root.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            CanvasScaler scaler = root.AddComponent<CanvasScaler>();
            scaler.dynamicPixelsPerUnit = 10f;
            RectTransform rt = (RectTransform)root.transform;
            rt.sizeDelta = new Vector2(width, height);
            float scale = metersWide / width;
            rt.localScale = new Vector3(scale, scale, scale);

            // Hintergrund mit Neon-Rahmen
            Image bg = NewImage(root.transform, "Hintergrund", panel);
            Stretch((RectTransform)bg.transform);
            Outline frame = bg.gameObject.AddComponent<Outline>();
            frame.effectColor = neon;
            frame.effectDistance = new Vector2(6f, -6f);

            float y = pad;
            TextMeshProUGUI title = NewText(root.transform, "Überschrift", boardTitle, font, titleMat, neon, 110f, FontStyles.Bold | FontStyles.UpperCase);
            Place((RectTransform)title.transform, pad, y, width - 2 * pad, titleH);
            y += titleH;

            TextMeshProUGUI[] main = BuildBoxes(root.transform, "Namen", nameFields, cols, pad, ref y, boxW, boxH, gap, font, nameMat);
            TextMeshProUGUI kofiHeader = null;
            TextMeshProUGUI[] kofi = new TextMeshProUGUI[0];
            if (kofiSection)
            {
                kofiHeader = NewText(root.transform, "Ko-fi-Überschrift", kofiTitle, font, titleMat, neon, 64f, FontStyles.Bold);
                Place((RectTransform)kofiHeader.transform, pad, y, width - 2 * pad, subH);
                y += subH;
                kofi = BuildBoxes(root.transform, "Ko-fi-Namen", kofiFields, cols, pad, ref y, boxW, boxH, gap, font, nameMat);
            }
            TextMeshProUGUI status = NewText(root.transform, "Status", "Lade …", font, null, new Color(1f, 1f, 1f, 0.7f), 30f, FontStyles.Italic);
            Place((RectTransform)status.transform, pad, y, width * 0.6f, statusH);
            TextMeshProUGUI pageMain = NewText(root.transform, "Seite", "", font, null, new Color(1f, 1f, 1f, 0.7f), 30f, FontStyles.Normal);
            pageMain.alignment = TextAlignmentOptions.Right;
            Place((RectTransform)pageMain.transform, width * 0.6f, y, width * 0.4f - pad, statusH);

            // UdonSharp-Verhalten anhängen (offizielle Editor-API) und verknüpfen
            NexusVipBoard board = UdonSharpUndo.AddComponent<NexusVipBoard>(root);
            board.urls = Urls();
            board.reloadMinutes = reloadMinutes;
            board.mainFields = main;
            board.mainHeader = title;
            board.mainTitle = boardTitle;
            board.mainPageText = pageMain;
            board.secondFields = kofi;
            board.secondHeader = kofiHeader;
            board.secondTitle = kofiTitle;
            board.secondGroups = kofiSection ? "KOFI" : "";
            board.statusText = status;
            UdonSharpEditorUtility.CopyProxyToUdon(board);
            return root;
        }

        TextMeshProUGUI[] BuildBoxes(Transform parent, string name, int count, int cols, float pad, ref float y, float boxW, float boxH, float gap, TMP_FontAsset font, Material mat)
        {
            GameObject group = new GameObject(name, typeof(RectTransform));
            group.transform.SetParent(parent, false);
            Stretch((RectTransform)group.transform);
            TextMeshProUGUI[] fields = new TextMeshProUGUI[count];
            for (int i = 0; i < count; i++)
            {
                int r = i / cols, c = i % cols;
                Image box = NewImage(group.transform, "Feld " + (i + 1), new Color(0f, 0f, 0f, 0.35f));
                Place((RectTransform)box.transform, pad + c * (boxW + gap), y + r * (boxH + gap), boxW, boxH);
                Outline o = box.gameObject.AddComponent<Outline>();
                o.effectColor = accent;
                o.effectDistance = new Vector2(3f, -3f);
                TextMeshProUGUI t = NewText(box.transform, "Name", "Placeholder", font, mat, accent, 44f, FontStyles.Normal);
                Stretch((RectTransform)t.transform, 12f);
                t.enableAutoSizing = true;
                t.fontSizeMin = 18f;
                t.fontSizeMax = 44f;
                t.overflowMode = TextOverflowModes.Ellipsis;
                fields[i] = t;
            }
            y += Mathf.CeilToInt(count / (float)cols) * (boxH + gap);
            return fields;
        }

        VRCUrl[] Urls()
        {
            int n = (url1.Trim().Length > 0 ? 1 : 0) + (url2.Trim().Length > 0 ? 1 : 0);
            VRCUrl[] u = new VRCUrl[n];
            int i = 0;
            if (url1.Trim().Length > 0) u[i++] = new VRCUrl(url1.Trim());   // im Editor erlaubt, zur Laufzeit nicht
            if (url2.Trim().Length > 0) u[i++] = new VRCUrl(url2.Trim());
            return u;
        }

        // ------------------------------------------------------------------ Hilfen

        static Image NewImage(Transform parent, string name, Color color)
        {
            GameObject go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            Image img = go.AddComponent<Image>();
            img.color = color;
            img.raycastTarget = false;
            return img;
        }

        static TextMeshProUGUI NewText(Transform parent, string name, string text, TMP_FontAsset font, Material mat, Color color, float size, FontStyles style)
        {
            GameObject go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            TextMeshProUGUI t = go.AddComponent<TextMeshProUGUI>();
            t.font = font;
            if (mat != null) t.fontSharedMaterial = mat;
            t.text = text;
            t.color = color;
            t.fontSize = size;
            t.fontStyle = style;
            t.alignment = TextAlignmentOptions.Center;
            t.raycastTarget = false;
            return t;
        }

        /// <summary>oben-links verankert, y nach unten</summary>
        static void Place(RectTransform r, float x, float y, float w, float h)
        {
            r.anchorMin = new Vector2(0f, 1f);
            r.anchorMax = new Vector2(0f, 1f);
            r.pivot = new Vector2(0f, 1f);
            r.anchoredPosition = new Vector2(x, -y);
            r.sizeDelta = new Vector2(w, h);
        }

        static void Stretch(RectTransform r, float inset = 0f)
        {
            r.anchorMin = Vector2.zero;
            r.anchorMax = Vector2.one;
            r.offsetMin = new Vector2(inset, inset);
            r.offsetMax = new Vector2(-inset, -inset);
        }

        /// <summary>Kopie des Schrift-Materials mit Glow (TextMeshPro/Distance Field), als Asset gespeichert.</summary>
        static Material GlowMaterial(TMP_FontAsset font, Color glow, string name)
        {
            Material m = new Material(font.material);
            Shader sdf = Shader.Find("TextMeshPro/Distance Field");
            if (sdf != null) m.shader = sdf;
            m.EnableKeyword("GLOW_ON");
            if (m.HasProperty("_GlowColor")) m.SetColor("_GlowColor", new Color(glow.r, glow.g, glow.b, 0.75f));
            if (m.HasProperty("_GlowOuter")) m.SetFloat("_GlowOuter", 0.45f);
            if (m.HasProperty("_GlowPower")) m.SetFloat("_GlowPower", 0.8f);
            if (m.HasProperty("_GlowOffset")) m.SetFloat("_GlowOffset", 0f);
            m.name = name;
            string path = GenFolder + "/" + name + ".mat";
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(m, path);
            return m;
        }

        static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        static void PlaceNearView(GameObject go)
        {
            SceneView view = SceneView.lastActiveSceneView;
            if (view != null) go.transform.position = view.pivot;
        }

        /// <summary>UdonSharp braucht zu jedem Skript eine Programm-Datei (.asset). Fehlt sie, wird sie angelegt und kompiliert.</summary>
        static bool EnsureProgramAsset()
        {
            if (UdonSharpEditorUtility.GetUdonSharpProgramAsset(typeof(NexusVipBoard)) != null) return true;
            MonoScript script = null;
            foreach (string guid in AssetDatabase.FindAssets("NexusVipBoard t:MonoScript"))
            {
                MonoScript s = AssetDatabase.LoadAssetAtPath<MonoScript>(AssetDatabase.GUIDToAssetPath(guid));
                if (s != null && s.GetClass() == typeof(NexusVipBoard)) { script = s; break; }
            }
            if (script == null)
            {
                EditorUtility.DisplayDialog("Skript fehlt", "NexusVipBoard.cs wurde nicht gefunden – Paket vollständig importiert?", "OK");
                return false;
            }
            string dir = Path.GetDirectoryName(AssetDatabase.GetAssetPath(script)).Replace('\\', '/');
            UdonSharpProgramAsset program = CreateInstance<UdonSharpProgramAsset>();
            program.sourceCsScript = script;
            AssetDatabase.CreateAsset(program, dir + "/NexusVipBoard.asset");
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            UdonSharpProgramAsset.CompileAllCsPrograms(true);
            if (UdonSharpEditorUtility.GetUdonSharpProgramAsset(typeof(NexusVipBoard)) != null) return true;
            EditorUtility.DisplayDialog("Fast fertig", "Die UdonSharp-Programmdatei wurde angelegt (" + dir + "/NexusVipBoard.asset). Unity kompiliert gerade – bitte den Menüpunkt gleich noch einmal ausführen.", "OK");
            return false;
        }
    }
}
#endif
