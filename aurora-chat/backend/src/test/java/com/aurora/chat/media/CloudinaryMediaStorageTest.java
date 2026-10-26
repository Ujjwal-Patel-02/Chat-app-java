package com.aurora.chat.media;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;

class CloudinaryMediaStorageTest {

    /** Example from Cloudinary's "Generating authentication signatures" documentation. */
    @Test
    void signsLikeCloudinaryDocs() {
        String signature = CloudinaryMediaStorage.sign(Map.of(
                "eager", "w_400,h_300,c_pad|w_260,h_200,c_crop",
                "public_id", "sample_image",
                "timestamp", "1315060510"), "abcd");
        assertThat(signature).isEqualTo("bfd09f95f331f558cbd1320e67aa8d488770583e");
    }

    @Test
    void buildsDownloadUrls() {
        assertThat(CloudinaryMediaStorage.attachmentUrl("https://res.cloudinary.com/demo/image/upload/v17/aurora-chat/abc.jpg", "aurora-20261026-1530-abcd"))
                .isEqualTo("https://res.cloudinary.com/demo/image/upload/fl_attachment:aurora-20261026-1530-abcd/v17/aurora-chat/abc.jpg");
        assertThat(CloudinaryMediaStorage.attachmentUrl("https://res.cloudinary.com/demo/video/upload/v1/a.mp4", "bad name.mp4"))
                .isEqualTo("https://res.cloudinary.com/demo/video/upload/fl_attachment:bad_name_mp4/v1/a.mp4");
    }

    @Test
    void parsesCloudinaryUrl() {
        CloudinaryCredentials credentials = CloudinaryCredentials.parse("cloudinary://123456789:s3cr%2Bt@demo-cloud");
        assertThat(credentials).isEqualTo(new CloudinaryCredentials("demo-cloud", "123456789", "s3cr+t"));
    }

    @Test
    void uploadsSignedMultipartAndDeletes(@TempDir Path dir) throws Exception {
        AtomicReference<String> uploadBody = new AtomicReference<>();
        AtomicReference<String> uploadPath = new AtomicReference<>();
        AtomicReference<String> destroyBody = new AtomicReference<>();
        HttpServer api = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        api.createContext("/", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.ISO_8859_1);
            String response;
            if (exchange.getRequestURI().getPath().endsWith("/upload")) {
                uploadPath.set(exchange.getRequestURI().getPath());
                uploadBody.set(body);
                response = "{\"public_id\":\"aurora-chat/abc\",\"secure_url\":\"https://res.cloudinary.com/demo/video/upload/v1/aurora-chat/abc.mp4\"}";
            } else {
                destroyBody.set(body);
                response = "{\"result\":\"ok\"}";
            }
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        api.start();
        try {
            Path file = Files.write(dir.resolve("clip.mp4"), "fake-video-bytes".getBytes(StandardCharsets.UTF_8));
            CloudinaryMediaStorage storage = new CloudinaryMediaStorage(new CloudinaryCredentials("demo", "key123", "secret"),
                    "aurora-chat", "http://127.0.0.1:" + api.getAddress().getPort(), HttpClient.newHttpClient(), new ObjectMapper());

            StoredFile stored = storage.store("abc.mp4", file, "video/mp4", true);

            assertThat(stored.publicUrl()).isEqualTo("https://res.cloudinary.com/demo/video/upload/v1/aurora-chat/abc.mp4");
            assertThat(stored.storageKey()).isEqualTo("video:aurora-chat/abc");
            assertThat(uploadPath.get()).isEqualTo("/v1_1/demo/video/upload");
            String body = uploadBody.get();
            assertThat(body).contains("name=\"api_key\"\r\n\r\nkey123").contains("name=\"public_id\"\r\n\r\nabc")
                    .contains("name=\"folder\"\r\n\r\naurora-chat").contains("fake-video-bytes");
            String timestamp = body.replaceAll("(?s).*name=\"timestamp\"\r\n\r\n(\\d+).*", "$1");
            String expected = CloudinaryMediaStorage.sign(Map.of("folder", "aurora-chat", "public_id", "abc", "timestamp", timestamp), "secret");
            assertThat(body).contains("name=\"signature\"\r\n\r\n" + expected);

            storage.delete(stored.storageKey());
            assertThat(destroyBody.get()).contains("public_id=aurora-chat%2Fabc").contains("api_key=key123").contains("signature=");
        } finally {
            api.stop(0);
        }
    }
}
