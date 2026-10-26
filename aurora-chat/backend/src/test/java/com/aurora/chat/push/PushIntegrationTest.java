package com.aurora.chat.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.SecureRandom;
import java.security.interfaces.ECPublicKey;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;

/** Full push pipeline against a fake push service: subscribe → message → encrypted, VAPID-signed delivery. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:aurora-push;DB_CLOSE_DELAY=-1",
        "app.push.allow-insecure-endpoints=true",
        "app.push.allowed-hosts=127.0.0.1",
        "app.media.local-dir=target/test-media-push"})
class PushIntegrationTest {

    record Received(String path, Map<String, String> headers, byte[] body) {
    }

    static HttpServer pushService;
    static final BlockingQueue<Received> received = new LinkedBlockingQueue<>();
    static final AtomicInteger nextStatus = new AtomicInteger(201);

    @Autowired
    TestRestTemplate rest;

    @Autowired
    ObjectMapper json;

    @Autowired
    PushSubscriptionRepository subscriptions;

    @BeforeAll
    static void startFakePushService() throws Exception {
        pushService = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        pushService.createContext("/push/", exchange -> {
            Map<String, String> headers = new java.util.HashMap<>();
            exchange.getRequestHeaders().forEach((k, v) -> headers.put(k.toLowerCase(), v.get(0)));
            received.add(new Received(exchange.getRequestURI().getPath(), headers, exchange.getRequestBody().readAllBytes()));
            exchange.sendResponseHeaders(nextStatus.get(), -1);
            exchange.close();
        });
        pushService.start();
    }

    @AfterAll
    static void stop() {
        pushService.stop(0);
    }

    @Test
    void deliversEncryptedNotificationsAndHonorsMuteAndExpiry() throws Exception {
        JsonNode alice = register("pushalice", "Alice Push");
        JsonNode bob = register("pushbob", "Bob Push");
        String aliceToken = alice.get("token").asText();
        String bobToken = bob.get("token").asText();

        JsonNode config = call(HttpMethod.GET, "/api/push/config", bobToken, null);
        assertThat(config.get("enabled").asBoolean()).isTrue();
        String vapidPublic = config.get("publicKey").asText();
        assertThat(EcKeys.fromB64(vapidPublic)).hasSize(65);

        // Bob's "browser": its own key pair + auth secret.
        KeyPair browser = EcKeys.generate();
        byte[] auth = new byte[16];
        new SecureRandom().nextBytes(auth);
        String endpoint = "http://127.0.0.1:" + pushService.getAddress().getPort() + "/push/bob-device";
        Map<String, Object> subscription = Map.of("endpoint", endpoint, "keys", Map.of(
                "p256dh", EcKeys.b64url(EcKeys.encodePublic((ECPublicKey) browser.getPublic())),
                "auth", EcKeys.b64url(auth)));
        assertThat(exchange(HttpMethod.POST, "/api/push/subscriptions", bobToken, subscription).getStatusCode().value())
                .isEqualTo(204);
        // Same endpoint twice is an idempotent upsert.
        exchange(HttpMethod.POST, "/api/push/subscriptions", bobToken, subscription);
        assertThat(subscriptions.findByUserId(bob.get("user").get("id").asLong())).hasSize(1);

        // Only real push services are accepted (no SSRF to arbitrary hosts).
        assertThat(exchange(HttpMethod.POST, "/api/push/subscriptions", bobToken, Map.of("endpoint", "https://evil.example.com/x",
                "keys", subscription.get("keys"))).getStatusCode().value()).isEqualTo(400);

        long conversationId = call(HttpMethod.POST, "/api/conversations/direct", aliceToken,
                Map.of("userId", bob.get("user").get("id").asLong())).get("id").asLong();
        call(HttpMethod.POST, "/api/conversations/" + conversationId + "/messages", aliceToken,
                Map.of("content", "Hey Bob, are you there? 🔔"));

        Received push = received.poll(10, TimeUnit.SECONDS);
        assertThat(push).as("push delivered").isNotNull();
        assertThat(push.path()).isEqualTo("/push/bob-device");
        assertThat(push.headers()).containsEntry("content-encoding", "aes128gcm").containsEntry("ttl", "86400")
                .containsEntry("urgency", "high").containsEntry("topic", "conv-" + conversationId);
        assertThat(push.headers().get("authorization")).startsWith("vapid t=").endsWith(", k=" + vapidPublic);

        JsonNode payload = json.readTree(new String(PushTestSupport.decrypt(push.body(), browser, auth), StandardCharsets.UTF_8));
        assertThat(payload.get("title").asText()).isEqualTo("Alice Push");
        assertThat(payload.get("body").asText()).isEqualTo("Hey Bob, are you there? 🔔");
        assertThat(payload.get("conversationId").asLong()).isEqualTo(conversationId);
        assertThat(payload.get("url").asText()).isEqualTo("/c/" + conversationId);
        assertThat(payload.get("badge").asLong()).isEqualTo(1);

        // The sender never gets a push for their own message; Bob's reply doesn't push Bob.
        call(HttpMethod.POST, "/api/conversations/" + conversationId + "/messages", bobToken, Map.of("content", "Yes!"));
        assertThat(received.poll(1500, TimeUnit.MILLISECONDS)).isNull();

        // Muted conversations stay quiet.
        JsonNode muted = call(HttpMethod.PUT, "/api/conversations/" + conversationId + "/mute", bobToken, Map.of("muted", true));
        assertThat(muted.get("muted").asBoolean()).isTrue();
        assertThat(call(HttpMethod.GET, "/api/conversations", bobToken, null).get(0).get("muted").asBoolean()).isTrue();
        call(HttpMethod.POST, "/api/conversations/" + conversationId + "/messages", aliceToken, Map.of("content", "muted?"));
        assertThat(received.poll(1500, TimeUnit.MILLISECONDS)).isNull();
        call(HttpMethod.PUT, "/api/conversations/" + conversationId + "/mute", bobToken, Map.of("muted", false));

        // Test notification endpoint.
        assertThat(call(HttpMethod.POST, "/api/push/test", bobToken, Map.of()).get("devices").asInt()).isEqualTo(1);
        JsonNode test = json.readTree(PushTestSupport.decrypt(received.poll(10, TimeUnit.SECONDS).body(), browser, auth));
        assertThat(test.get("type").asText()).isEqualTo("test");

        // A 410 from the push service removes the dead subscription.
        nextStatus.set(410);
        call(HttpMethod.POST, "/api/conversations/" + conversationId + "/messages", aliceToken, Map.of("content", "gone?"));
        assertThat(received.poll(10, TimeUnit.SECONDS)).isNotNull();
        long deadline = System.currentTimeMillis() + 5000;
        while (!subscriptions.findByUserId(bob.get("user").get("id").asLong()).isEmpty() && System.currentTimeMillis() < deadline) {
            Thread.sleep(50);
        }
        assertThat(subscriptions.findByUserId(bob.get("user").get("id").asLong())).isEmpty();
        nextStatus.set(201);
    }

    private JsonNode register(String username, String displayName) throws Exception {
        ResponseEntity<String> response = rest.postForEntity("/api/auth/register",
                Map.of("username", username, "displayName", displayName, "password", "secret123"), String.class);
        return json.readTree(response.getBody());
    }

    private ResponseEntity<String> exchange(HttpMethod method, String path, String token, Object body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return rest.exchange(path, method, new HttpEntity<>(body, headers), String.class);
    }

    private JsonNode call(HttpMethod method, String path, String token, Object body) throws Exception {
        ResponseEntity<String> response = exchange(method, path, token, body);
        assertThat(response.getStatusCode().is2xxSuccessful()).as(response.getBody()).isTrue();
        return response.getBody() == null ? null : json.readTree(response.getBody());
    }
}
