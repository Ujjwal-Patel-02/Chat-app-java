package com.aurora.chat.chat;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aurora.chat.common.ApiException;
import com.aurora.chat.common.DtoMapper;
import com.aurora.chat.dto.ChatEvent;
import com.aurora.chat.dto.ConversationDto;
import com.aurora.chat.dto.ReadStateDto;
import com.aurora.chat.dto.TypingDto;
import com.aurora.chat.user.User;
import com.aurora.chat.user.UserRepository;

@Service
@Transactional
public class ConversationService {

    private final ConversationRepository conversations;
    private final ConversationMemberRepository members;
    private final MessageRepository messages;
    private final UserRepository users;
    private final DtoMapper mapper;
    private final ChatEventPublisher events;

    public ConversationService(ConversationRepository conversations, ConversationMemberRepository members,
                               MessageRepository messages, UserRepository users, DtoMapper mapper,
                               ChatEventPublisher events) {
        this.conversations = conversations;
        this.members = members;
        this.messages = messages;
        this.users = users;
        this.mapper = mapper;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public List<ConversationDto> listForUser(Long userId) {
        List<Conversation> list = conversations.findAllForUser(userId);
        if (list.isEmpty()) {
            return List.of();
        }
        Map<Long, Message> latest = messages.findLatestForConversations(list.stream().map(Conversation::getId).toList())
                .stream()
                .collect(Collectors.toMap(m -> m.getConversation().getId(), Function.identity()));
        Map<Long, Long> unread = unreadCounts(userId);
        return list.stream()
                .map(c -> {
                    Message last = latest.get(c.getId());
                    return mapper.conversation(c, last == null ? null : mapper.message(last),
                            unread.getOrDefault(c.getId(), 0L));
                })
                .toList();
    }

    /** Returns the existing direct conversation with {@code otherUserId}, creating it on first contact. */
    public ConversationDto getOrCreateDirect(Long userId, Long otherUserId) {
        if (userId.equals(otherUserId)) {
            throw ApiException.badRequest("You can't start a conversation with yourself.");
        }
        User me = requireUser(userId);
        User other = users.findById(otherUserId).orElseThrow(() -> ApiException.notFound("User not found."));
        String key = Math.min(userId, otherUserId) + ":" + Math.max(userId, otherUserId);

        Conversation existing = conversations.findByDirectKey(key).orElse(null);
        if (existing != null) {
            return toDtoFor(existing, userId);
        }
        Conversation conversation = Conversation.direct(key, me);
        conversation.addMember(me);
        conversation.addMember(other);
        conversations.save(conversation);

        ConversationDto dto = mapper.conversation(conversation, null, 0);
        events.toUsers(List.of(userId, otherUserId), new ChatEvent("CONVERSATION_UPSERTED", conversation.getId(), dto));
        return dto;
    }

    public ConversationDto createGroup(Long userId, String name, List<Long> memberIds) {
        User me = requireUser(userId);
        String groupName = name.trim().replaceAll("\\s+", " ");
        if (groupName.isEmpty()) {
            throw ApiException.badRequest("Give your group a name.");
        }
        Set<Long> ids = new LinkedHashSet<>(memberIds);
        ids.remove(userId);
        ids.remove(null);
        if (ids.isEmpty()) {
            throw ApiException.badRequest("Pick at least one person for the group.");
        }
        List<User> others = users.findAllById(ids);
        if (others.size() != ids.size()) {
            throw ApiException.badRequest("Some of the selected people no longer exist.");
        }

        Conversation conversation = Conversation.group(groupName, me);
        conversation.addMember(me);
        others.forEach(conversation::addMember);
        conversations.save(conversation);

        ConversationDto dto = mapper.conversation(conversation, null, 0);
        List<Long> recipients = conversation.getMembers().stream().map(m -> m.getUser().getId()).toList();
        events.toUsers(recipients, new ChatEvent("CONVERSATION_UPSERTED", conversation.getId(), dto));
        return dto;
    }

    /** Loads a conversation the user belongs to; 404 otherwise (does not reveal that it exists). */
    @Transactional(readOnly = true)
    public Conversation requireMembership(Long conversationId, Long userId) {
        if (conversationId == null || !members.existsByConversationIdAndUserId(conversationId, userId)) {
            throw ApiException.notFound("Conversation not found.");
        }
        return conversations.findById(conversationId)
                .orElseThrow(() -> ApiException.notFound("Conversation not found."));
    }

    /** Moves the user's read marker forward (never backwards) and tells the other members. */
    public void markRead(Long userId, Long conversationId, Long messageId) {
        ConversationMember member = members.findByConversationIdAndUserId(conversationId, userId)
                .orElseThrow(() -> ApiException.notFound("Conversation not found."));
        Long latestId = messages.findLatestId(conversationId).orElse(null);
        if (latestId == null || messageId == null) {
            return;
        }
        long target = Math.min(messageId, latestId);
        if (member.getLastReadMessageId() != null && member.getLastReadMessageId() >= target) {
            return;
        }
        member.setLastReadMessageId(target);
        events.toUsers(members.findUserIdsByConversationId(conversationId),
                new ChatEvent("READ", conversationId, new ReadStateDto(userId, target)));
    }

    @Transactional(readOnly = true)
    public void broadcastTyping(Long userId, Long conversationId, boolean typing) {
        if (conversationId == null || !members.existsByConversationIdAndUserId(conversationId, userId)) {
            return;
        }
        User user = users.findById(userId).orElse(null);
        if (user == null) {
            return;
        }
        List<Long> recipients = members.findUserIdsByConversationId(conversationId).stream()
                .filter(id -> !id.equals(userId))
                .toList();
        events.toUsers(recipients, new ChatEvent("TYPING", conversationId,
                new TypingDto(conversationId, mapper.summary(user), typing)));
    }

    private ConversationDto toDtoFor(Conversation conversation, Long viewerId) {
        Message last = messages.findLatestForConversations(List.of(conversation.getId())).stream().findFirst()
                .orElse(null);
        long unread = unreadCounts(viewerId).getOrDefault(conversation.getId(), 0L);
        return mapper.conversation(conversation, last == null ? null : mapper.message(last), unread);
    }

    private Map<Long, Long> unreadCounts(Long userId) {
        return messages.countUnreadByConversation(userId).stream()
                .collect(Collectors.toMap(row -> (Long) row[0], row -> (Long) row[1]));
    }

    private User requireUser(Long userId) {
        return users.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Your account no longer exists. Please sign up again."));
    }
}
