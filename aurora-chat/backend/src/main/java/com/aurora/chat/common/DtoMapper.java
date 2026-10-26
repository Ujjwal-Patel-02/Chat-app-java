package com.aurora.chat.common;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.aurora.chat.chat.Conversation;
import com.aurora.chat.chat.Message;
import com.aurora.chat.chat.Reaction;
import com.aurora.chat.dto.AttachmentDto;
import com.aurora.chat.dto.ConversationDto;
import com.aurora.chat.dto.MessageDto;
import com.aurora.chat.dto.ReactionDto;
import com.aurora.chat.dto.ReadStateDto;
import com.aurora.chat.dto.ReplyPreviewDto;
import com.aurora.chat.dto.UserDto;
import com.aurora.chat.dto.UserSummaryDto;
import com.aurora.chat.media.Attachment;
import com.aurora.chat.media.MediaKind;
import com.aurora.chat.user.PresenceService;
import com.aurora.chat.user.User;

/** Entity → API model mapping. Must be called inside a transaction (lazy associations). */
@Component
public class DtoMapper {

    private static final int REPLY_SNIPPET_LENGTH = 160;

    private final PresenceService presence;

    public DtoMapper(PresenceService presence) {
        this.presence = presence;
    }

    public UserDto user(User user) {
        return new UserDto(user.getId(), user.getUsername(), user.getDisplayName(),
                presence.isOnline(user.getId()), user.getLastSeenAt(), user.getCreatedAt());
    }

    public UserSummaryDto summary(User user) {
        return new UserSummaryDto(user.getId(), user.getUsername(), user.getDisplayName());
    }

    public AttachmentDto attachment(Attachment a) {
        return new AttachmentDto(a.getId(), a.getKind().name(), a.getUrl(), a.getThumbnailUrl(), a.getMimeType(),
                a.getSizeBytes(), a.getWidth(), a.getHeight(), a.getDurationMs(), a.getPlaceholder(), a.getOriginalName());
    }

    public MessageDto message(Message message) {
        return message(message, null);
    }

    public MessageDto message(Message message, String clientId) {
        ReplyPreviewDto reply = null;
        Message original = message.getReplyTo();
        if (original != null) {
            List<Attachment> media = original.isDeleted() ? List.of() : original.getAttachments();
            Attachment first = media.isEmpty() ? null : media.get(0);
            String thumb = first == null ? null
                    : first.getThumbnailUrl() != null ? first.getThumbnailUrl()
                    : first.getKind() == MediaKind.IMAGE ? first.getUrl() : null;
            reply = new ReplyPreviewDto(original.getId(), summary(original.getSender()),
                    original.isDeleted() ? null : snippet(original.getContent()), original.isDeleted(),
                    first == null ? null : first.getKind().name(), media.size(), thumb);
        }
        boolean deleted = message.isDeleted();
        return new MessageDto(
                message.getId(),
                message.getConversation().getId(),
                summary(message.getSender()),
                deleted ? null : message.getContent(),
                message.getCreatedAt(),
                message.getEditedAt(),
                deleted,
                reply,
                deleted ? List.of() : reactions(message),
                deleted ? List.of() : message.getAttachments().stream().map(this::attachment).toList(),
                clientId);
    }

    /** Groups reactions by emoji, keeping first-reacted order. */
    public List<ReactionDto> reactions(Message message) {
        Map<String, List<UserSummaryDto>> byEmoji = new LinkedHashMap<>();
        for (Reaction reaction : message.getReactions()) {
            byEmoji.computeIfAbsent(reaction.getEmoji(), key -> new ArrayList<>()).add(summary(reaction.getUser()));
        }
        return byEmoji.entrySet().stream()
                .map(entry -> new ReactionDto(entry.getKey(), entry.getValue().size(), entry.getValue()))
                .toList();
    }

    /** {@code viewerId} decides the viewer-specific "muted" flag (null = not muted). */
    public ConversationDto conversation(Conversation conversation, MessageDto lastMessage, long unreadCount, Long viewerId) {
        List<UserDto> members = conversation.getMembers().stream().map(member -> user(member.getUser())).toList();
        List<ReadStateDto> readStates = conversation.getMembers().stream()
                .map(member -> new ReadStateDto(member.getUser().getId(), member.getLastReadMessageId()))
                .toList();
        boolean muted = viewerId != null && conversation.getMembers().stream()
                .anyMatch(member -> member.getUser().getId().equals(viewerId) && member.isMuted());
        return new ConversationDto(conversation.getId(), conversation.getType().name(), conversation.getName(),
                members, lastMessage, unreadCount, readStates, muted, conversation.getCreatedAt(),
                conversation.getUpdatedAt());
    }

    private static String snippet(String content) {
        if (content == null || content.length() <= REPLY_SNIPPET_LENGTH) {
            return content;
        }
        return content.substring(0, REPLY_SNIPPET_LENGTH - 1) + "…";
    }
}
