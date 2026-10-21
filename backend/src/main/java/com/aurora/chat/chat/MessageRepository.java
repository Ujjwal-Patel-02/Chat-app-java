package com.aurora.chat.chat;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MessageRepository extends JpaRepository<Message, Long> {

    @EntityGraph(attributePaths = {"sender", "replyTo", "replyTo.sender"})
    List<Message> findByConversationIdOrderByIdDesc(Long conversationId, Pageable pageable);

    @EntityGraph(attributePaths = {"sender", "replyTo", "replyTo.sender"})
    List<Message> findByConversationIdAndIdLessThanOrderByIdDesc(Long conversationId, Long beforeId, Pageable pageable);

    /** The newest message of each given conversation. */
    @Query("""
            select m from Message m
            where m.id in (select max(m2.id) from Message m2
                           where m2.conversation.id in :conversationIds
                           group by m2.conversation.id)
            """)
    List<Message> findLatestForConversations(@Param("conversationIds") Collection<Long> conversationIds);

    /** Rows of [conversationId, unreadCount] for messages from others newer than the user's read marker. */
    @Query("""
            select m.conversation.id, count(m) from Message m, ConversationMember cm
            where cm.conversation.id = m.conversation.id
              and cm.user.id = :userId
              and m.sender.id <> :userId
              and m.deleted = false
              and m.id > coalesce(cm.lastReadMessageId, 0)
            group by m.conversation.id
            """)
    List<Object[]> countUnreadByConversation(@Param("userId") Long userId);

    @Query("select max(m.id) from Message m where m.conversation.id = :conversationId")
    Optional<Long> findLatestId(@Param("conversationId") Long conversationId);
}
