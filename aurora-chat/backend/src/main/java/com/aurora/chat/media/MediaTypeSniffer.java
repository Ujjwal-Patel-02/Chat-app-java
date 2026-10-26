package com.aurora.chat.media;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.Set;

/**
 * Detects the real file type from its first bytes ("magic numbers") instead of trusting the browser-supplied
 * Content-Type, so nobody can upload HTML/SVG/scripts disguised as photos.
 */
public final class MediaTypeSniffer {

    public record Detected(MediaKind kind, String mimeType, String extension, boolean heic) {
    }

    private static final Set<String> HEIC_BRANDS = Set.of("heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1");
    private static final Set<String> AUDIO_BRANDS = Set.of("M4A ", "M4B ", "M4P ");

    private MediaTypeSniffer() {
    }

    public static Optional<Detected> sniff(Path file) throws IOException {
        byte[] head = new byte[32];
        int read;
        try (InputStream in = Files.newInputStream(file)) {
            read = in.readNBytes(head, 0, head.length);
        }
        return sniff(head, read);
    }

    public static Optional<Detected> sniff(byte[] b, int len) {
        if (len >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return image("image/jpeg", ".jpg");
        }
        if (len >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
                && b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A) {
            return image("image/png", ".png");
        }
        if (len >= 6 && ascii(b, 0, 6).matches("GIF8[79]a")) {
            return image("image/gif", ".gif");
        }
        if (len >= 12 && ascii(b, 0, 4).equals("RIFF") && ascii(b, 8, 4).equals("WEBP")) {
            return image("image/webp", ".webp");
        }
        if (len >= 4 && (b[0] & 0xFF) == 0x1A && (b[1] & 0xFF) == 0x45 && (b[2] & 0xFF) == 0xDF && (b[3] & 0xFF) == 0xA3) {
            return Optional.of(new Detected(MediaKind.VIDEO, "video/webm", ".webm", false));
        }
        if (len >= 12 && ascii(b, 4, 4).equals("ftyp")) {
            String brand = ascii(b, 8, 4);
            if (brand.equals("avif") || brand.equals("avis")) {
                return image("image/avif", ".avif");
            }
            if (HEIC_BRANDS.contains(brand)) {
                return Optional.of(new Detected(MediaKind.IMAGE, "image/heic", ".heic", true));
            }
            if (AUDIO_BRANDS.contains(brand)) {
                return Optional.empty();
            }
            if (brand.equals("qt  ")) {
                return Optional.of(new Detected(MediaKind.VIDEO, "video/quicktime", ".mov", false));
            }
            return Optional.of(new Detected(MediaKind.VIDEO, "video/mp4", ".mp4", false));
        }
        return Optional.empty();
    }

    private static Optional<Detected> image(String mime, String ext) {
        return Optional.of(new Detected(MediaKind.IMAGE, mime, ext, false));
    }

    private static String ascii(byte[] b, int offset, int length) {
        return new String(b, offset, length, StandardCharsets.ISO_8859_1);
    }
}
