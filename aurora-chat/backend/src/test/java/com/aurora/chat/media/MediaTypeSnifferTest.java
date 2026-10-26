package com.aurora.chat.media;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

class MediaTypeSnifferTest {

    private static MediaTypeSniffer.Detected sniff(byte[] bytes) {
        return MediaTypeSniffer.sniff(bytes, bytes.length).orElse(null);
    }

    private static byte[] ftyp(String brand) {
        byte[] b = new byte[16];
        System.arraycopy("ftyp".getBytes(StandardCharsets.ISO_8859_1), 0, b, 4, 4);
        System.arraycopy(brand.getBytes(StandardCharsets.ISO_8859_1), 0, b, 8, 4);
        return b;
    }

    @Test
    void detectsSupportedTypes() {
        assertThat(sniff(new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00}).mimeType()).isEqualTo("image/jpeg");
        assertThat(sniff(new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}).mimeType()).isEqualTo("image/png");
        assertThat(sniff("GIF89a....".getBytes(StandardCharsets.ISO_8859_1)).mimeType()).isEqualTo("image/gif");
        assertThat(sniff("RIFF\0\0\0\0WEBPVP8 ".getBytes(StandardCharsets.ISO_8859_1)).mimeType()).isEqualTo("image/webp");
        assertThat(sniff(ftyp("isom")).mimeType()).isEqualTo("video/mp4");
        assertThat(sniff(ftyp("qt  ")).mimeType()).isEqualTo("video/quicktime");
        assertThat(sniff(ftyp("avif")).mimeType()).isEqualTo("image/avif");
        assertThat(sniff(new byte[] {0x1A, 0x45, (byte) 0xDF, (byte) 0xA3}).mimeType()).isEqualTo("video/webm");
        assertThat(sniff(ftyp("heic")).heic()).isTrue();
    }

    @Test
    void rejectsEverythingElse() {
        assertThat(sniff("<svg xmlns=\"http://www.w3.org/2000/svg\">".getBytes(StandardCharsets.UTF_8))).isNull();
        assertThat(sniff("<!doctype html><script>".getBytes(StandardCharsets.UTF_8))).isNull();
        assertThat(sniff("%PDF-1.7".getBytes(StandardCharsets.UTF_8))).isNull();
        assertThat(sniff(ftyp("M4A "))).isNull();
    }
}
