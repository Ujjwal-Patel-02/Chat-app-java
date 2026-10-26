package com.aurora.chat.push;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.aurora.chat.chat.ConversationType;
import com.aurora.chat.chat.Message;
import com.aurora.chat.chat.MessageRepository;
import com.aurora.chat.config.AppProperties;
import com.aurora.chat.media.Attachment;
import com.aurora.chat.media.MediaKind;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Turns new messages into Web Push notifications for the other (non-muted) members. Runs after the
 * transaction commits, on a background thread, so sending a message never waits for push services.
 * The service worker skips showing it when the app is already open and focused.
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private static final int BODY_LIMIT = 180;

    private record Delivery(PushSubscription subscription, byte[] payload, Long conversationId) {
    }

    private final MessageRepository messages;
    private final PushSubscriptionRepository subscriptions;
    private final PushService pushService;
    private final TransactionTemplate transactions;
    private final TaskExecutor backgroundExecutor;
    private final ObjectMapper json;
    private final String publicBaseUrl;

    public NotificationService(MessageRepository messages, PushSubscriptionRepository subscriptions,
                               PushService pushService, TransactionTemplate transactions, TaskExecutor backgroundExecutor,
                               ObjectMapper json, AppProperties properties) {
        this.messages = messages;
        this.subscriptions = subscriptions;
        this.pushService = pushService;
        this.transactions = transactions;
        this.backgroundExecutor = backgroundExecutor;
        this.json = json;
        this.publicBaseUrl = properties.publicBaseUrl();
    }

    /** Schedules notifications for a just-sent message once the current transaction commits. */
    public void messageCreated(Long messageId) {
        if (!pushService.enabled()) {
            return;
        }
        Runnable task = () -> backgroundExecutor.execute(() -> {
            try {
                notifyNewMessage(messageId);
            } catch (RuntimeException e) {
                log.warn("Could not send notifications for message {}", messageId, e);
            }
        });
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }
            });
        } else {
            task.run();
        }
    }

    void notifyNewMessage(Long messageId) {
        List<Delivery> deliveries = transactions.execute(status -> prepare(messageId));
        if (deliveries != null) {
            deliveries.forEach(d -> pushService.deliver(d.subscription(), d.payload(), "conv-" + d.conversationId(), true));
        }
    }

    private List<Delivery> prepare(Long messageId) {
        Message message = messages.findById(messageId).orElse(null);
        if (message == null || message.isDeleted()) {
            return List.of();
        }
        var conversation = message.getConversation();
        Long senderId = message.getSender().getId();
        Set<Long> recipients = conversation.getMembers().stream()
                .filter(member -> !member.getUser().getId().equals(senderId))
                .filter(member -> !member.isMuted())
                .map(member -> member.getUser().getId())
                .collect(Collectors.toSet());
        if (recipients.isEmpty()) {
            return List.of();
        }
        List<PushSubscription> targets = subscriptions.findByUserIdIn(recipients);
        if (targets.isEmpty()) {
            return List.of();
        }

        boolean group = conversation.getType() == ConversationType.GROUP;
        String senderName = message.getSender().getDisplayName();
        String title = group ? conversation.getName() : senderName;
        String text = describe(message);
        String body = group ? firstName(senderName) + ": " + text : text;
        String image = imageFor(message);

        Map<Long, byte[]> payloadByUser = new LinkedHashMap<>();
        for (PushSubscription target : targets) {
            Long userId = target.getUser().getId();
            payloadByUser.computeIfAbsent(userId, id -> {
                long unread = messages.countUnreadByConversation(id).stream().mapToLong(row -> (Long) row[1]).sum();
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("type", "message");
                payload.put("conversationId", conversation.getId());
                payload.put("messageId", message.getId());
                payload.put("title", title);
                payload.put("body", body);
                payload.put("tag", "conversation-" + conversation.getId());
                payload.put("url", "/c/" + conversation.getId());
                payload.put("badge", unread);
                payload.put("timestamp", message.getCreatedAt().toEpochMilli());
                if (image != null) {
                    payload.put("image", image);
                }
                return toJson(payload);
            });
        }
        return targets.stream().map(t -> new Delivery(t, payloadByUser.get(t.getUser().getId()), conversation.getId())).toList();
    }

    /** Payload for "Send test notification". */
    public byte[] testPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "test");
        payload.put("title", "Aurora Chat");
        payload.put("body", "Notifications are working 🎉");
        payload.put("tag", "aurora-test");
        payload.put("url", "/");
        payload.put("timestamp", Instant.now().toEpochMilli());
        return toJson(payload);
    }

    private static String describe(Message message) {
        String caption = message.getContent() == null ? "" : message.getContent().strip();
        List<Attachment> attachments = message.getAttachments();
        String media = "";
        if (!attachments.isEmpty()) {
            long videos = attachments.stream().filter(a -> a.getKind() == MediaKind.VIDEO).count();
            long photos = attachments.size() - videos;
            if (videos == 0) {
                media = photos == 1 ? "📷 Photo" : "📷 " + photos + " photos";
            } else if (photos == 0) {
                media = videos == 1 ? "🎥 Video" : "🎥 " + videos + " videos";
            } else {
                media = "📎 " + attachments.size() + " photos & videos";
            }
        }
        String text = media.isEmpty() ? caption : caption.isEmpty() ? media : media + " · " + caption;
        return text.length() > BODY_LIMIT ? text.substring(0, BODY_LIMIT - 1) + "…" : text;
    }

    private String imageFor(Message message) {
        for (Attachment attachment : message.getAttachments()) {
            String url = attachment.getKind() == MediaKind.IMAGE ? attachment.getUrl() : attachment.getThumbnailUrl();
            if (url == null) {
                continue;
            }
            if (url.startsWith("https://")) {
                return url;
            }
            if (url.startsWith("/") && publicBaseUrl.startsWith("https://")) {
                return publicBaseUrl + url;
            }
        }
        return null;
    }

    private static String firstName(String name) {
        int space = name.indexOf(' ');
        return space > 0 ? name.substring(0, space) : name;
    }

    private byte[] toJson(Map<String, Object> payload) {
        try {
            return json.writeValueAsBytes(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
