package com.aurora.chat.chat;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aurora.chat.common.ApiException;
import com.aurora.chat.common.DtoMapper;
import com.aurora.chat.dto.ChatEvent;
import com.aurora.chat.dto.MessageDto;
import com.aurora.chat.dto.ReactionsUpdatedDto;
import com.aurora.chat.dto.SendMessageRequest;
import com.aurora.chat.user.User;
import com.aurora.chat.user.UserRepository;

@Service
@Transactional
public class MessageService {

    public static final int DEFAULT_PAGE_SIZE = 40;
    public static final int MAX_PAGE_SIZE = 100;

    private final MessageRepository messages;
    private final ConversationMemberRepository members;
    private final UserRepository users;
    private final ConversationService conversationService;
    private final DtoMapper mapper;
    private final ChatEventPublisher events;

    public MessageService(MessageRepository messages, ConversationMemberRepository members, UserRepository users,
                          ConversationService conversationService, DtoMapper mapper, ChatEventPublisher events) {
        this.messages = messages;
        this.members = members;
        this.users = users;
        this.conversationService = conversationService;
        this.mapper = mapper;
        this.events = events;
    }

    /** A page of messages in chronological order, ending just before {@code beforeId} (or at the newest). */
    @Transactional(readOnly = true)
    public List<MessageDto> list(Long userId, Long conversationId, Long beforeId, int limit) {
        conversationService.requireMembership(conversationId, userId);
        PageRequest page = PageRequest.of(0, Math.max(1, Math.min(limit, MAX_PAGE_SIZE)));
        List<Message> newestFirst = beforeId == null
                ? messages.findByConversationIdOrderByIdDesc(conversationId, page)
                : messages.findByConversationIdAndIdLessThanOrderByIdDesc(conversationId, beforeId, page);
        List<MessageDto> result = new ArrayList<>(newestFirst.stream().map(mapper::message).toList());
        Collections.reverse(result);
        return result;
    }

    public MessageDto send(Long userId, Long conversationId, SendMessageRequest request) {
        Conversation conversation = conversationService.requireMembership(conversationId, userId);
        User sender = users.findById(userId).orElseThrow(() -> ApiException.unauthorized("Please sign in again."));
        String content = normalize(request.content());

        Message replyTo = null;
        if (request.replyToId() != null) {
            replyTo = messages.findById(request.replyToId())
                    .filter(original -> original.getConversation().getId().equals(conversationId))
                    .orElseThrow(() -> ApiException.badRequest(
                            "The message you're replying to isn't part of this conversation."));
            if (replyTo.isDeleted()) {
                throw ApiException.badRequest("You can't reply to a deleted message.");
            }
        }

        Message message = messages.save(new Message(conversation, sender, content, replyTo));
        conversation.touch(message.getCreatedAt());
        // Sending implies you've read everything up to your own message.
        members.findByConversationIdAndUserId(conversationId, userId)
                .ifPresent(member -> member.setLastReadMessageId(message.getId()));

        MessageDto dto = mapper.message(message, sanitizeClientId(request.clientId()));
        events.toUsers(members.findUserIdsByConversationId(conversationId),
                new ChatEvent("MESSAGE_CREATED", conversationId, dto));
        return dto;
    }

    public MessageDto edit(Long userId, Long messageId, String newContent) {
        Message message = requireOwnMessage(userId, messageId, "edit");
        if (message.isDeleted()) {
            throw ApiException.badRequest("This message was deleted.");
        }
        String content = normalize(newContent);
        if (!content.equals(message.getContent())) {
            message.edit(content);
            publishUpdate(message);
        }
        return mapper.message(message);
    }

    public MessageDto delete(Long userId, Long messageId) {
        Message message = requireOwnMessage(userId, messageId, "delete");
        if (!message.isDeleted()) {
            message.markDeleted();
            publishUpdate(message);
        }
        return mapper.message(message);
    }

    /** Adds the reaction if the user hasn't used this emoji on the message yet, otherwise removes it. */
    public ReactionsUpdatedDto toggleReaction(Long userId, Long messageId, String rawEmoji) {
        String emoji = validateEmoji(rawEmoji);
        Message message = messages.findById(messageId).orElseThrow(() -> ApiException.notFound("Message not found."));
        Long conversationId = message.getConversation().getId();
        conversationService.requireMembership(conversationId, userId);
        if (message.isDeleted()) {
            throw ApiException.badRequest("You can't react to a deleted message.");
        }

        Optional<Reaction> existing = message.getReactions().stream()
                .filter(r -> r.getUser().getId().equals(userId) && r.getEmoji().equals(emoji))
                .findFirst();
        if (existing.isPresent()) {
            message.getReactions().remove(existing.get());
        } else {
            User user = users.findById(userId).orElseThrow(() -> ApiException.unauthorized("Please sign in again."));
            message.getReactions().add(new Reaction(message, user, emoji));
        }

        ReactionsUpdatedDto dto = new ReactionsUpdatedDto(message.getId(), mapper.reactions(message));
        events.toUsers(members.findUserIdsByConversationId(conversationId),
                new ChatEvent("REACTIONS_UPDATED", conversationId, dto));
        return dto;
    }

    private Message requireOwnMessage(Long userId, Long messageId, String action) {
        Message message = messages.findById(messageId).orElseThrow(() -> ApiException.notFound("Message not found."));
        conversationService.requireMembership(message.getConversation().getId(), userId);
        if (!message.getSender().getId().equals(userId)) {
            throw ApiException.forbidden("You can only " + action + " your own messages.");
        }
        return message;
    }

    private void publishUpdate(Message message) {
        Long conversationId = message.getConversation().getId();
        events.toUsers(members.findUserIdsByConversationId(conversationId),
                new ChatEvent("MESSAGE_UPDATED", conversationId, mapper.message(message)));
    }

    private static String normalize(String content) {
        String value = content == null ? "" : content.strip();
        if (value.isEmpty()) {
            throw ApiException.badRequest("Messages can't be empty.");
        }
        if (value.length() > Message.MAX_LENGTH) {
            throw ApiException.badRequest("Messages can be up to " + Message.MAX_LENGTH + " characters.");
        }
        return value;
    }

    private static String sanitizeClientId(String clientId) {
        if (clientId == null || clientId.isBlank() || clientId.length() > 64) {
            return null;
        }
        return clientId;
    }

    /** Accepts emoji (including ZWJ sequences and skin tones), rejects plain text. */
    static String validateEmoji(String raw) {
        String emoji = raw == null ? "" : raw.strip();
        if (emoji.isEmpty() || emoji.length() > 32 || emoji.codePointCount(0, emoji.length()) > 12) {
            throw ApiException.badRequest("That reaction isn't a valid emoji.");
        }
        boolean hasPlainText = emoji.chars().anyMatch(ch -> ch < 128
                && (Character.isLetterOrDigit(ch) || Character.isWhitespace(ch) || ch == '<' || ch == '>'));
        if (hasPlainText) {
            throw ApiException.badRequest("That reaction isn't a valid emoji.");
        }
        return emoji;
    }
}
