package dev.ghostnode.nexuspet;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Properties;
import java.util.Random;
import java.util.Set;
import java.util.TimeZone;

/**
 * Spiel-Logik von Nexus Pet – reines Java (ohne Android), damit sie sich ohne Gerät testen lässt.
 *
 * Ein Geistling lebt in Echtzeit: Hunger und Laune sinken, er macht Häufchen, wird müde und kann krank werden.
 * Ruft er (Hunger, Laune, Licht), hast du je nach Modus 15 bzw. 30 Minuten Zeit – sonst zählt ein Pflegefehler.
 * Pflegefehler, Erziehung und Gewicht entscheiden, zu welcher Form er sich entwickelt.
 * Ist die App zu, rechnet tick() die verpasste Zeit Minute für Minute nach (höchstens 14 Tage).
 */
public final class PetModel {
    public enum Stage { EGG, BABY, CHILD, TEEN, ADULT, SENIOR, GONE }

    public static final long MIN = 60_000L, HOUR = 60 * MIN, DAY = 24 * HOUR;
    public static final int MAX_HEARTS = 4;

    // ---------- Zustand ----------
    public String name = "Flimmi";
    public int generation = 1;
    public Stage stage = Stage.EGG;
    public String form = "ei";
    public long stageSince, lastTick, ageMin;
    public int hunger = MAX_HEARTS, happy = MAX_HEARTS, discipline = 0, weight = 5, poops = 0;
    public int stageMistakes = 0, totalMistakes = 0;
    /** Minuten dieser Stufe, in denen Hunger oder Laune leer waren (wach) */
    public int stageNeglect = 0;
    public boolean sick, sleeping, lightsOff, paused;
    public int sickDoses, sickNeed;
    public long sickSince, hungerZeroSince;
    public String call = "";            // "", hunger, happy, lights, fake
    public long callSince;
    public boolean callCounted;
    public long nextHungerAt, nextHappyAt, nextPoopAt, nextFakeAt, lastCuddleAt;
    public int snacksHour;
    public long snackHourStart;
    /** Sanft-Modus (Standard): verlässt dich nie wegen Vernachlässigung, mehr Zeit bei Rufen */
    public boolean gentle = true;
    /** Schlafenszeit verschieben: −3 … +3 Stunden */
    public int sleepShift = 0;
    public String goneReason = "";
    // Statistik & Sammlung
    public int fed, snacks, cleaned, gamesPlayed, gamesWon, cured, scolded;
    public final Set<String> seen = new LinkedHashSet<>();
    public final List<String> history = new ArrayList<>();   // "Name|Form|Tage|Grund"
    /** zuletzt gemeldeter Ruf (für Benachrichtigungen, damit nicht doppelt gemeldet wird) */
    public long notifiedCall;

    public transient Random rng = new Random();
    public transient TimeZone tz = TimeZone.getDefault();

    public PetModel() {}

    public static PetModel fresh(long now) {
        PetModel m = new PetModel();
        m.reset(now, 1, "Flimmi");
        return m;
    }

    /** neues Ei (nächste Generation), Sammlung und Verlauf bleiben */
    public void reset(long now, int gen, String newName) {
        generation = gen; name = cleanName(newName);
        stage = Stage.EGG; form = "ei"; stageSince = now; lastTick = now; ageMin = 0;
        hunger = MAX_HEARTS; happy = MAX_HEARTS; discipline = 0; weight = 5; poops = 0;
        stageMistakes = 0; totalMistakes = 0; stageNeglect = 0; sick = false; sleeping = false; lightsOff = false; paused = false;
        sickDoses = 0; sickNeed = 0; sickSince = 0; hungerZeroSince = 0;
        call = ""; callSince = 0; callCounted = false; goneReason = ""; snacksHour = 0; snackHourStart = 0; lastCuddleAt = 0;
        seen.add("ei");
    }

    public static String cleanName(String s) {
        String n = s == null ? "" : s.replaceAll("[\\p{Cntrl}]", "").trim();
        if (n.length() > 16) n = n.substring(0, 16);
        return n.isEmpty() ? "Flimmi" : n;
    }

    // ---------- Raten je Stufe (Minuten) ----------
    static int hungerRate(Stage s) { switch (s) { case BABY: return 10; case CHILD: return 45; case TEEN: return 60; case ADULT: return 80; default: return 70; } }
    static int happyRate(Stage s) { switch (s) { case BABY: return 12; case CHILD: return 40; case TEEN: return 55; case ADULT: return 75; default: return 65; } }
    static int poopRate(Stage s) { switch (s) { case BABY: return 30; case CHILD: return 90; case TEEN: return 120; case ADULT: return 150; default: return 130; } }
    static int baseWeight(Stage s) { switch (s) { case EGG: case BABY: return 5; case CHILD: return 10; case TEEN: return 20; default: return 30; } }
    long callLimit() { return (gentle ? 30 : 15) * MIN; }

    /** Schlafenszeit [von, bis) in Stunden – null = kein Nachtschlaf (Ei, Baby) */
    int[] bedtime() {
        switch (stage) {
            case CHILD: return new int[] { 20, 8 };
            case TEEN: return new int[] { 22, 9 };
            case ADULT: return new int[] { 22, 8 };
            case SENIOR: return new int[] { 21, 8 };
            default: return null;
        }
    }
    public boolean isSleepTime(long t) {
        int[] b = bedtime();
        if (b == null) return false;
        Calendar c = Calendar.getInstance(tz);
        c.setTimeInMillis(t);
        int h = ((c.get(Calendar.HOUR_OF_DAY) - sleepShift) % 24 + 24) % 24;
        return b[0] > b[1] ? (h >= b[0] || h < b[1]) : (h >= b[0] && h < b[1]);
    }

    // ---------- Zeit ----------
    /** verpasste Zeit nachrechnen; gibt die Anzahl simulierter Minuten zurück */
    public int tick(long now) {
        if (now <= lastTick) return 0;
        if (paused || stage == Stage.GONE) { lastTick = now; return 0; }
        long from = Math.max(lastTick, now - 14 * DAY);
        int n = 0;
        for (long t = from + MIN; t <= now; t += MIN) { step(t); n++; lastTick = t; if (stage == Stage.GONE) { lastTick = now; break; } }
        return n;
    }

    void step(long t) {
        if (stage == Stage.EGG) {
            if (t - stageSince >= 5 * MIN) evolve(t, Stage.BABY, "flimmi");
            return;
        }
        ageMin++;
        boolean sleepTime = isSleepTime(t);
        if (sleepTime && !sleeping) { sleeping = true; if (!lightsOff) raise("lights", t); }
        if (!sleepTime && sleeping) { sleeping = false; lightsOff = false; if ("lights".equals(call)) clearCall(); scheduleAwake(t); }

        if (!sleeping) {
            int speed = sick ? 2 : 1;   // krank: alles sinkt doppelt so schnell
            if (t >= nextHungerAt) { hunger = Math.max(0, hunger - 1); nextHungerAt = t + hungerRate(stage) * MIN / speed; }
            if (t >= nextHappyAt) { happy = Math.max(0, happy - 1); nextHappyAt = t + happyRate(stage) * MIN / speed; }
            if (t >= nextPoopAt) { poops = Math.min(4, poops + 1); nextPoopAt = t + poopRate(stage) * MIN; }
            if (!sick && poops >= 3 && rng.nextInt(90) == 0) getSick(t);
            if (!sick && weight > baseWeight(stage) + 15 && rng.nextInt(600) == 0) getSick(t);
            if ((stage == Stage.CHILD || stage == Stage.TEEN) && discipline < 100 && call.isEmpty() && nextFakeAt > 0 && t >= nextFakeAt) {
                raise("fake", t);
                nextFakeAt = t + (120 + rng.nextInt(180)) * MIN;
            }
            if (call.isEmpty() || "fake".equals(call)) {
                if (hunger == 0) { if ("fake".equals(call)) clearCall(); raise("hunger", t); }
                else if (happy == 0) { if ("fake".equals(call)) clearCall(); raise("happy", t); }
            }
        }
        if (!sleeping && (hunger == 0 || happy == 0)) stageNeglect++;
        hungerZeroSince = hunger == 0 ? (hungerZeroSince == 0 ? t : hungerZeroSince) : 0;

        // Ruf nicht beantwortet → Pflegefehler (einmal je Ruf); Schein-Ruf verfällt nur
        if (!call.isEmpty() && !callCounted && t - callSince >= callLimit()) {
            if ("fake".equals(call)) clearCall();
            else { stageMistakes++; totalMistakes++; callCounted = true; }
        }

        // klassischer Modus: Vernachlässigung beendet das Leben
        if (!gentle) {
            if (hungerZeroSince > 0 && t - hungerZeroSince >= 12 * HOUR) { leave(t, "vernachlässigt"); return; }
            if (sick && t - sickSince >= 24 * HOUR) { leave(t, "krank"); return; }
        }
        growth(t);
    }

    void scheduleAwake(long t) {
        nextHungerAt = t + hungerRate(stage) * MIN;
        nextHappyAt = t + happyRate(stage) * MIN;
        nextPoopAt = t + poopRate(stage) * MIN;
    }

    void raise(String what, long t) {
        if (what.equals(call)) return;
        call = what; callSince = t; callCounted = false;
    }
    void clearCall() { call = ""; callSince = 0; callCounted = false; }

    void getSick(long t) { sick = true; sickSince = t; sickDoses = 0; sickNeed = 1 + rng.nextInt(2); }

    // ---------- Entwicklung ----------
    void growth(long t) {
        long in = t - stageSince;
        switch (stage) {
            case BABY: if (in >= HOUR) evolve(t, Stage.CHILD, stageMistakes == 0 && stageNeglect < 10 ? "wispel" : "nebelchen"); break;
            case CHILD: if (in >= DAY) evolve(t, Stage.TEEN, discipline >= 50 ? "spukli" : "rumpel"); break;
            case TEEN: if (in >= 2 * DAY) evolve(t, Stage.ADULT, adultForm()); break;
            case ADULT: if (in >= 10 * DAY) evolve(t, Stage.SENIOR, "urgeist"); break;
            case SENIOR: {
                long life = 4 * DAY - (gentle ? 0 : Math.min(3 * DAY, totalMistakes * 6 * HOUR));
                if (in >= life) leave(t, "alt");
                break;
            }
            default: break;
        }
    }

    /** Erwachsenen-Form: Teen-Form + Pflegefehler der Teen-Zeit; geheime Form bei perfekter Pflege */
    public String adultFormPublic() { return adultForm(); }
    String adultForm() {
        if (totalMistakes == 0 && discipline >= 100 && weight >= 20 && weight <= 40) return "nexie";
        if ("spukli".equals(form)) return stageMistakes <= 2 ? "lumina" : stageMistakes <= 5 ? "glimmer" : "schattling";
        return stageMistakes <= 3 ? "polterkoenig" : "klirr";
    }

    void evolve(long t, Stage s, String f) {
        stage = s; form = f; stageSince = t; stageMistakes = 0; stageNeglect = 0;
        weight = Math.max(weight, baseWeight(s));
        seen.add(f);
        scheduleAwake(t);
        if ((s == Stage.CHILD || s == Stage.TEEN) && discipline < 100) nextFakeAt = t + (60 + rng.nextInt(120)) * MIN;
    }

    void leave(long t, String why) {
        history.add(0, name.replace("|", "/") + "|" + form + "|" + ageDays() + "|" + why);
        while (history.size() > 30) history.remove(history.size() - 1);
        stage = Stage.GONE; goneReason = why; sleeping = false; clearCall();
    }

    /** selbst neu anfangen: Geistling zieht in den Geisterwald (kommt in die Erinnerungen) */
    public void leaveNow(long t) {
        tick(t);
        if (stage == Stage.GONE) return;
        if (stage == Stage.EGG) { stage = Stage.GONE; goneReason = "freigelassen"; return; }
        leave(t, "freigelassen");
    }

    public int ageDays() { return (int) (ageMin / (24 * 60)); }

    // ---------- Aktionen (Antwort = Text für die Oberfläche) ----------
    public String feed(boolean snack, long now) {
        tick(now);
        if (stage == Stage.EGG || stage == Stage.GONE) return "Hier gibt es niemanden zu füttern.";
        if (sleeping) return "😴 " + name + " schläft gerade.";
        if (!snack) {
            if (hunger >= MAX_HEARTS) return "🙅 " + name + " ist satt und schüttelt den Kopf.";
            hunger++; weight++; fed++;
            if ("hunger".equals(call) && hunger > 0) clearCall();
            return "🍙 Lecker! Hunger " + hunger + "/" + MAX_HEARTS + ".";
        }
        if (now - snackHourStart > HOUR) { snackHourStart = now; snacksHour = 0; }
        snacksHour++; snacks++;
        happy = Math.min(MAX_HEARTS, happy + 1); weight += 2;
        if ("happy".equals(call)) clearCall();
        if (snacksHour >= 4 && !sick && rng.nextInt(10) < 3) { getSick(now); return "🍰 Zu viel Süßes – " + name + " fühlt sich krank."; }
        return "🍰 Mmmh! Laune " + happy + "/" + MAX_HEARTS + (snacksHour >= 3 ? " – aber nicht zu viele Snacks!" : ".");
    }

    public boolean canPlay() { return stage != Stage.EGG && stage != Stage.GONE && !sleeping && !sick; }

    /** Ergebnis eines Mini-Spiels (Runden gewonnen von 5) */
    public String play(int won, int rounds, long now) {
        tick(now);
        if (!canPlay()) return sleeping ? "😴 Schläft gerade." : sick ? "🤒 Zu krank zum Spielen." : "Niemand zum Spielen da.";
        gamesPlayed++;
        weight = Math.max(baseWeight(stage) / 2, weight - 1);
        if (won * 2 > rounds) {
            gamesWon++;
            happy = Math.min(MAX_HEARTS, happy + 1);
            if ("happy".equals(call)) clearCall();
            return "🎉 Gewonnen (" + won + "/" + rounds + ")! Laune " + happy + "/" + MAX_HEARTS + ".";
        }
        return "😅 Knapp verloren (" + won + "/" + rounds + ") – Bewegung tat trotzdem gut.";
    }

    public String clean(long now) {
        tick(now);
        if (poops == 0) return "✨ Schon alles sauber.";
        poops = 0; cleaned++;
        return "🧽 Alles sauber!";
    }

    public String medicine(long now) {
        tick(now);
        if (!sick) return "💊 " + name + " ist gesund und will keine Medizin.";
        sickDoses++;
        if (sickDoses >= sickNeed) { sick = false; sickDoses = 0; cured++; return "💚 Wieder gesund!"; }
        return "💊 Noch eine Dosis nötig.";
    }

    public String toggleLights(long now) {
        tick(now);
        lightsOff = !lightsOff;
        if (lightsOff && "lights".equals(call)) clearCall();
        if (!lightsOff && sleeping) return "💡 Licht an – " + name + " blinzelt verschlafen.";
        return lightsOff ? "🌙 Licht aus." : "💡 Licht an.";
    }

    /** Erziehen: nur bei einem Schein-Ruf richtig – sonst wird er traurig */
    public String scold(long now) {
        tick(now);
        if (stage == Stage.EGG || stage == Stage.GONE || sleeping) return "Gerade nicht.";
        if ("fake".equals(call)) {
            discipline = Math.min(100, discipline + 25); scolded++; clearCall();
            return "📣 Richtig erzogen! Disziplin " + discipline + " %.";
        }
        happy = Math.max(0, happy - 1);
        return "😢 " + name + " hat nichts angestellt und ist jetzt traurig.";
    }

    /** modern: Kuscheln hebt die Laune (höchstens alle 30 Minuten) */
    public String cuddle(long now) {
        tick(now);
        if (stage == Stage.EGG || stage == Stage.GONE) return "Niemand zum Kuscheln da.";
        if (sleeping) return "😴 Psst – schläft.";
        if (now - lastCuddleAt < 30 * MIN) return "🤗 Hat gerade erst gekuschelt.";
        lastCuddleAt = now;
        happy = Math.min(MAX_HEARTS, happy + 1);
        if ("happy".equals(call)) clearCall();
        return "🤗 " + name + " schmiegt sich an dich.";
    }

    /** Urlaub: Zeit anhalten (modern) */
    public String setPaused(boolean on, long now) {
        tick(now);
        paused = on; lastTick = now;
        if (!on) scheduleAwake(now);
        return on ? "🏖 Urlaubsmodus an – die Zeit steht still." : "🏠 Willkommen zurück!";
    }

    public boolean needsAttention() { return !call.isEmpty() && !paused && stage != Stage.GONE; }

    public String callText() {
        switch (call) {
            case "hunger": return name + " hat Hunger!";
            case "happy": return name + " ist traurig und will Aufmerksamkeit.";
            case "lights": return name + " ist müde – Licht aus, bitte.";
            case "fake": return name + " ruft dich … (wirklich?)";
            default: return "";
        }
    }

    public String stageName() {
        switch (stage) {
            case EGG: return "Ei"; case BABY: return "Baby"; case CHILD: return "Kind"; case TEEN: return "Teenager";
            case ADULT: return "Erwachsen"; case SENIOR: return "Senior"; default: return "Abschied";
        }
    }

    public static String formName(String f) {
        switch (f) {
            case "ei": return "Leuchtei"; case "flimmi": return "Flimmi"; case "wispel": return "Wispel"; case "nebelchen": return "Nebelchen";
            case "spukli": return "Spukli"; case "rumpel": return "Rumpel"; case "lumina": return "Lumina"; case "glimmer": return "Glimmer";
            case "schattling": return "Schattling"; case "polterkoenig": return "Polterkönig"; case "klirr": return "Klirr"; case "nexie": return "Nexie ✦";
            case "urgeist": return "Urgeist"; default: return f;
        }
    }
    public static final String[] ALL_FORMS = { "ei", "flimmi", "wispel", "nebelchen", "spukli", "rumpel", "lumina", "glimmer", "schattling", "polterkoenig", "klirr", "nexie", "urgeist" };

    // ---------- Speichern ----------
    public Properties toProps() {
        Properties p = new Properties();
        p.setProperty("v", "1");
        p.setProperty("name", name); p.setProperty("generation", "" + generation); p.setProperty("stage", stage.name()); p.setProperty("form", form);
        long[] L = { stageSince, lastTick, ageMin, sickSince, hungerZeroSince, callSince, nextHungerAt, nextHappyAt, nextPoopAt, nextFakeAt, lastCuddleAt, snackHourStart, notifiedCall };
        String[] LN = { "stageSince", "lastTick", "ageMin", "sickSince", "hungerZeroSince", "callSince", "nextHungerAt", "nextHappyAt", "nextPoopAt", "nextFakeAt", "lastCuddleAt", "snackHourStart", "notifiedCall" };
        for (int i = 0; i < L.length; i++) p.setProperty(LN[i], "" + L[i]);
        int[] I = { stageNeglect, hunger, happy, discipline, weight, poops, stageMistakes, totalMistakes, sickDoses, sickNeed, sleepShift, snacksHour, fed, snacks, cleaned, gamesPlayed, gamesWon, cured, scolded };
        String[] IN = { "stageNeglect", "hunger", "happy", "discipline", "weight", "poops", "stageMistakes", "totalMistakes", "sickDoses", "sickNeed", "sleepShift", "snacksHour", "fed", "snacks", "cleaned", "gamesPlayed", "gamesWon", "cured", "scolded" };
        for (int i = 0; i < I.length; i++) p.setProperty(IN[i], "" + I[i]);
        p.setProperty("sick", "" + sick); p.setProperty("sleeping", "" + sleeping); p.setProperty("lightsOff", "" + lightsOff); p.setProperty("paused", "" + paused);
        p.setProperty("callCounted", "" + callCounted); p.setProperty("gentle", "" + gentle);
        p.setProperty("call", call); p.setProperty("goneReason", goneReason);
        p.setProperty("seen", String.join(",", seen));
        p.setProperty("history", String.join("\n", history));
        return p;
    }

    public static PetModel fromProps(Properties p, long now) {
        if (p == null || p.getProperty("stage") == null) return fresh(now);
        PetModel m = new PetModel();
        try {
            m.name = cleanName(p.getProperty("name", "Flimmi"));
            m.generation = gi(p, "generation", 1);
            m.stage = Stage.valueOf(p.getProperty("stage", "EGG"));
            m.form = p.getProperty("form", "ei");
            m.stageSince = gl(p, "stageSince", now); m.lastTick = gl(p, "lastTick", now); m.ageMin = gl(p, "ageMin", 0);
            m.sickSince = gl(p, "sickSince", 0); m.hungerZeroSince = gl(p, "hungerZeroSince", 0); m.callSince = gl(p, "callSince", 0);
            m.nextHungerAt = gl(p, "nextHungerAt", now); m.nextHappyAt = gl(p, "nextHappyAt", now); m.nextPoopAt = gl(p, "nextPoopAt", now);
            m.nextFakeAt = gl(p, "nextFakeAt", 0); m.lastCuddleAt = gl(p, "lastCuddleAt", 0); m.snackHourStart = gl(p, "snackHourStart", 0); m.notifiedCall = gl(p, "notifiedCall", 0);
            m.hunger = clamp(gi(p, "hunger", 4), 0, MAX_HEARTS); m.happy = clamp(gi(p, "happy", 4), 0, MAX_HEARTS);
            m.discipline = clamp(gi(p, "discipline", 0), 0, 100); m.weight = clamp(gi(p, "weight", 5), 1, 99); m.poops = clamp(gi(p, "poops", 0), 0, 4);
            m.stageMistakes = gi(p, "stageMistakes", 0); m.stageNeglect = gi(p, "stageNeglect", 0); m.totalMistakes = gi(p, "totalMistakes", 0); m.sickDoses = gi(p, "sickDoses", 0); m.sickNeed = gi(p, "sickNeed", 1);
            m.sleepShift = clamp(gi(p, "sleepShift", 0), -3, 3); m.snacksHour = gi(p, "snacksHour", 0);
            m.fed = gi(p, "fed", 0); m.snacks = gi(p, "snacks", 0); m.cleaned = gi(p, "cleaned", 0); m.gamesPlayed = gi(p, "gamesPlayed", 0);
            m.gamesWon = gi(p, "gamesWon", 0); m.cured = gi(p, "cured", 0); m.scolded = gi(p, "scolded", 0);
            m.sick = gb(p, "sick"); m.sleeping = gb(p, "sleeping"); m.lightsOff = gb(p, "lightsOff"); m.paused = gb(p, "paused");
            m.callCounted = gb(p, "callCounted"); m.gentle = !"false".equals(p.getProperty("gentle", "true"));
            m.call = p.getProperty("call", ""); m.goneReason = p.getProperty("goneReason", "");
            for (String s : p.getProperty("seen", "ei").split(",")) if (!s.isEmpty()) m.seen.add(s);
            for (String s : p.getProperty("history", "").split("\n")) if (!s.isEmpty()) m.history.add(s);
        } catch (RuntimeException e) {
            return fresh(now);   // kaputter Spielstand → neues Ei statt Absturz
        }
        return m;
    }

    static int clamp(int v, int lo, int hi) { return Math.max(lo, Math.min(hi, v)); }
    static int gi(Properties p, String k, int d) { try { return Integer.parseInt(p.getProperty(k, "" + d)); } catch (NumberFormatException e) { return d; } }
    static long gl(Properties p, String k, long d) { try { return Long.parseLong(p.getProperty(k, "" + d)); } catch (NumberFormatException e) { return d; } }
    static boolean gb(Properties p, String k) { return "true".equals(p.getProperty(k)); }
}
