package com.aurora.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** End-to-end REST flow: accounts, direct + group chats, messages, replies, reactions, edits, deletes. */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:aurora-flow;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class ChatFlowIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    record Account(String token, long id) {
    }

    @Test
    void healthIsPublicAndApiRequiresAuth() throws Exception {
        mvc.perform(get("/api/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(get("/api/conversations")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").exists());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer not-a-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void registrationAndLogin() throws Exception {
        Account zoe = register("Zoe_1", "Zoe One", "secret123");
        mvc.perform(auth(get("/api/auth/me"), zoe)).andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("zoe_1"))
                .andExpect(jsonPath("$.displayName").value("Zoe One"));

        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("username", "zoe_1", "displayName", "Again", "password", "secret123"))))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("username", "x", "displayName", "Short", "password", "secret123"))))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("username", "zoe_1", "password", "wrong-password"))))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("username", "@ZOE_1", "password", "secret123"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void fullConversationFlow() throws Exception {
        Account alice = register("alice", "Alice Doe", "secret123");
        Account bob = register("bob", "Bob Roe", "secret123");
        Account carol = register("carol", "Carol Poe", "secret123");

        // People directory excludes the caller.
        JsonNode people = read(mvc.perform(auth(get("/api/users").param("query", "bo"), alice))
                .andExpect(status().isOk()));
        assertThat(people.findValuesAsText("username")).contains("bob").doesNotContain("alice");

        // Direct conversation is created once and reused.
        long dm = read(mvc.perform(auth(post("/api/conversations/direct"), alice)
                        .contentType(MediaType.APPLICATION_JSON).content(body(Map.of("userId", bob.id()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("DIRECT"))
                .andExpect(jsonPath("$.members.length()").value(2))).get("id").asLong();
        mvc.perform(auth(post("/api/conversations/direct"), bob)
                        .contentType(MediaType.APPLICATION_JSON).content(body(Map.of("userId", alice.id()))))
                .andExpect(jsonPath("$.id").value(dm));

        // Send a message (clientId is echoed for optimistic UI reconciliation).
        long first = read(mvc.perform(auth(post("/api/conversations/" + dm + "/messages"), alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("content", "  Hi Bob! 👋  ", "clientId", "tmp-1"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.content").value("Hi Bob! 👋"))
                .andExpect(jsonPath("$.clientId").value("tmp-1"))
                .andExpect(jsonPath("$.sender.username").value("alice"))).get("id").asLong();

        mvc.perform(auth(get("/api/conversations"), bob)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(dm))
                .andExpect(jsonPath("$[0].unreadCount").value(1))
                .andExpect(jsonPath("$[0].lastMessage.content").value("Hi Bob! 👋"));

        // Reply.
        long reply = read(mvc.perform(auth(post("/api/conversations/" + dm + "/messages"), bob)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("content", "Hey Alice!", "replyToId", first))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.replyTo.id").value(first))
                .andExpect(jsonPath("$.replyTo.content").value("Hi Bob! 👋"))
                .andExpect(jsonPath("$.replyTo.sender.displayName").value("Alice Doe"))).get("id").asLong();

        // Reactions toggle per user + emoji.
        react(bob, first, "👍").andExpect(status().isOk())
                .andExpect(jsonPath("$.reactions[0].emoji").value("👍"))
                .andExpect(jsonPath("$.reactions[0].count").value(1));
        react(alice, first, "👍").andExpect(jsonPath("$.reactions[0].count").value(2));
        react(alice, first, "❤️").andExpect(jsonPath("$.reactions.length()").value(2));
        react(bob, first, "👍").andExpect(jsonPath("$.reactions[0].count").value(1))
                .andExpect(jsonPath("$.reactions[0].users[0].username").value("alice"));
        react(bob, first, "hello").andExpect(status().isBadRequest());

        // Read markers.
        mvc.perform(auth(post("/api/conversations/" + dm + "/read"), alice)
                        .contentType(MediaType.APPLICATION_JSON).content(body(Map.of("messageId", reply))))
                .andExpect(status().isNoContent());
        mvc.perform(auth(get("/api/conversations"), alice))
                .andExpect(jsonPath("$[0].unreadCount").value(0));

        // Edit: only the author.
        mvc.perform(auth(patch("/api/messages/" + first), alice).contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("content", "Hi Bob, edited"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("Hi Bob, edited"))
                .andExpect(jsonPath("$.editedAt").isNotEmpty());
        mvc.perform(auth(patch("/api/messages/" + first), bob).contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("content", "hacked"))))
                .andExpect(status().isForbidden());

        // Delete: content and reactions disappear, replies show the original as deleted.
        mvc.perform(auth(delete("/api/messages/" + first), alice)).andExpect(status().isOk())
                .andExpect(jsonPath("$.deleted").value(true))
                .andExpect(jsonPath("$.content").doesNotExist())
                .andExpect(jsonPath("$.reactions.length()").value(0));
        mvc.perform(auth(get("/api/conversations/" + dm + "/messages"), bob)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].deleted").value(true))
                .andExpect(jsonPath("$[1].replyTo.deleted").value(true));
        react(bob, first, "😂").andExpect(status().isBadRequest());

        // Outsiders can't see or touch the conversation.
        mvc.perform(auth(get("/api/conversations/" + dm + "/messages"), carol)).andExpect(status().isNotFound());
        react(carol, reply, "😂").andExpect(status().isNotFound());
        mvc.perform(auth(post("/api/conversations/" + dm + "/messages"), carol)
                        .contentType(MediaType.APPLICATION_JSON).content(body(Map.of("content", "let me in"))))
                .andExpect(status().isNotFound());

        // Validation.
        mvc.perform(auth(post("/api/conversations/" + dm + "/messages"), alice)
                        .contentType(MediaType.APPLICATION_JSON).content(body(Map.of("content", "   "))))
                .andExpect(status().isBadRequest());

        // Groups.
        long group = read(mvc.perform(auth(post("/api/conversations/group"), alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("name", "  Weekend   plans ", "memberIds", new long[] {bob.id(), carol.id()}))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("GROUP"))
                .andExpect(jsonPath("$.name").value("Weekend plans"))
                .andExpect(jsonPath("$.members.length()").value(3))).get("id").asLong();
        mvc.perform(auth(post("/api/conversations/" + group + "/messages"), carol)
                        .contentType(MediaType.APPLICATION_JSON).content(body(Map.of("content", "Hiking? 🥾"))))
                .andExpect(status().isCreated());
        JsonNode aliceConversations = read(mvc.perform(auth(get("/api/conversations"), alice)));
        assertThat(aliceConversations.get(0).get("id").asLong()).isEqualTo(group);
        assertThat(aliceConversations.get(0).get("unreadCount").asLong()).isEqualTo(1);

        // Pagination returns older messages before a given id in chronological order.
        for (int i = 1; i <= 5; i++) {
            mvc.perform(auth(post("/api/conversations/" + group + "/messages"), bob)
                    .contentType(MediaType.APPLICATION_JSON).content(body(Map.of("content", "msg " + i))));
        }
        JsonNode latest = read(mvc.perform(auth(get("/api/conversations/" + group + "/messages")
                .param("limit", "3"), alice)));
        assertThat(latest.findValuesAsText("content")).containsExactly("msg 3", "msg 4", "msg 5");
        JsonNode older = read(mvc.perform(auth(get("/api/conversations/" + group + "/messages")
                .param("limit", "3").param("before", latest.get(0).get("id").asText()), alice)));
        assertThat(older.findValuesAsText("content")).containsExactly("Hiking? 🥾", "msg 1", "msg 2");
    }

    private Account register(String username, String displayName, String password) throws Exception {
        JsonNode node = read(mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("username", username, "displayName", displayName, "password", password))))
                .andExpect(status().isCreated()));
        return new Account(node.get("token").asText(), node.get("user").get("id").asLong());
    }

    private ResultActions react(Account account, long messageId, String emoji) throws Exception {
        return mvc.perform(auth(post("/api/messages/" + messageId + "/reactions"), account)
                .contentType(MediaType.APPLICATION_JSON).content(body(Map.of("emoji", emoji))));
    }

    private static MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder builder, Account account) {
        return builder.header("Authorization", "Bearer " + account.token());
    }

    private String body(Object value) throws Exception {
        return json.writeValueAsString(value);
    }

    private JsonNode read(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsByteArray());
    }
}
