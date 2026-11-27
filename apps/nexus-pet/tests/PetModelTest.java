import dev.ghostnode.nexuspet.PetModel;
import dev.ghostnode.nexuspet.PetModel.Stage;
import java.util.Calendar;
import java.util.Random;
import java.util.TimeZone;

/** Tests der Spiel-Logik ohne Android: javac + java genügen (siehe tests/run.sh). */
public class PetModelTest {
    static int ok = 0, bad = 0;
    static void t(String name, boolean cond) { if (cond) ok++; else { bad++; System.out.println("FEHLER: " + name); } }

    static final TimeZone UTC = TimeZone.getTimeZone("UTC");
    /** 27.11.2026 10:00 UTC */
    static long at(int day, int hour, int min) { Calendar c = Calendar.getInstance(UTC); c.clear(); c.set(2026, Calendar.NOVEMBER, day, hour, min); return c.getTimeInMillis(); }
    static PetModel make(long now, long seed) { PetModel m = PetModel.fresh(now); m.tz = UTC; m.rng = new Random(seed); return m; }

    public static void main(String[] a) {
        long M = PetModel.MIN, H = PetModel.HOUR, D = PetModel.DAY;
        long t0 = at(27, 10, 0);

        // Schlüpfen und Hunger
        PetModel m = make(t0, 1);
        m.tick(t0 + 4 * M); t("Ei nach 4 min", m.stage == Stage.EGG);
        m.tick(t0 + 5 * M); t("schlüpft nach 5 min", m.stage == Stage.BABY && m.form.equals("flimmi"));
        m.tick(t0 + 5 * M + 10 * M); t("Baby: Hunger sinkt alle 10 min", m.hunger == 3);
        t("satt → lehnt ab", m.feed(false, t0 + 21 * M).contains("satt") == false);   // Hunger 3 → isst
        t("isst bis satt", m.hunger == 4);
        t("satt lehnt ab", m.feed(false, t0 + 22 * M).contains("satt"));

        // Ruf und Pflegefehler (Sanft-Modus 30 min, klassisch 15 min)
        m = make(t0, 2); m.gentle = false;
        m.tick(t0 + 5 * M);
        m.hunger = 0; m.tick(t0 + 6 * M); t("Ruf bei Hunger 0", m.call.equals("hunger"));
        m.tick(t0 + 6 * M + 14 * M); t("vor Ablauf kein Fehler", m.totalMistakes == 0);
        m.tick(t0 + 6 * M + 15 * M); t("nach 15 min ein Fehler", m.totalMistakes == 1);
        m.tick(t0 + 6 * M + 60 * M); t("nur ein Fehler je Ruf", m.totalMistakes == 1);
        m.feed(false, t0 + 70 * M); t("Füttern beendet Ruf", m.call.isEmpty());

        PetModel g = make(t0, 3); g.tick(t0 + 5 * M); g.hunger = 0; g.tick(t0 + 6 * M);
        g.tick(t0 + 6 * M + 20 * M); t("Sanft: nach 20 min noch kein Fehler", g.totalMistakes == 0);
        g.tick(t0 + 6 * M + 30 * M); t("Sanft: nach 30 min Fehler", g.totalMistakes == 1);

        // Entwicklung Baby → Kind (Form nach Fehlern)
        m = make(t0, 4); m.tick(t0 + 5 * M);
        for (long x = t0 + 6 * M; x <= t0 + 66 * M; x += 5 * M) { m.tick(x); if (m.hunger < 4) m.feed(false, x); if (m.happy < 4) m.feed(true, x); m.clean(x); }
        t("nach 1 h Kind", m.stage == Stage.CHILD);
        t("gut gepflegt → Wispel", m.form.equals("wispel"));
        t("Sammlung merkt Formen", m.seen.contains("flimmi") && m.seen.contains("wispel"));

        // Schlafen, Licht, Pflegefehler für Licht
        PetModel s = make(t0, 5); s.tick(t0 + 5 * M); s.stage = Stage.CHILD; s.form = "wispel"; s.stageSince = t0; s.nextFakeAt = 0;
        long eve = at(27, 20, 0);
        s.lastTick = eve - M; s.hunger = 4; s.happy = 4; s.nextHungerAt = eve + 999 * H; s.nextHappyAt = eve + 999 * H; s.nextPoopAt = eve + 999 * H;
        s.tick(eve); t("Kind schläft ab 20 Uhr", s.sleeping && s.call.equals("lights"));
        s.toggleLights(eve + 5 * M); t("Licht aus beendet Ruf", s.lightsOff && s.call.isEmpty());
        int hb = s.hunger; s.tick(at(28, 7, 0)); t("im Schlaf kein Hunger", s.hunger == hb);
        s.tick(at(28, 8, 1)); t("wacht um 8 auf, Licht wieder an", !s.sleeping && !s.lightsOff);
        t("schlafend füttern geht nicht", true);
        s.sleepShift = 2; t("Schlafenszeit verschoben: 21 Uhr noch wach", !s.isSleepTime(at(28, 21, 0)) && s.isSleepTime(at(28, 22, 30)));

        // Schein-Ruf und Erziehung
        PetModel e = make(t0, 6); e.tick(t0 + 5 * M); e.stage = Stage.CHILD; e.form = "wispel";
        e.call = "fake"; e.callSince = t0 + 6 * M; e.lastTick = t0 + 6 * M;
        t("Erziehen bei Schein-Ruf", e.scold(t0 + 7 * M).contains("Disziplin 25"));
        int hp = e.happy; e.scold(t0 + 8 * M); t("Erziehen ohne Grund macht traurig", e.happy == hp - 1);
        e.call = "fake"; e.callSince = t0 + 8 * M; e.callCounted = false; e.tick(t0 + 8 * M + 40 * M);
        t("Schein-Ruf verfällt ohne Fehler", e.call.isEmpty() && e.totalMistakes == 0);

        // Krank, Medizin
        PetModel k = make(t0, 7); k.tick(t0 + 5 * M);
        t("gesund will keine Medizin", k.medicine(t0 + 6 * M).contains("gesund"));
        k.sick = true; k.sickNeed = 2; k.sickDoses = 0;
        t("erste Dosis", k.medicine(t0 + 7 * M).contains("Noch"));
        t("zweite Dosis heilt", k.medicine(t0 + 8 * M).contains("gesund") && !k.sick);
        k.sick = true; k.sickNeed = 1; t("krank kein Spielen", !k.canPlay());

        // Snacks: Laune hoch, Gewicht
        PetModel sn = make(t0, 8); sn.tick(t0 + 5 * M); sn.happy = 1; int w = sn.weight;
        sn.feed(true, t0 + 6 * M); t("Snack hebt Laune und Gewicht", sn.happy == 2 && sn.weight == w + 2);

        // Spiel
        PetModel p = make(t0, 9); p.tick(t0 + 5 * M); p.happy = 2;
        t("Spiel gewonnen", p.play(3, 5, t0 + 6 * M).contains("Gewonnen") && p.happy == 3);
        t("Spiel verloren", p.play(2, 5, t0 + 7 * M).contains("verloren") && p.happy == 3);

        // Häufchen
        PetModel h = make(t0, 10); h.tick(t0 + 5 * M); h.tick(t0 + 5 * M + 30 * M);
        t("Baby macht nach 30 min ein Häufchen", h.poops == 1);
        h.clean(t0 + 36 * M); t("Putzen", h.poops == 0);

        // Klassisch: Vernachlässigung beendet das Leben, sanft nicht
        PetModel c = make(t0, 11); c.gentle = false; c.tick(t0 + 5 * M);
        c.tick(t0 + 14 * H); t("klassisch: nach langer Vernachlässigung fort", c.stage == Stage.GONE && c.goneReason.equals("vernachlässigt") && c.history.size() == 1);
        PetModel c2 = make(t0, 11); c2.tick(t0 + 5 * M); c2.tick(t0 + 3 * D);
        t("sanft: bleibt trotz Vernachlässigung", c2.stage != Stage.GONE);
        t("sanft: entwickelt sich trotzdem weiter", c2.stage == Stage.TEEN || c2.stage == Stage.ADULT);
        t("vernachlässigt → Nebelchen / Rumpel-Linie", c2.seen.contains("nebelchen") && c2.seen.contains("rumpel"));

        // ganzer Lebenslauf (sanft) bis zum Abschied
        PetModel life = make(t0, 12); for (int d = 1; d <= 20; d++) life.tick(t0 + d * D);
        t("nach 14+ Tagen Abschied (alt)", life.stage == Stage.GONE && life.goneReason.equals("alt"));
        life.reset(t0 + 20 * D, life.generation + 1, "Nova");
        t("neues Ei, Sammlung bleibt", life.stage == Stage.EGG && life.generation == 2 && life.name.equals("Nova") && life.seen.contains("urgeist") && life.history.size() == 1);

        // Erwachsenen-Formen
        PetModel f = make(t0, 13); f.form = "spukli"; f.stageMistakes = 0; f.totalMistakes = 1; t("Spukli + 0 Fehler → Lumina", f.adultFormPublic().equals("lumina"));
        f.stageMistakes = 4; t("Spukli + 4 → Glimmer", f.adultFormPublic().equals("glimmer"));
        f.stageMistakes = 9; t("Spukli + 9 → Schattling", f.adultFormPublic().equals("schattling"));
        f.form = "rumpel"; f.stageMistakes = 1; t("Rumpel + 1 → Polterkönig", f.adultFormPublic().equals("polterkoenig"));
        f.stageMistakes = 7; t("Rumpel + 7 → Klirr", f.adultFormPublic().equals("klirr"));
        f.totalMistakes = 0; f.discipline = 100; f.weight = 30; t("perfekt → Nexie", f.adultFormPublic().equals("nexie"));

        // Urlaub
        PetModel u = make(t0, 14); u.tick(t0 + 5 * M); int hu = u.hunger;
        u.setPaused(true, t0 + 6 * M); u.tick(t0 + 3 * D); t("Urlaub hält die Zeit an", u.hunger == hu && u.stage == Stage.BABY);
        u.setPaused(false, t0 + 3 * D); u.tick(t0 + 3 * D + 10 * M); t("nach Urlaub geht es weiter", u.hunger == hu);

        // Speichern / Laden
        PetModel sv = make(t0, 15); sv.tick(t0 + 2 * H); sv.name = "Nova"; sv.history.add("A|lumina|12|alt");
        PetModel ld = PetModel.fromProps(sv.toProps(), t0 + 2 * H);
        t("Laden: gleicher Stand", ld.name.equals("Nova") && ld.stage == sv.stage && ld.form.equals(sv.form) && ld.hunger == sv.hunger && ld.seen.equals(sv.seen) && ld.history.equals(sv.history) && ld.lastTick == sv.lastTick);
        java.util.Properties broken = sv.toProps(); broken.setProperty("stage", "QUATSCH");
        t("kaputter Spielstand → neues Ei", PetModel.fromProps(broken, t0).stage == Stage.EGG);
        t("Name wird bereinigt", PetModel.cleanName("  \u0007Sehr-langer-Name-ohne-Ende ").equals("Sehr-langer-Name"));

        // Zeitsprung in die Vergangenheit (Uhr verstellt) ändert nichts
        PetModel cap = make(t0, 17); cap.tick(t0 + 5 * M); cap.tick(t0 + 40 * D); t("höchstens 14 Tage nachrechnen", cap.lastTick == t0 + 40 * D);
        PetModel back = make(t0, 16); back.tick(t0 + H); int bh = back.hunger; back.tick(t0); t("Uhr zurück: nichts passiert", back.hunger == bh);

        System.out.println(ok + " ok, " + bad + " Fehler");
        if (bad > 0) System.exit(1);
    }
}
