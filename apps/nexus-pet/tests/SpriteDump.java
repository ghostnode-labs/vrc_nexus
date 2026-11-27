import dev.ghostnode.nexuspet.PetModel;
import dev.ghostnode.nexuspet.Sprites;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/** Vorschau aller Formen als PNG (nur zum Ansehen beim Entwickeln): java SpriteDump out.png */
public class SpriteDump {
    public static void main(String[] a) throws Exception {
        String[] f = PetModel.ALL_FORMS;
        Sprites.Mood[] moods = { Sprites.Mood.NORMAL, Sprites.Mood.HAPPY, Sprites.Mood.SAD, Sprites.Mood.SLEEP, Sprites.Mood.EAT };
        int S = 8, W = 16 * S + 8;
        BufferedImage img = new BufferedImage(W * moods.length, W * f.length, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < img.getHeight(); y++) for (int x = 0; x < img.getWidth(); x++) img.setRGB(x, y, 0xFF0A0F18);
        for (int i = 0; i < f.length; i++) for (int j = 0; j < moods.length; j++) {
            int[][] px = Sprites.pixels(f[i], moods[j], 0);
            for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) if (px[y][x] != 0)
                for (int dy = 0; dy < S; dy++) for (int dx = 0; dx < S; dx++) img.setRGB(j * W + 4 + x * S + dx, i * W + 4 + y * S + dy, px[y][x]);
        }
        ImageIO.write(img, "png", new File(a[0]));
    }
}
