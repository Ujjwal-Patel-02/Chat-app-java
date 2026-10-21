package com.aurora.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.lang.reflect.Type;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Real server + real STOMP clients: verifies push delivery, typing signals, presence and auth. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.datasource.url=jdbc:h2:mem:aurora-ws;DB_CLOSE_DELAY=-1")
class WebSocketIntegrationTest {

    @LocalServerPort
    int port;

    @Autowired
    TestRestTemplate rest;

    @Autowired
    ObjectMapper json;

    private final WebSocketStompClient stompClient = new WebSocketStompClient(new StandardWebSocketClient());

    @AfterEach
    void stop() {
        stompClient.stop();
    }

    @Test
    void pushesMessagesTypingReactionsAndPresence() throws Exception {
        JsonNode alice = register("wsalice", "WS Alice");
        JsonNode bob = register("wsbob", "WS Bob");
        String aliceToken = alice.get("token").asText();
        String bobToken = bob.get("token").asText();

        // Bob connects and listens to his private queue and the presence topic.
        StompSession bobSession = connect(bobToken);
        BlockingQueue<JsonNode> bobEvents = subscribe(bobSession, "/user/queue/events");
        BlockingQueue<JsonNode> presence = subscribe(bobSession, "/topic/presence");
        Thread.sleep(300);

        // Alice starts a DM: Bob is told about the new conversation.
        JsonNode conversation = call(HttpMethod.POST, "/api/conversations/direct", aliceToken,
                Map.of("userId", bob.get("user").get("id").asLong()));
        long conversationId = conversation.get("id").asLong();
        JsonNode upsert = next(bobEvents, "CONVERSATION_UPSERTED");
        assertThat(upsert.get("conversationId").asLong()).isEqualTo(conversationId);

        // Alice comes online.
        StompSession aliceSession = connect(aliceToken);
        JsonNode online = poll(presence);
        assertThat(online.get("userId").asLong()).isEqualTo(alice.get("user").get("id").asLong());
        assertThat(online.get("online").asBoolean()).isTrue();

        // Typing indicator goes to the other member only.
        aliceSession.send("/app/conversations/" + conversationId + "/typing", "{\"typing\":true}".getBytes());
        JsonNode typing = next(bobEvents, "TYPING");
        assertThat(typing.get("payload").get("user").get("username").asText()).isEqualTo("wsalice");
        assertThat(typing.get("payload").get("typing").asBoolean()).isTrue();

        // A REST send is pushed in real time.
        JsonNode sent = call(HttpMethod.POST, "/api/conversations/" + conversationId + "/messages", aliceToken,
                Map.of("content", "Real-time hello ⚡"));
        JsonNode created = next(bobEvents, "MESSAGE_CREATED");
        assertThat(created.get("payload").get("content").asText()).isEqualTo("Real-time hello ⚡");

        // Reactions are pushed too.
        call(HttpMethod.POST, "/api/messages/" + sent.get("id").asLong() + "/reactions", aliceToken,
                Map.of("emoji", "🔥"));
        JsonNode reactions = next(bobEvents, "REACTIONS_UPDATED");
        assertThat(reactions.get("payload").get("reactions").get(0).get("emoji").asText()).isEqualTo("🔥");

        // Alice disconnects: offline presence with a last-seen timestamp.
        aliceSession.disconnect();
        JsonNode offline = poll(presence);
        assertThat(offline.get("online").asBoolean()).isFalse();
        assertThat(offline.get("lastSeenAt").isNull()).isFalse();
        bobSession.disconnect();
    }

    @Test
    void rejectsConnectionsWithoutAValidToken() {
        assertThrows(Exception.class, () -> connect("garbage"));
    }

    @Test
    void cannotSubscribeToOtherDestinations() throws Exception {
        JsonNode eve = register("wseve", "WS Eve");
        StompSession session = connect(eve.get("token").asText());
        session.subscribe("/queue/events-user123", new NoopHandler());
        // The server answers a forbidden subscription with an ERROR frame and closes the session.
        long deadline = System.currentTimeMillis() + 5000;
        while (session.isConnected() && System.currentTimeMillis() < deadline) {
            Thread.sleep(50);
        }
        assertThat(session.isConnected()).isFalse();
    }

    private StompSession connect(String token) throws Exception {
        StompHeaders headers = new StompHeaders();
        headers.add("Authorization", "Bearer " + token);
        return stompClient.connectAsync("ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(), headers,
                new StompSessionHandlerAdapter() {
                }).get(5, TimeUnit.SECONDS);
    }

    private BlockingQueue<JsonNode> subscribe(StompSession session, String destination) {
        BlockingQueue<JsonNode> queue = new LinkedBlockingQueue<>();
        session.subscribe(destination, new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return byte[].class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                try {
                    queue.add(json.readTree((byte[]) payload));
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            }
        });
        return queue;
    }

    private static JsonNode poll(BlockingQueue<JsonNode> queue) throws InterruptedException {
        JsonNode node = queue.poll(5, TimeUnit.SECONDS);
        assertThat(node).as("expected a WebSocket event").isNotNull();
        return node;
    }

    /** Next event of the given type, skipping unrelated ones. */
    private static JsonNode next(BlockingQueue<JsonNode> queue, String type) throws InterruptedException {
        for (int i = 0; i < 10; i++) {
            JsonNode node = poll(queue);
            if (type.equals(node.get("type").asText())) {
                return node;
            }
        }
        throw new AssertionError("No " + type + " event received");
    }

    private JsonNode register(String username, String displayName) throws Exception {
        ResponseEntity<String> response = rest.postForEntity("/api/auth/register",
                Map.of("username", username, "displayName", displayName, "password", "secret123"), String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        return json.readTree(response.getBody());
    }

    private JsonNode call(HttpMethod method, String path, String token, Object body) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> response = rest.exchange(path, method, new HttpEntity<>(body, headers), String.class);
        assertThat(response.getStatusCode().is2xxSuccessful()).as(response.getBody()).isTrue();
        return json.readTree(response.getBody());
    }

    private static final class NoopHandler implements StompFrameHandler {
        @Override
        public Type getPayloadType(StompHeaders headers) {
            return byte[].class;
        }

        @Override
        public void handleFrame(StompHeaders headers, Object payload) {
        }
    }
}
