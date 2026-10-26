package com.aurora.chat.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:aurora-media;DB_CLOSE_DELAY=-1",
        "app.media.local-dir=target/test-media",
        "app.media.max-image-mb=1"})
@AutoConfigureMockMvc
class MediaIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @Autowired
    MediaService mediaService;

    @Autowired
    AttachmentRepository attachments;

    record Account(String token, long id) {
    }

    @Test
    void photoAndVideoSharingFlow() throws Exception {
        Account ana = register("mediaana", "Ana Media");
        Account ben = register("mediaben", "Ben Media");
        Account cat = register("mediacat", "Cat Media");
        long dm = read(mvc.perform(auth(post("/api/conversations/direct"), ana).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("userId", ben.id()))))).get("id").asLong();

        // Upload a photo (with dimensions + blurred placeholder).
        byte[] jpeg = jpeg(64, 48);
        JsonNode photo = read(mvc.perform(auth(multipart("/api/media").file(new MockMultipartFile("file", "beach.jpg", "image/jpeg", jpeg))
                        .param("width", "64").param("height", "48").param("placeholder", "data:image/jpeg;base64,AAAA"), ana))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("IMAGE"))
                .andExpect(jsonPath("$.mimeType").value("image/jpeg"))
                .andExpect(jsonPath("$.width").value(64))
                .andExpect(jsonPath("$.placeholder").value("data:image/jpeg;base64,AAAA"))
                .andExpect(jsonPath("$.name").value("beach.jpg")));
        String photoUrl = photo.get("url").asText();
        assertThat(photoUrl).isEqualTo("/api/media/" + photo.get("id").asText());

        // Public capability URL, cacheable, with HTTP range support (used by video players).
        mvc.perform(get(photoUrl)).andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("immutable")));
        mvc.perform(get(photoUrl).header("Range", "bytes=0-9")).andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 0-9/" + jpeg.length));

        // ?download=true makes browsers save the file, with a neutral generated name.
        mvc.perform(get(photoUrl).param("download", "true")).andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.matchesPattern(
                        "attachment; filename=\"aurora-\\d{8}-\\d{6}-[0-9a-f]{4}\\.jpg\"")));
        mvc.perform(get(photoUrl)).andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("inline;")));

        // Upload a video with a client-generated poster frame.
        byte[] mp4 = new byte[256];
        System.arraycopy("\0\0\0\u0018ftypisom".getBytes(StandardCharsets.ISO_8859_1), 0, mp4, 0, 12);
        JsonNode video = read(mvc.perform(auth(multipart("/api/media")
                        .file(new MockMultipartFile("file", "clip.mp4", "video/mp4", mp4))
                        .file(new MockMultipartFile("poster", "poster.jpg", "image/jpeg", jpeg(32, 18)))
                        .param("durationMs", "4200"), ana))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("VIDEO"))
                .andExpect(jsonPath("$.durationMs").value(4200)));
        mvc.perform(get(video.get("thumbnailUrl").asText())).andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"));

        // Disguised or unsupported files are refused, as are oversized photos.
        mvc.perform(auth(multipart("/api/media").file(new MockMultipartFile("file", "x.jpg", "image/jpeg",
                "<svg onload=alert(1)>".getBytes(StandardCharsets.UTF_8))), ana)).andExpect(status().isUnsupportedMediaType());
        byte[] huge = new byte[1024 * 1024 + 10];
        huge[0] = (byte) 0xFF; huge[1] = (byte) 0xD8; huge[2] = (byte) 0xFF;
        mvc.perform(auth(multipart("/api/media").file(new MockMultipartFile("file", "big.jpg", "image/jpeg", huge)), ana))
                .andExpect(status().isPayloadTooLarge());
        mvc.perform(multipart("/api/media").file(new MockMultipartFile("file", "a.jpg", "image/jpeg", jpeg)))
                .andExpect(status().isUnauthorized());

        // Someone else can't send my upload.
        mvc.perform(auth(post("/api/conversations/" + dm + "/messages"), ben).contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("attachmentIds", new String[] {photo.get("id").asText()}))))
                .andExpect(status().isForbidden());

        // A media-only message (no caption) with two attachments, in order.
        JsonNode message = read(mvc.perform(auth(post("/api/conversations/" + dm + "/messages"), ana)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("attachmentIds", new String[] {photo.get("id").asText(), video.get("id").asText()}))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.content").doesNotExist())
                .andExpect(jsonPath("$.attachments.length()").value(2))
                .andExpect(jsonPath("$.attachments[0].kind").value("IMAGE"))
                .andExpect(jsonPath("$.attachments[1].kind").value("VIDEO")));
        long messageId = message.get("id").asLong();

        // Re-sending the same upload is refused; empty messages still are.
        mvc.perform(auth(post("/api/conversations/" + dm + "/messages"), ana).contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("attachmentIds", new String[] {photo.get("id").asText()}))))
                .andExpect(status().isBadRequest());
        mvc.perform(auth(post("/api/conversations/" + dm + "/messages"), ana).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("content", "  ")))).andExpect(status().isBadRequest());

        // Captions can be added and removed again on media messages.
        mvc.perform(auth(patch("/api/messages/" + messageId), ana).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("content", "Beach day 🏖️")))).andExpect(jsonPath("$.content").value("Beach day 🏖️"));
        mvc.perform(auth(patch("/api/messages/" + messageId), ana).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("content", "")))).andExpect(status().isOk()).andExpect(jsonPath("$.content").doesNotExist());

        // Replies show a thumbnail of the original media; conversation list shows it as the last message.
        mvc.perform(auth(post("/api/conversations/" + dm + "/messages"), ben).contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("content", "Wow!", "replyToId", messageId))))
                .andExpect(jsonPath("$.replyTo.attachmentKind").value("IMAGE"))
                .andExpect(jsonPath("$.replyTo.attachmentCount").value(2))
                .andExpect(jsonPath("$.replyTo.thumbnailUrl").value(photoUrl));

        // Shared media gallery: members only.
        mvc.perform(auth(get("/api/conversations/" + dm + "/media"), ben)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].attachment.kind").value("IMAGE"))
                .andExpect(jsonPath("$[0].messageId").value(messageId))
                .andExpect(jsonPath("$[0].sender.username").value("mediaana"));
        mvc.perform(auth(get("/api/conversations/" + dm + "/media"), cat)).andExpect(status().isNotFound());

        // Deleting the message deletes its files.
        mvc.perform(auth(delete("/api/messages/" + messageId), ana)).andExpect(jsonPath("$.attachments.length()").value(0));
        mvc.perform(get(photoUrl)).andExpect(status().isNotFound());
        mvc.perform(auth(get("/api/conversations/" + dm + "/media"), ben)).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void unsentUploadsAreCleanedUp() throws Exception {
        Account dan = register("mediadan", "Dan Media");
        JsonNode upload = read(mvc.perform(auth(multipart("/api/media")
                .file(new MockMultipartFile("file", "a.png", "image/png", png())), dan)).andExpect(status().isCreated()));
        String id = upload.get("id").asText();
        Attachment attachment = attachments.findById(id).orElseThrow();
        attachment.setCreatedAt(attachment.getCreatedAt().minusSeconds(3 * 24 * 3600));
        attachments.save(attachment);

        mediaService.cleanUpOrphans();

        assertThat(attachments.findById(id)).isEmpty();
        mvc.perform(get(upload.get("url").asText())).andExpect(status().isNotFound());
    }

    private static byte[] jpeg(int width, int height) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        var g = image.createGraphics();
        g.setPaint(new Color(120, 80, 220));
        g.fillRect(0, 0, width, height);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", out);
        return out.toByteArray();
    }

    private static byte[] png() throws Exception {
        BufferedImage image = new BufferedImage(8, 8, BufferedImage.TYPE_INT_ARGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private Account register(String username, String displayName) throws Exception {
        JsonNode node = read(mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("username", username, "displayName", displayName, "password", "secret123"))))
                .andExpect(status().isCreated()));
        return new Account(node.get("token").asText(), node.get("user").get("id").asLong());
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
