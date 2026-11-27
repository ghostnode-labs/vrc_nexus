package dev.ghostnode.nexuspet;

/**
 * Eigene Pixel-Figuren (16×16) – reines Java, liefert ARGB-Pixel; gezeichnet wird in PetView/Widget.
 * Jede Form = Grundkörper je Stufe + Farben + Zubehör (Heiligenschein, Krone, Hörner …).
 * Zeichen: . leer · o Umriss · b Körper · l Glanz · e Auge · c Wange · a Akzent
 */
public final class Sprites {
    private Sprites() {}

    static final String[] EGG = {
        "................",
        "......oooo......",
        ".....obbbbo.....",
        "....obblbbbo....",
        "...obbbbbabbo...",
        "...obbabbbbbo...",
        "..obbbbbbbbabo..",
        "..obabbbbbbbbo..",
        "..obbbbbabbbbo..",
        "..obbbbbbbbabo..",
        "..obbabbbbbbbo..",
        "...obbbbbabbo...",
        "...obbbbbbbbo...",
        "....oobbbboo....",
        "......oooo......",
        "................" };
    static final String[] BABY = {
        "................",
        "................",
        "................",
        "................",
        "................",
        "......oooo......",
        ".....obbbbo.....",
        "....oblbbbbo....",
        "...obebbbbebo...",
        "...obebbbbebo...",
        "...obcbbbbcbo...",
        "...obbbbbbbbo...",
        "....obbbbbbo....",
        ".....oooooo.....",
        "................",
        "................" };
    static final String[] CHILD = {
        "................",
        "................",
        "................",
        "......oooo......",
        ".....obbbbo.....",
        "....oblbbbbo....",
        "...obbbbbbbbo...",
        "...obebbbbebo...",
        "...obebbbbebo...",
        "...obcbbbbcbo...",
        "...obbbbbbbbo...",
        "...obbbbbbbbo...",
        "...obbbbbbbbo...",
        "...obobbobbob...",
        "...o.oo.oo.o....",
        "................" };
    static final String[] TEEN = {
        "................",
        "....o......o....",
        "...obo....obo...",
        "...obboooobbo...",
        "...obbbbbbbbo...",
        "..oblbbbbbbbbo..",
        "..obbbbbbbbbbo..",
        "..obbebbbbebbo..",
        "..obbebbbbebbo..",
        "..obcbbbbbbcbo..",
        "..obbbbbbbbbbo..",
        ".oobbbbbbbbbbo..",
        "obbobbbbbbbbbo..",
        ".oobbbbbbbbbbo..",
        "..obobbobbobbo..",
        "..o.oo.oo.oo.o.." };
    static final String[] ADULT = {
        "................",
        ".....oooooo.....",
        "....obbbbbbo....",
        "...obblbbbbbo...",
        "..obbbbbbbbbbo..",
        "..obbbbbbbbbbo..",
        "..obbebbbbebbo..",
        "..obbebbbbebbo..",
        ".oobcbbbbbbcbo..",
        "obbobbbbbbbbboo.",
        ".oobbbbbbbbbbbbo",
        "..obbbbbbbbbboo.",
        "..obbbbbbbbbbo..",
        "..obbbbbbbbbbo..",
        "..obobbobbobbo..",
        "..o.oo.oo.oo.o.." };

    /** Farben: Umriss, Körper, Glanz, Auge, Wange, Akzent */
    static int[] palette(String form) {
        switch (form) {
            case "ei": return pal(0xFF2B2140, 0xFFF4E9FF, 0xFFFFFFFF, 0xFF1A1426, 0xFFFFB3C8, 0xFF38D5E6);
            case "flimmi": return pal(0xFF1E3A44, 0xFFC9F6FF, 0xFFFFFFFF, 0xFF0E1A22, 0xFFFF9EB5, 0xFF38D5E6);
            case "wispel": return pal(0xFF1D3B47, 0xFF9DEBF7, 0xFFE9FCFF, 0xFF0B1820, 0xFFFF9EB5, 0xFF38D5E6);
            case "nebelchen": return pal(0xFF33363F, 0xFFB7BCC7, 0xFFE3E6EC, 0xFF15171C, 0xFFE59AAE, 0xFF7A8794);
            case "spukli": return pal(0xFF2C2050, 0xFFB9A6FF, 0xFFEDE6FF, 0xFF120C24, 0xFFFF9EC4, 0xFFF3C262);
            case "rumpel": return pal(0xFF40261A, 0xFFF2A766, 0xFFFFE0BF, 0xFF1F120B, 0xFFE8737C, 0xFF8A4B2A);
            case "lumina": return pal(0xFF3A3010, 0xFFFFF4C2, 0xFFFFFFFF, 0xFF221B06, 0xFFFFB0A0, 0xFFF3C262);
            case "glimmer": return pal(0xFF173A35, 0xFF8FF0D8, 0xFFE4FFF8, 0xFF0A1C19, 0xFFFF9EB5, 0xFFFFFFFF);
            case "schattling": return pal(0xFF0D0A14, 0xFF4A3C66, 0xFF7E6BA6, 0xFFFF5C7A, 0xFF8E4A6E, 0xFFFF5C7A);
            case "polterkoenig": return pal(0xFF3E1515, 0xFFFF8A80, 0xFFFFD3CF, 0xFF1F0A0A, 0xFFFFD0A0, 0xFFF3C262);
            case "klirr": return pal(0xFF1E2329, 0xFF9AA7B4, 0xFFD5DEE6, 0xFF0B0E11, 0xFFC9909C, 0xFF5B6773);
            case "nexie": return pal(0xFF0C2B33, 0xFF38D5E6, 0xFFDFFBFF, 0xFF06141A, 0xFFF3C262, 0xFFF3C262);
            case "urgeist": return pal(0xFF2A2A2E, 0xFFE8E4DA, 0xFFFFFFFF, 0xFF141416, 0xFFE0B4B4, 0xFFB0A898);
            default: return pal(0xFF222222, 0xFFDDDDDD, 0xFFFFFFFF, 0xFF000000, 0xFFFFAAAA, 0xFF38D5E6);
        }
    }
    static int[] pal(int... c) { return c; }

    static String[] base(String form) {
        switch (form) {
            case "ei": return EGG;
            case "flimmi": return BABY;
            case "wispel": case "nebelchen": return CHILD;
            case "spukli": case "rumpel": return TEEN;
            default: return ADULT;
        }
    }

    public enum Mood { NORMAL, HAPPY, SAD, SICK, SLEEP, EAT, BLINK }

    /**
     * Pixel einer Form (ARGB, 16×16, 0 = durchsichtig).
     * mood verändert Augen und Mund, frame 0/1 bewegt z. B. die Schwanzspitze und Funkeln.
     */
    public static int[][] pixels(String form, Mood mood, int frame) {
        String[] rows = base(form);
        int[] pal = palette(form);
        int[][] px = new int[16][16];
        int eyeTop = -1, eyeL = 99, eyeR = -1;
        for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) {
            char ch = rows[y].charAt(x);
            px[y][x] = color(ch, pal);
            if (ch == 'e') { if (eyeTop < 0) eyeTop = y; eyeL = Math.min(eyeL, x); eyeR = Math.max(eyeR, x); }
        }
        // Schwanz/Saum wackelt: in Bild 1 die untere Zeile um 1 verschieben
        if (frame == 1 && !"ei".equals(form)) {
            int[] last = px[15].clone();
            for (int x = 0; x < 16; x++) px[15][x] = x > 0 ? last[x - 1] : 0;
        }
        if (eyeTop >= 0) {
            int body = pal[1], eye = pal[3];
            switch (mood) {
                case SLEEP: case BLINK:   // Augen zu: nur untere Linie
                    px[eyeTop][eyeL] = body; px[eyeTop][eyeR] = body; break;
                case SICK:                // Kreuzchen-Augen angedeutet
                    px[eyeTop][eyeL] = body; px[eyeTop + 1][eyeL] = eye; px[eyeTop][eyeR] = body; px[eyeTop + 1][eyeR] = eye;
                    if (eyeL > 0) px[eyeTop][eyeL - 1] = eye;
                    if (eyeR < 15) px[eyeTop][eyeR + 1] = eye;
                    break;
                case HAPPY:               // ^ ^
                    px[eyeTop + 1][eyeL] = body; px[eyeTop + 1][eyeR] = body;
                    if (eyeL > 0) px[eyeTop + 1][eyeL - 1] = eye;
                    if (eyeR < 15) px[eyeTop + 1][eyeR + 1] = eye;
                    break;
                default: break;
            }
            // Mund unter den Augen, mittig
            int my = Math.min(15, eyeTop + 3), mx = (eyeL + eyeR) / 2;
            int m = pal[3];
            switch (mood) {
                case HAPPY: set(px, mx - 1, my, m); set(px, mx + 2, my, m); set(px, mx, my + 1, m); set(px, mx + 1, my + 1, m); break;
                case SAD: case SICK: set(px, mx, my, m); set(px, mx + 1, my, m); set(px, mx - 1, my + 1, m); set(px, mx + 2, my + 1, m); break;
                case EAT: set(px, mx, my, m); set(px, mx + 1, my, m); if (frame == 0) { set(px, mx, my + 1, m); set(px, mx + 1, my + 1, m); } break;
                case SLEEP: break;
                default: set(px, mx, my, m); set(px, mx + 1, my, m); break;
            }
        }
        accessory(px, form, pal, frame);
        return px;
    }

    static void set(int[][] px, int x, int y, int c) { if (x >= 0 && x < 16 && y >= 0 && y < 16) px[y][x] = c; }

    static int color(char ch, int[] pal) {
        switch (ch) {
            case 'o': return pal[0]; case 'b': return pal[1]; case 'l': return pal[2];
            case 'e': return pal[3]; case 'c': return pal[4]; case 'a': return pal[5];
            default: return 0;
        }
    }

    /** Zubehör je Form – macht die Erwachsenen unterscheidbar */
    static void accessory(int[][] px, String form, int[] pal, int frame) {
        int a = pal[5], o = pal[0];
        switch (form) {
            case "lumina":    // Heiligenschein
                for (int x = 5; x <= 10; x++) set(px, x, 0, a);
                set(px, 4, 0, o); set(px, 11, 0, o);
                break;
            case "polterkoenig":   // Krone
                set(px, 5, 0, a); set(px, 7, 0, a); set(px, 9, 0, a); set(px, 10, 0, a);
                for (int x = 5; x <= 10; x++) set(px, x, 1, a);
                break;
            case "schattling":     // Hörner
                set(px, 3, 1, a); set(px, 3, 2, a); set(px, 12, 1, a); set(px, 12, 2, a);
                break;
            case "glimmer":        // Funkeln (wechselt)
                if (frame == 0) { set(px, 1, 2, a); set(px, 14, 5, a); set(px, 0, 12, a); }
                else { set(px, 14, 1, a); set(px, 1, 6, a); set(px, 15, 12, a); }
                break;
            case "klirr":          // Kette
                for (int x = 3; x <= 12; x += 2) set(px, x, 12, a);
                break;
            case "nexie":          // Antenne mit Licht
                set(px, 7, 0, o); set(px, 8, 0, o); set(px, 8, 1, frame == 0 ? a : pal[2]);
                break;
            case "urgeist":        // Bart
                for (int x = 6; x <= 9; x++) { set(px, x, 10, a); set(px, x, 11, a); }
                set(px, 7, 12, a); set(px, 8, 12, a);
                break;
            case "spukli":         // Schleife
                set(px, 9, 3, a); set(px, 10, 3, a); set(px, 11, 2, a); set(px, 11, 4, a);
                break;
            case "rumpel":         // Pflaster
                set(px, 4, 5, a); set(px, 5, 5, a); set(px, 4, 6, a); set(px, 5, 6, a);
                break;
            default: break;
        }
    }

    /** kleines Häufchen-Symbol (8×6) */
    public static final String[] POOP = { "...oo...", "..obbo..", ".obbbbo.", ".obbbbo.", "obbbbbbo", ".oooooo." };
    public static final int[] POOP_PAL = pal(0xFF3A2A1A, 0xFF8A5A2B, 0, 0, 0, 0);
}
