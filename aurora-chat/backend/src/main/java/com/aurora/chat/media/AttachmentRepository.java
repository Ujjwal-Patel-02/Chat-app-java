package com.aurora.chat.media;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AttachmentRepository extends JpaRepository<Attachment, String> {

    List<Attachment> findByMessageIsNullAndCreatedAtBefore(Instant cutoff);

    @Query("""
            select a from Attachment a join fetch a.message m join fetch m.sender
            where m.conversation.id = :conversationId and m.deleted = false
            order by m.id desc, a.position asc
            """)
    List<Attachment> findConversationMedia(@Param("conversationId") Long conversationId, Pageable pageable);

    @Query("""
            select a from Attachment a join fetch a.message m join fetch m.sender
            where m.conversation.id = :conversationId and m.deleted = false and m.id < :beforeMessageId
            order by m.id desc, a.position asc
            """)
    List<Attachment> findConversationMediaBefore(@Param("conversationId") Long conversationId,
                                                 @Param("beforeMessageId") Long beforeMessageId, Pageable pageable);
}
